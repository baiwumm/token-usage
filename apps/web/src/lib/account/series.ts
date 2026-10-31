// Account-wide series aggregation — ports api/_lib/account-series.js as a pure
// module. Response schemas are frozen by docs/cli-contract.md §2.7.
//
// Semantics carried over from the reference edge functions:
//   - tz / tz_offset_minutes bucket rows to the caller's local day/hour.
//   - A `device_id` filter switches to the per-device view: machine-level
//     rows of that device only; account-level sources (Cursor dedupe, TRAE CN
//     session states) are excluded entirely.
//   - Monthly buckets stay UTC.
//   - Cost is computed at read time by the vendored static pricing engine.

import {
  computeRowCost,
  getModelPricingInfo,
  type PricingInfo,
} from "@/lib/pricing";

export const ACCOUNT_LEVEL_SOURCES = new Set(["cursor", "trae-cn"]);

export const MAX_RANGE_DAYS = 1095; // Same 3-year clamp as the reference daily series.
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export type UsageRow = Record<string, unknown>;
export type TzContext = {
  timeZone: string | null;
  offsetMinutes: number | null;
};

export function numberOr0(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseTzContext(searchParams: URLSearchParams): TzContext {
  const tz = String(searchParams.get("tz") || "").trim();
  const rawOffset = Number(searchParams.get("tz_offset_minutes"));

  return {
    timeZone: tz || null,
    offsetMinutes: Number.isFinite(rawOffset) ? Math.trunc(rawOffset) : null,
  };
}

// One Intl.DateTimeFormat per zone id: bucketing would otherwise construct
// one per row, and construction dominates that loop. Zone strings come from
// callers, so the table caps itself.
const zonedFormatters = new Map<string, Intl.DateTimeFormat>();
const ZONED_FORMATTER_CAP = 64;

function zonedFormatter(timeZone: string): Intl.DateTimeFormat | null {
  const hit = zonedFormatters.get(timeZone);

  if (hit) return hit;
  try {
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });

    if (zonedFormatters.size >= ZONED_FORMATTER_CAP) zonedFormatters.clear();
    zonedFormatters.set(timeZone, formatter);

    return formatter;
  } catch {
    // Invalid zone id: callers fall through to the numeric offset.
    return null;
  }
}

// UTC timestamp → the caller's local wall-clock parts: IANA zone via Intl when
// valid, else the fixed numeric offset, else UTC — the fallback is fixed so
// the bucket day never depends on the server's own timezone.
export function zonedParts(
  date: Date | string,
  context: Partial<TzContext> = {},
) {
  const ms = date instanceof Date ? date.getTime() : Date.parse(date);

  if (!Number.isFinite(ms)) return null;
  const { timeZone, offsetMinutes } = context;

  if (timeZone) {
    const formatter = zonedFormatter(timeZone);

    if (formatter) {
      const parts = formatter.formatToParts(new Date(ms));
      const values: Record<string, string> = {};

      for (const part of parts)
        if (part.type && part.value) values[part.type] = part.value;
      const out = {
        year: Number(values.year),
        month: Number(values.month),
        day: Number(values.day),
        hour: Number(values.hour),
      };

      if ([out.year, out.month, out.day, out.hour].every(Number.isFinite))
        return out;
    }
  }
  if (Number.isFinite(offsetMinutes)) {
    const shifted = new Date(ms + (offsetMinutes as number) * 60000);

    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
    };
  }
  const utc = new Date(ms);

  return {
    year: utc.getUTCFullYear(),
    month: utc.getUTCMonth() + 1,
    day: utc.getUTCDate(),
    hour: utc.getUTCHours(),
  };
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function dayKeyOf(parts: { year: number; month: number; day: number }): string {
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

export function zonedDayKey(
  date: Date | string,
  tzContext: Partial<TzContext>,
): string | null {
  const parts = zonedParts(date, tzContext);

  return parts ? dayKeyOf(parts) : null;
}

export function isValidDayKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    DAY_KEY_RE.test(value) &&
    Number.isFinite(Date.parse(`${value}T00:00:00Z`))
  );
}

// Clamp `from` so to - from never exceeds MAX_RANGE_DAYS.
export function boundRangeStart(from: string, to: string): string {
  const fromMs = Date.parse(`${from}T00:00:00Z`);
  const toMs = Date.parse(`${to}T00:00:00Z`);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs <= fromMs)
    return from;
  const maxFromMs = toMs - MAX_RANGE_DAYS * 86400000;

  if (fromMs < maxFromMs) return new Date(maxFromMs).toISOString().slice(0, 10);

  return from;
}

