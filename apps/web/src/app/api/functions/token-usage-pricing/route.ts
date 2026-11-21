// GET /api/functions/token-usage-pricing — public. CLI face, frozen by
// docs/cli-contract.md §2.16 and §3 item 17.
//
// Serves the instance's curated pricing overlay in the same shape as the CLI's
// bundled curated-overrides.json, assembled from token_pricing_overrides rows.
// There is no auth and no request parameters: pricing data is public, and an
// empty/unseeded table must answer `overlay: null` — for every client that is
// byte-for-byte the "no overlay, bundled curated wins" behaviour that existed
// before this endpoint. Malformed rows are dropped here (never 500) so a bad
// edit by the instance owner degrades to "that entry missing", not "pricing
// endpoint broken"; the CLI validates the assembled document again anyway.

import { createHash } from "node:crypto";

import {
  errorResponse,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
} from "@/lib/api/http";
import { select } from "@/lib/api/supabase-rest";

export const dynamic = "force-dynamic";

const MAX_ENTRIES = 2000;
const MAX_TEXT = 200;
const MAX_NOTE = 2000;
const SECTIONS = ["exact", "alias", "fuzzy", "source_exact"] as const;

type Section = (typeof SECTIONS)[number];

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

// Rates pass through only recognized fields — the server invents nothing, so
// an assembled entry is byte-stable for the CLI's revision check.
function parseRates(
  value: unknown,
  note: unknown,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;

  if (!isFiniteNonNegative(raw.input) || !isFiniteNonNegative(raw.output))
    return null;
  const entry: Record<string, unknown> = {
    input: raw.input,
    output: raw.output,
  };

  for (const field of ["cache_read", "cache_write"] as const) {
    if (raw[field] !== undefined) {
      if (!isFiniteNonNegative(raw[field])) return null;
      entry[field] = raw[field];
    }
  }
  if (typeof note === "string" && note.length > 0 && note.length <= MAX_NOTE) {
    entry.note = note;
  }

  return entry;
}

function isBoundedString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

// Row → section entry; null drops the row (logged, never fatal).
function parseRow(
  row: Record<string, unknown>,
): { section: Section; key: string; source: string; entry: unknown } | null {
  const section = SECTIONS.find((candidate) => candidate === row.section);

  if (!section) return null;
  const modelKey = row.model_key;

  if (!isBoundedString(modelKey, MAX_TEXT)) return null;

  if (section === "exact") {
    // A source on an exact row is malformed: source-scoped rates belong to
    // source_exact where the source names the scoped collection.
    if (row.source) return null;
    const rates = parseRates(row.value, row.note);

    return rates ? { section, key: modelKey, source: "", entry: rates } : null;
  }

  if (section === "alias") {
    if (row.source) return null;
    const target = row.value;

    if (!isBoundedString(target, MAX_TEXT)) return null;

    return { section, key: modelKey, source: "", entry: target };
  }

  if (section === "fuzzy") {
    if (row.source) return null;
    const ref = (row.value as Record<string, unknown> | null)?.ref;

    if (!isBoundedString(ref, MAX_TEXT)) return null;

    return { section, key: modelKey, source: "", entry: { ref } };
  }

  // source_exact: the source names the scoped collection and must be present.
  if (!isBoundedString(row.source, 64)) return null;
  const rates = parseRates(row.value, row.note);

  return rates
    ? { section, key: modelKey, source: row.source, entry: rates }
    : null;
}

function sortKeys(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const key of Object.keys(record).sort()) out[key] = record[key];

  return out;
}

// Deterministic assembly: keys lexicographic within each section (fuzzy by
// match), sections filled in exact → alias → fuzzy → source_exact order up to
// the 2000-entry cap, so the same table content always yields the same
// document and therefore the same revision.
function assembleOverlay(
  rows: Record<string, unknown>[],
): Record<string, unknown> | null {
  const exact: Record<string, unknown> = {};
  const alias: Record<string, unknown> = {};
  const fuzzy: Record<string, unknown>[] = [];
  const sourceExact: Record<string, Record<string, unknown>> = {};

  for (const row of rows) {
    const parsed = parseRow(row);

    if (!parsed) continue;
    if (parsed.section === "exact") exact[parsed.key] = parsed.entry;
    else if (parsed.section === "alias") alias[parsed.key] = parsed.entry;
    else if (parsed.section === "fuzzy")
      fuzzy.push({
        match: parsed.key,
        ref: (parsed.entry as { ref: string }).ref,
      });
    else {
      (sourceExact[parsed.source] ||= {})[parsed.key] = parsed.entry;
    }
  }

  fuzzy.sort(
    (a, b) =>
      (a.match as string).localeCompare(b.match as string) ||
      (a.ref as string).localeCompare(b.ref as string),
  );

  let budget = MAX_ENTRIES;
  const take = (count: number) => Math.max(0, Math.min(count, budget));
  const overlay: Record<string, unknown> = {};

  const exactEntries = Object.entries(sortKeys(exact)).slice(
    0,
    take(Object.keys(exact).length),
  );

  budget -= exactEntries.length;
  if (exactEntries.length) overlay.exact = Object.fromEntries(exactEntries);

  const aliasEntries = Object.entries(sortKeys(alias)).slice(
    0,
    take(Object.keys(alias).length),
  );

  budget -= aliasEntries.length;
  if (aliasEntries.length) overlay.alias = Object.fromEntries(aliasEntries);

  const fuzzyEntries = fuzzy.slice(0, take(fuzzy.length));

  budget -= fuzzyEntries.length;
  if (fuzzyEntries.length) overlay.fuzzy = fuzzyEntries;

  const sourceExactSorted = sortKeys(sourceExact) as Record<
    string,
    Record<string, unknown>
  >;
  const sourceExactOut: Record<string, Record<string, unknown>> = {};

  for (const source of Object.keys(sourceExactSorted)) {
    const entries = Object.entries(sourceExactSorted[source]).slice(
      0,
      take(Object.keys(sourceExactSorted[source]).length),
    );

    budget -= entries.length;
    if (entries.length) sourceExactOut[source] = Object.fromEntries(entries);
  }
  if (Object.keys(sourceExactOut).length) overlay.source_exact = sourceExactOut;

  return Object.keys(overlay).length ? overlay : null;
}

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export async function GET() {
  try {
    const rows = await select("token_pricing_overrides", { select: "*" });
    const overlay = assembleOverlay(rows);
    // revision is derived from the canonical document (stable across identical
    // content), so machines can compare revisions to confirm they see the same
    // rates. Opaque by contract — clients must not parse it.
    const revision = createHash("sha256")
      .update(JSON.stringify(overlay))
      .digest("hex")
      .slice(0, 16);

    return jsonResponse(200, { revision, overlay });
  } catch (error) {
    return errorResponse(error);
  }
}
