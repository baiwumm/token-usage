// Remote curated pricing overlay, desktop read face (docs/cli-contract.md
// §2.16): fetched from the instance's public pricing endpoint — no auth, no
// secrets, CORS enabled by the contract — and validated with the same rules
// as the CLI and web clients. This deliberately ends the D10.1 "desktop never
// makes outbound pricing requests" stance (2026-11-22, operator-approved):
// the request is a single public GET per 24h in-memory TTL, and a failure
// degrades to the bundled tables exactly like every other client.
//
// No disk cache: the Rust bridge is read-only by design (the CLI stays the
// sole writer of tracker files), so the overlay lives in module memory — one
// fetch per app launch plus a refresh per TTL while the app runs.
//
// Precedence after this lands: cloud overlay > bundled selfhost-overrides >
// bundled curated-overrides > LiteLLM seed. Per-key shadow (cloud wins, union
// kept); cloud fuzzy patterns are prepended ahead of bundled ones. A
// malformed document is rejected WHOLE, never partially trusted; every
// failure resolves to null (bundled behaviour) and never throws.

import type { CuratedTables, Rates } from "./pricing-matcher";

const MAX_TEXT = 200;
const MAX_NOTE = 2000;
const MAX_ENTRIES = 2000;

export type OverlayFetchResult = {
  overlay: CuratedTables | null;
  revision: string;
};

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

function normalizeRates(value: unknown, note: unknown): Rates | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (!isFiniteNonNegative(raw.input) || !isFiniteNonNegative(raw.output))
    return null;
  const rates: Rates = { input: raw.input, output: raw.output };

  for (const field of [
    "cache_read",
    "cache_write",
    "priority_multiplier",
  ] as const) {
    if (raw[field] !== undefined) {
      if (!isFiniteNonNegative(raw[field])) return null;
      rates[field] = raw[field];
    }
  }
  if (typeof note === "string" && note.length > 0 && note.length <= MAX_NOTE) {
    rates.note = note;
  }

  return rates;
}

// Returns the normalized overlay tables, or null when the document is absent
// or malformed (partial validity is rejected whole).
export function validateOverlayDoc(doc: unknown): CuratedTables | null {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const raw = doc as Record<string, unknown>;
  const out: Partial<CuratedTables> = {};
  let entries = 0;

  if (raw.exact !== undefined) {
    if (!raw.exact || typeof raw.exact !== "object" || Array.isArray(raw.exact))
      return null;
    const exact: Record<string, Rates> = {};

    for (const [key, value] of Object.entries(
      raw.exact as Record<string, unknown>,
    )) {
      if (!isBoundedString(key, MAX_TEXT)) return null;
      const rates = normalizeRates(value, undefined);

      if (!rates) return null;
      exact[key] = rates;
      entries += 1;
    }
    if (entries) out.exact = exact;
  }

  if (raw.alias !== undefined) {
    if (!raw.alias || typeof raw.alias !== "object" || Array.isArray(raw.alias))
      return null;
    const alias: Record<string, string> = {};

    for (const [key, target] of Object.entries(
      raw.alias as Record<string, unknown>,
    )) {
      if (!isBoundedString(key, MAX_TEXT) || !isBoundedString(target, MAX_TEXT))
        return null;
      alias[key] = target;
      entries += 1;
    }
    if (entries) out.alias = alias;
  }

  if (raw.fuzzy !== undefined) {
    if (!Array.isArray(raw.fuzzy)) return null;
    const fuzzy: Array<{ match: string; ref: string }> = [];

    for (const item of raw.fuzzy) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const candidate = item as { match?: unknown; ref?: unknown };

      if (
        !isBoundedString(candidate.match, MAX_TEXT) ||
        !isBoundedString(candidate.ref, MAX_TEXT)
      )
        return null;
      fuzzy.push({ match: candidate.match, ref: candidate.ref });
      entries += 1;
    }
    if (entries) out.fuzzy = fuzzy;
  }

  if (raw.source_exact !== undefined) {
    if (
      !raw.source_exact ||
      typeof raw.source_exact !== "object" ||
      Array.isArray(raw.source_exact)
    )
      return null;
    const sourceExact: Record<string, Record<string, Rates>> = {};

    for (const [source, models] of Object.entries(
      raw.source_exact as Record<string, unknown>,
    )) {
      if (!isBoundedString(source, 64)) return null;
      if (!models || typeof models !== "object" || Array.isArray(models))
        return null;
      const scoped: Record<string, Rates> = {};

      for (const [key, value] of Object.entries(
        models as Record<string, unknown>,
      )) {
        if (!isBoundedString(key, MAX_TEXT)) return null;
        const rates = normalizeRates(value, undefined);

        if (!rates) return null;
        scoped[key] = rates;
        entries += 1;
      }
      if (Object.keys(scoped).length) sourceExact[source] = scoped;
    }
    if (entries) out.source_exact = sourceExact;
  }

  if (entries > MAX_ENTRIES) return null;
  if (!entries) return null;

  return {
    exact: out.exact || {},
    alias: out.alias || {},
    source_exact: out.source_exact || {},
    fuzzy: out.fuzzy || [],
  };
}

// Keyed sections shadow per key; cloud fuzzy patterns are consulted first.
export function mergeOverlayDocs(
  base: CuratedTables,
  overlay: CuratedTables,
): CuratedTables {
  const merged: CuratedTables = {
    exact: { ...base.exact, ...overlay.exact },
    alias: { ...base.alias, ...overlay.alias },
    source_exact: {},
    fuzzy: [...overlay.fuzzy, ...base.fuzzy],
  };

  const sources = new Set([
    ...Object.keys(base.source_exact || {}),
    ...Object.keys(overlay.source_exact || {}),
  ]);

  for (const source of sources) {
    merged.source_exact[source] = {
      ...(base.source_exact[source] || {}),
      ...(overlay.source_exact[source] || {}),
    };
  }

  return merged;
}

// Fetches + validates the instance overlay over HTTP (the public §2.16
// endpoint). Resolves { overlay, revision } with `overlay: null` when the
// endpoint is unreachable, not deployed, or serving an empty/malformed table;
// never rejects.
export async function fetchPricingOverlay({
  baseUrl,
  fetchImpl = fetch,
  timeoutMs = 10_000,
}: {
  baseUrl?: string | null;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<OverlayFetchResult> {
  const root = String(baseUrl || "")
    .trim()
    .replace(/\/$/, "");
  const url = root ? `${root}/api/functions/token-usage-pricing` : "";

  if (!/^https?:\/\//.test(url)) {
    return { overlay: null, revision: "" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(url, { signal: controller.signal });

    if (!response.ok) {
      return { overlay: null, revision: "" };
    }
    const body = (await response.json()) as {
      revision?: unknown;
      overlay?: unknown;
    };

    if (!body || typeof body !== "object") {
      return { overlay: null, revision: "" };
    }
    const overlay = validateOverlayDoc(body.overlay);

    return {
      overlay,
      revision: typeof body.revision === "string" ? body.revision : "",
    };
  } catch {
    return { overlay: null, revision: "" };
  } finally {
    clearTimeout(timer);
  }
}