export function uuidOrNull(value: unknown): string | null {
  const raw = String(value || "").trim();

  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    raw,
  )
    ? raw
    : null;
}

// Rows backing a request. Without a device filter this is the canonical
// cross-device set; with one it is that device's machine-level hourly rows
// only — account-level sources are excluded entirely.
export function rowsForRequest(
  usage: { hourly: UsageRow[]; canonicalRows: UsageRow[] },
  deviceId?: string | null,
): UsageRow[] {
  if (!deviceId) return usage.canonicalRows;
  const rows = usage.hourly.filter((row) => {
    if (row.device_id !== deviceId) return false;
    const source = String(row.source || "").toLowerCase();

    return !ACCOUNT_LEVEL_SOURCES.has(source);
  });

  return rows;
}

export type SeriesBucket = {
  day?: string;
  hour?: string;
  month?: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  conversation_count: number;
  /** Vendor credits (docs/cli-contract.md §2.4, 2026-10-31) — display-only. */
  credits: number;
  models: Record<string, number>;
};

function emptyBucket(
  key: string,
  keyField: "day" | "hour" | "month",
): SeriesBucket {
  return {
    [keyField]: key,
    total_tokens: 0,
    billable_total_tokens: 0,
    total_cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    reasoning_output_tokens: 0,
    conversation_count: 0,
    credits: 0,
    models: {},
  } as SeriesBucket;
}

// Read-time cost for one bucket row from the vendored static pricing engine.
export function rowCost(row: UsageRow): number {
  const computed = computeRowCost(row);

  return Number.isFinite(computed) ? computed : 0;
}

function addRowToBucket(bucket: SeriesBucket, row: UsageRow): void {
  const total = numberOr0(row.total_tokens);

  bucket.total_tokens += total;
  bucket.billable_total_tokens +=
    row.billable_total_tokens == null
      ? total
      : numberOr0(row.billable_total_tokens);
  bucket.total_cost_usd += rowCost(row);
  bucket.input_tokens += numberOr0(row.input_tokens);
  bucket.output_tokens += numberOr0(row.output_tokens);
  bucket.cached_input_tokens += numberOr0(row.cached_input_tokens);
  bucket.cache_creation_input_tokens += numberOr0(
    row.cache_creation_input_tokens,
  );
  bucket.reasoning_output_tokens += numberOr0(row.reasoning_output_tokens);
  bucket.conversation_count += numberOr0(
    row.conversations ?? row.conversation_count,
  );
  // Credits never merge into any token column — a display-only dimension
  // (docs/sources-capture-audit.md §2), rounded to 6 decimals like the CLI.
  bucket.credits =
    Math.round((bucket.credits + numberOr0(row.credits)) * 1e6) / 1e6;
  const model = String(row.model || "").trim() || "unknown";

  bucket.models[model] = (bucket.models[model] || 0) + total;
}

/** Tz-local daily buckets, sorted by day. */
export function dailySeries(
  rows: UsageRow[],
  tzContext: Partial<TzContext>,
): SeriesBucket[] {
  const byDay = new Map<string, SeriesBucket>();

  for (const row of rows) {
    if (!row.hour_start) continue;
    const day = zonedDayKey(String(row.hour_start), tzContext);

    if (!day) continue;
    let bucket = byDay.get(day);

    if (!bucket) {
      bucket = emptyBucket(day, "day");
      byDay.set(day, bucket);
    }
    addRowToBucket(bucket, row);
  }

  return Array.from(byDay.values()).sort((a, b) =>
    (a.day || "").localeCompare(b.day || ""),
  );
}

