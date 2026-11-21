// Remote curated pricing overlay, read face for the dashboard (docs/cli-contract.md
// §2.16): the instance's token_pricing_overrides table assembled by
// GET /api/functions/token-usage-pricing, consumed here directly through the
// service-role data layer instead of HTTP (same database, zero extra hops).
//
// Precedence after this lands: cloud overlay > bundled selfhost-overrides >
// bundled curated-overrides > LiteLLM seed. Per-key shadow (cloud wins, union
// kept); the fuzzy list has no keys, so cloud entries are prepended ahead of
// bundled patterns. Validation mirrors the CLI's pricing/overlay.js: a
// malformed document is rejected WHOLE, never partially trusted — silently
// trusting half a document could underprice models the operator believes are
// pinned. Every read failure resolves to null (bundled behaviour), never
// throws: pricing is display-side data that must not fail a request.

import type { CuratedTables, Rates } from "./matcher";

type RateRow = {
  section?: unknown;
  model_key?: unknown;
  source?: unknown;
  value?: unknown;
  note?: unknown;
};

const MAX_TEXT = 200;
const MAX_NOTE = 2000;
const MAX_ENTRIES = 2000;
const SECTIONS = ["exact", "alias", "fuzzy", "source_exact"] as const;

type Section = (typeof SECTIONS)[number];

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

// Rates pass through only recognized fields; the server invents nothing and
// neither does the client.
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

type SelectFn = (
  table: string,
  options?: { select?: string },
) => Promise<Array<Record<string, unknown>>>;

// Reads + validates the overlay from the instance database through the given
// select seam (the service-role data layer in production, a fake in tests).
// Resolves { overlay, revision-ish row count } with `overlay: null` when the
// table is missing/empty/invalid; never rejects.
export async function loadPricingOverlayRows(
  selectImpl: SelectFn,
): Promise<{ overlay: CuratedTables | null; rows: number }> {
  let rows: Array<Record<string, unknown>>;

  try {
    rows = await selectImpl("token_pricing_overrides", { select: "*" });
  } catch {
    return { overlay: null, rows: 0 };
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    return { overlay: null, rows: 0 };
  }

  const overlay = buildOverlayFromRows(rows);

  return { overlay, rows: overlay ? countEntries(overlay) : 0 };
}

// Row assembly mirrors the pricing endpoint's rules exactly (section whitelist,
// per-row drop, deterministic ordering) so a direct-DB read can never diverge
// from what a CLI machine would receive over HTTP.
function buildOverlayFromRows(
  rows: Array<Record<string, unknown>>,
): CuratedTables | null {
  const exact: Record<string, Rates> = {};
  const alias: Record<string, string> = {};
  const fuzzy: Array<{ match: string; ref: string }> = [];
  const sourceExact: Record<string, Record<string, Rates>> = {};

  for (const row of rows) {
    const typed = row as RateRow;
    const section = SECTIONS.find((candidate) => candidate === typed.section);

    if (!section) continue;
    if (!isBoundedString(typed.model_key, MAX_TEXT)) continue;

    if (section === "exact") {
      if (typed.source) continue;
      const rates = normalizeRates(typed.value, typed.note);

      if (rates) exact[typed.model_key] = rates;
    } else if (section === "alias") {
      if (typed.source) continue;
      if (isBoundedString(typed.value, MAX_TEXT)) {
        alias[typed.model_key] = typed.value;
      }
    } else if (section === "fuzzy") {
      if (typed.source) continue;
      const ref = (typed.value as Record<string, unknown> | null)?.ref;

      if (isBoundedString(ref, MAX_TEXT)) {
        fuzzy.push({ match: typed.model_key, ref });
      }
    } else {
      if (!isBoundedString(typed.source, 64)) continue;
      const rates = normalizeRates(typed.value, typed.note);

      if (rates) {
        (sourceExact[typed.source] = sourceExact[typed.source] || {})[
          typed.model_key
        ] = rates;
      }
    }
  }

  fuzzy.sort(
    (a, b) => a.match.localeCompare(b.match) || a.ref.localeCompare(b.ref),
  );

  const overlay: CuratedTables = {
    exact,
    alias,
    source_exact: sourceExact,
    fuzzy,
  };

  if (
    Object.keys(overlay.exact).length +
      Object.keys(overlay.alias).length +
      overlay.fuzzy.length +
      Object.keys(overlay.source_exact).length ===
    0
  ) {
    return null;
  }

  return overlay;
}

function countEntries(overlay: CuratedTables): number {
  return (
    Object.keys(overlay.exact).length +
    Object.keys(overlay.alias).length +
    overlay.fuzzy.length +
    Object.values(overlay.source_exact).reduce(
      (sum, models) => sum + Object.keys(models).length,
      0,
    )
  );
}