/** Tz-local hourly buckets of one requested day, sorted by hour. */
export function hourlySeriesForDay(
  rows: UsageRow[],
  day: string,
  tzContext: Partial<TzContext>,
): SeriesBucket[] {
  const dayStartMs = Date.parse(`${day}T00:00:00Z`);

  if (!Number.isFinite(dayStartMs)) return [];

  // Coarse UTC pre-filter: any tz-local bucket of `day` lies within ±15h of
  // the day's UTC midnight (the IANA offset range is −12..+14). Parsing to ms
  // per row is far cheaper than running zonedParts over the whole history.
  const windowStartMs = dayStartMs - 15 * 3_600_000;
  const windowEndMs = dayStartMs + 24 * 3_600_000 + 15 * 3_600_000;
  const byHour = new Map<string, SeriesBucket>();

  for (const row of rows) {
    if (!row.hour_start) continue;
    const startMs = Date.parse(String(row.hour_start));

    if (
      !Number.isFinite(startMs) ||
      startMs < windowStartMs ||
      startMs > windowEndMs
    ) {
      continue;
    }
    const parts = zonedParts(new Date(startMs), tzContext);

    if (!parts || dayKeyOf(parts) !== day) continue;
    const hourKey = `${day}T${pad2(parts.hour)}:00:00`;
    let bucket = byHour.get(hourKey);

    if (!bucket) {
      bucket = emptyBucket(hourKey, "hour");
      byHour.set(hourKey, bucket);
    }
    addRowToBucket(bucket, row);
  }

  return Array.from(byHour.values()).sort((a, b) =>
    (a.hour || "").localeCompare(b.hour || ""),
  );
}

/** UTC monthly buckets whose month intersects [from, to], sorted by month. */
export function monthlySeries(
  rows: UsageRow[],
  from: string,
  to: string,
): SeriesBucket[] {
  const fromMonth = String(from || "").slice(0, 7);
  const toMonth = String(to || "").slice(0, 7);
  const byMonth = new Map<string, SeriesBucket>();

  for (const row of rows) {
    if (!row.hour_start) continue;
    const start = Date.parse(String(row.hour_start));

    if (!Number.isFinite(start)) continue;
    const month = new Date(start).toISOString().slice(0, 7);

    if (fromMonth && month < fromMonth) continue;
    if (toMonth && month > toMonth) continue;
    let bucket = byMonth.get(month);

    if (!bucket) {
      bucket = emptyBucket(month, "month");
      byMonth.set(month, bucket);
    }
    addRowToBucket(bucket, row);
  }

  return Array.from(byMonth.values()).sort((a, b) =>
    (a.month || "").localeCompare(b.month || ""),
  );
}

/**
 * Heatmap grid: one cell per calendar day in [from, to], tz-local, with the
 * shared 4-level scale (level is a function of the max billable day).
 */
export function heatmapCells(
  rows: UsageRow[],
  {
    from,
    to,
    tzContext,
  }: { from: string; to: string; tzContext: Partial<TzContext> },
): {
  cells: Array<{
    day: string;
    total_tokens: number;
    billable_total_tokens: number;
    level: number;
    models: Record<string, number> | null;
    sources: Record<string, number> | null;
  }>;
  maxValue: number;
  totalCostUsd: number;
} {
  const byDay = new Map<
    string,
    {
      total_tokens: number;
      billable_total_tokens: number;
      total_cost_usd: number;
      models: Record<string, number>;
      sources: Record<string, number>;
    }
  >();
  let totalCostUsd = 0;

  for (const row of rows) {
    if (!row.hour_start) continue;
    const day = zonedDayKey(String(row.hour_start), tzContext);

    if (!day || day < from || day > to) continue;
    let bucket = byDay.get(day);

    if (!bucket) {
      bucket = {
        total_tokens: 0,
        billable_total_tokens: 0,
        total_cost_usd: 0,
        models: {},
        sources: {},
      };
      byDay.set(day, bucket);
    }
    const total = numberOr0(row.total_tokens);

    bucket.total_tokens += total;
    bucket.billable_total_tokens +=
      row.billable_total_tokens == null
        ? total
        : numberOr0(row.billable_total_tokens);
    bucket.total_cost_usd += rowCost(row);
    totalCostUsd += rowCost(row);
    const model = String(row.model || "").trim() || "unknown";

    bucket.models[model] = (bucket.models[model] || 0) + total;
    const source = String(row.source || "").trim() || "unknown";

    bucket.sources[source] = (bucket.sources[source] || 0) + total;
  }

  const maxValue = Math.max(
    0,
    ...Array.from(byDay.values()).map((d) => d.billable_total_tokens),
  );
  const levelOf = (value: number): number => {
    if (value <= 0) return 0;
    if (maxValue === 0) return 1;
    const ratio = value / maxValue;

    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;

    return 4;
  };

  const cells: Array<{
    day: string;
    total_tokens: number;
    billable_total_tokens: number;
    level: number;
    models: Record<string, number> | null;
    sources: Record<string, number> | null;
  }> = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);

  while (cursor <= end) {
    const day = cursor.toISOString().slice(0, 10);
    const hit = byDay.get(day);
    const billable = hit ? hit.billable_total_tokens : 0;

    cells.push({
      day,
      total_tokens: hit ? hit.total_tokens : 0,
      billable_total_tokens: billable,
      level: levelOf(billable),
      models: hit ? hit.models : null,
      sources: hit ? hit.sources : null,
    });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return { cells, maxValue, totalCostUsd };
}

// Sparse wire format consumed by the dashboard's heatmap compaction.
export function heatmapCompactWire({
  from,
  to,
  weekStartsOn,
  cells,
  maxValue,
}: {
  from: string;
  to: string;
  weekStartsOn: string;
  cells: Array<{
    day: string;
    total_tokens: number;
    billable_total_tokens: number;
    models: Record<string, number> | null;
  }>;
  maxValue: number;
}) {
  const modelNames: string[] = [];
  const modelIndex = new Map<string, number>();
  const days = cells
    .filter((cell) => cell.models !== null)
    .map((cell) => {
      const pairs: number[] = [];

      for (const name of Object.keys(cell.models as Record<string, number>)) {
        let index = modelIndex.get(name);

        if (index === undefined) {
          index = modelNames.length;
          modelNames.push(name);
          modelIndex.set(name, index);
        }
        pairs.push(index, (cell.models as Record<string, number>)[name]);
      }

      return [cell.day, cell.total_tokens, pairs];
    });

  return {
    format: "compact" as const,
    from,
    to,
    week_starts_on: weekStartsOn,
    active_days: cells.filter((cell) => cell.billable_total_tokens > 0).length,
    streak_days: 0 as const,
    max_value: maxValue,
    model_names: modelNames,
    days,
  };
}

export type BreakdownTotals = {
  total_tokens: number;
  billable_total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  total_cost_usd: number;
  /** Vendor credits (docs/cli-contract.md §2.4, 2026-10-31) — display-only. */
  credits: number;
};

// Wire variant: model-breakdown prints costs as fixed 6-decimal strings.
type PrintedTotals = Omit<BreakdownTotals, "total_cost_usd"> & {
  total_cost_usd: string;
};

function modelBreakdownTotals(): BreakdownTotals {
  return {
    total_tokens: 0,
    billable_total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    reasoning_output_tokens: 0,
    total_cost_usd: 0,
    credits: 0,
  };
}

function addRowToTotals(totals: BreakdownTotals, row: UsageRow): void {
  const total = numberOr0(row.total_tokens);

  totals.total_tokens += total;
  totals.billable_total_tokens +=
    row.billable_total_tokens == null
      ? total
      : numberOr0(row.billable_total_tokens);
  totals.input_tokens += numberOr0(row.input_tokens);
  totals.output_tokens += numberOr0(row.output_tokens);
  totals.cached_input_tokens += numberOr0(row.cached_input_tokens);
  totals.cache_creation_input_tokens += numberOr0(
    row.cache_creation_input_tokens,
  );
  totals.reasoning_output_tokens += numberOr0(row.reasoning_output_tokens);
  totals.total_cost_usd += rowCost(row);
  totals.credits =
    Math.round((totals.credits + numberOr0(row.credits)) * 1e6) / 1e6;
}

// (source, model) breakdown over [from, to], tz-local. Each model carries the
// provenance of the rates its cost came from; cost_source distinguishes rows
// billable from a persisted provider-reported cost (grok/cline) from
// model-rate pricing.
export function modelBreakdownSources(
  rows: UsageRow[],
  {
    from,
    to,
    tzContext,
  }: { from: string; to: string; tzContext: Partial<TzContext> },
): Array<{
  source: string;
  totals: PrintedTotals;
  models: Array<{
    model: string;
    model_id: string;
    pricing: PricingInfo;
    cost_source: string | null;
    totals: PrintedTotals;
  }>;
}> {
  const bySource = new Map<
    string,
    {
      source: string;
      totals: BreakdownTotals;
      models: Map<
        string,
        {
          model: string;
          model_id: string;
          cost_source: string | null;
          totals: BreakdownTotals;
        }
      >;
    }
  >();

  for (const row of rows) {
    if (!row.hour_start) continue;
    const day = zonedDayKey(String(row.hour_start), tzContext);

    if (!day || day < from || day > to) continue;
    const source = String(row.source || "").trim() || "unknown";
    const model = String(row.model || "").trim() || "unknown";
    let sourceAgg = bySource.get(source);

    if (!sourceAgg) {
      sourceAgg = { source, totals: modelBreakdownTotals(), models: new Map() };
      bySource.set(source, sourceAgg);
    }
    addRowToTotals(sourceAgg.totals, row);
    let modelAgg = sourceAgg.models.get(model);

    if (!modelAgg) {
      modelAgg = {
        model,
        model_id: model,
        cost_source: null,
        totals: modelBreakdownTotals(),
      };
      sourceAgg.models.set(model, modelAgg);
    }
    const costSource =
      ["grok", "cline"].includes(source) && Number(row.total_cost_usd) > 0
        ? "provider_reported"
        : "model_pricing";

    modelAgg.cost_source =
      modelAgg.cost_source && modelAgg.cost_source !== costSource
        ? "mixed"
        : costSource;
    addRowToTotals(modelAgg.totals, row);
  }

  return Array.from(bySource.values())
    .map((sourceAgg) => {
      const models = Array.from(sourceAgg.models.values())
        .map((modelAgg) => ({
          model: modelAgg.model,
          model_id: modelAgg.model_id,
          pricing: getModelPricingInfoFor(modelAgg.model, sourceAgg.source),
          cost_source: modelAgg.cost_source,
          totals: {
            ...modelAgg.totals,
            total_cost_usd: modelAgg.totals.total_cost_usd.toFixed(6),
          },
        }))
        .sort((a, b) => b.totals.total_tokens - a.totals.total_tokens);
      const sourceCost = models.reduce(
        (sum, model) => sum + Number(model.totals.total_cost_usd),
        0,
      );

      return {
        source: sourceAgg.source,
        totals: { ...sourceAgg.totals, total_cost_usd: sourceCost.toFixed(6) },
        models,
      };
    })
    .sort((a, b) => b.totals.total_tokens - a.totals.total_tokens);
}

function getModelPricingInfoFor(model: string, source: string): PricingInfo {
  return getModelPricingInfo(model, { source });
}

// Per-device totals for [from, to] (machine-level sources only) plus the
// account-level split.
export function deviceTotals(
  usage: { canonicalRows: UsageRow[]; deviceRows: UsageRow[] },
  {
    from,
    to,
    tzContext,
  }: { from: string; to: string; tzContext: Partial<TzContext> },
): {
  devices: Array<{
    id: string;
    device_name: string;
    platform: string | null;
    created_at: string | null;
    total_tokens: number;
    default_device_name: string | null;
  }>;
  accountSources: Array<{ source: string; total_tokens: number }>;
} {
  const machineRows: UsageRow[] = [];
  const accountRows: UsageRow[] = [];

  for (const row of usage.canonicalRows) {
    const source = String(row.source || "").toLowerCase();

    if (ACCOUNT_LEVEL_SOURCES.has(source)) accountRows.push(row);
    else machineRows.push(row);
  }

  const inRange = (row: UsageRow): boolean => {
    const day = zonedDayKey(String(row.hour_start), tzContext);

    return day != null && day >= from && day <= to;
  };

  const perDevice = new Map<string, number>();

  for (const row of machineRows) {
    if (!row.device_id || !inRange(row)) continue;
    perDevice.set(
      String(row.device_id),
      (perDevice.get(String(row.device_id)) || 0) + numberOr0(row.total_tokens),
    );
  }

  const devices = usage.deviceRows
    .filter((device) => !device.revoked_at)
    .map((device) => ({
      id: String(device.id),
      device_name: String(device.device_name || "Unnamed device"),
      platform: (device.platform as string | null) || null,
      created_at: (device.created_at as string | null) || null,
      total_tokens: perDevice.get(String(device.id)) || 0,
      default_device_name:
        (device.default_device_name as string | null) || null,
    }))
    .sort((a, b) => b.total_tokens - a.total_tokens);

  const accountBySource = new Map<string, number>();

  for (const row of accountRows) {
    if (!inRange(row)) continue;
    const source = String(row.source || "").toLowerCase();

    accountBySource.set(
      source,
      (accountBySource.get(source) || 0) + numberOr0(row.total_tokens),
    );
  }
  const accountSources = Array.from(accountBySource.entries())
    .map(([source, totalTokens]) => ({ source, total_tokens: totalTokens }))
    .sort((a, b) => b.total_tokens - a.total_tokens);

  return { devices, accountSources };
}
