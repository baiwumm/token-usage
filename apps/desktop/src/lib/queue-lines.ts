// Parser + aggregator for the CLI's local queue baseline
// (`~/.tokenusage/tracker/queue.jsonl`). Each line is one hourly bucket
// snapshot `{source, model, hour_start, ...token splits, project_key?}` and
// the file is the reconciliation baseline (AGENTS.md constraint 8): for the
// same bucket key `(hour_start, source, model, project_key)` the LAST line
// wins — lines are full bucket values, not deltas. The desktop monitor reads
// the file read-only and aggregates with the same last-wins rule so its
// numbers reconcile with `tokenusage reconcile` and the web dashboard.
//
// NOTE: the file may contain a torn tail line while the CLI appends; parsing
// is line-tolerant (bad lines skipped, never fatal).
//
// Cost caliber (2026-11-11 D10.1): the collector writes `total_cost_usd: 0`
// — pricing happens read-time on the web from the vendored LiteLLM snapshot.
// The desktop carries the same engine (lib/pricing.ts) so every aggregation
// here costs a row exactly like the dashboard; an authoritative positive
// reporter value (e.g. Grok) still wins, matching web's computeRowCost.

import { computeRowCost } from "@/lib/pricing";

export interface QueueBucketRow {
  source: string;
  model: string;
  hourStart: string;
  projectKey: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  billableTotalTokens: number | null;
  /** Collector-reported cost; a positive authoritative value wins over read-time pricing. */
  totalCostUsd: number;
  conversationCount: number;
  credits: number;
}

export interface SourceUsage {
  source: string;
  tokens: number;
  conversations: number;
  share: number;
  /** Read-time priced cost summed over the group (web Top 模型/成本列口径). */
  totalCostUsd: number;
}

/** Model mix row (raw collector-reported model string, never canonicalized). */
export interface ModelUsage {
  model: string;
  tokens: number;
  conversations: number;
  /** Share of the window total (not of the model subtotal). */
  share: number;
  totalCostUsd: number;
}

/** Project mix row; `projectKey` is `""` filtered out of the list. */
export interface ProjectUsage {
  projectKey: string;
  tokens: number;
  conversations: number;
  /** Share of the window total (not of the attributed subtotal). */
  share: number;
  totalCostUsd: number;
  /** Newest bucket start seen for the project (最近活跃, hour precision). */
  lastActiveMs: number | null;
  /** Raw source → tokens inside the project (icon strip + detail rows). */
  sourceTokens: Record<string, number>;
}

export interface UsageWindow {
  totalTokens: number;
  conversations: number;
  sources: SourceUsage[];
  models: ModelUsage[];
  /** Only rows with a non-empty `project_key`. */
  projects: ProjectUsage[];
  /** Tokens carrying a project key (the rest is the unattributed residual). */
  attributedTokens: number;
  /** Window total from the read-time pricing engine (预计费用). */
  totalCostUsd: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  credits: number;
  /** (cached + cache_creation) / total, 0 when the window is empty. */
  cacheRate: number;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Read-time cost for one bucket row: the web engine's own rule — an
 * authoritative positive reporter value wins, everything else is priced from
 * the vendored snapshot (0 for local/subscription sources). The engine reads
 * the WIRE field names (`input_tokens`, `cached_input_tokens`, …), so the
 * camelCase row is re-keyed here; `computeRowCost`'s internal WeakMap keys off
 * the object identity, and this re-keyed view is created per call — the
 * desktop aggregates whole files, so the cost is memoized on the row below.
 */
export function rowCostUsd(row: QueueBucketRow): number {
  if (row.totalCostUsd > 0) return row.totalCostUsd;
  const cached = costCache.get(row);

  if (cached !== undefined) return cached;
  const cost = computeRowCost({
    source: row.source,
    model: row.model,
    hour_start: row.hourStart,
    project_key: row.projectKey,
    input_tokens: row.inputTokens,
    cached_input_tokens: row.cachedInputTokens,
    cache_creation_input_tokens: row.cacheCreationInputTokens,
    output_tokens: row.outputTokens,
    reasoning_output_tokens: row.reasoningOutputTokens,
    total_tokens: row.totalTokens,
    billable_total_tokens: row.billableTotalTokens,
    total_cost_usd: row.totalCostUsd,
    conversation_count: row.conversationCount,
    credits: row.credits,
  });

  costCache.set(row, cost);

  return cost;
}

/** Row identity → computed cost (WeakMap so deduped rows cost once). */
const costCache = new WeakMap<QueueBucketRow, number>();

export function parseQueueLine(line: string): QueueBucketRow | null {
  const trimmed = line.trim();

  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (parsed === null || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;

    if (
      typeof row.source !== "string" ||
      typeof row.model !== "string" ||
      typeof row.hour_start !== "string" ||
      Number.isNaN(Date.parse(row.hour_start))
    ) {
      return null;
    }
    const billable =
      typeof row.billable_total_tokens === "number" &&
      Number.isFinite(row.billable_total_tokens)
        ? row.billable_total_tokens
        : null;

    return {
      source: row.source,
      model: row.model,
      hourStart: row.hour_start,
      projectKey: typeof row.project_key === "string" ? row.project_key : "",
      inputTokens: asNumber(row.input_tokens),
      cachedInputTokens: asNumber(row.cached_input_tokens),
      cacheCreationInputTokens: asNumber(row.cache_creation_input_tokens),
      outputTokens: asNumber(row.output_tokens),
      reasoningOutputTokens: asNumber(row.reasoning_output_tokens),
      totalTokens: asNumber(row.total_tokens),
      billableTotalTokens: billable,
      totalCostUsd: asNumber(row.total_cost_usd),
      conversationCount: asNumber(row.conversation_count),
      credits: asNumber(row.credits),
    };
  } catch {
    // Torn tail write or foreign content — the queue stays best-effort.
    return null;
  }
}

/**
 * Last-wins bucket map over the whole file, then a window filter. Buckets
 * outside `[windowStartMs, nowMs)` are dropped AFTER dedup — mirroring the
 * reconcile baseline semantics (dedup on the full file, windows filter the
 * deduplicated set).
 */
/** Last-wins bucket rows for the whole file (the reconcile baseline). */
export function dedupeQueue(text: string): QueueBucketRow[] {
  const buckets = new Map<string, QueueBucketRow>();

  for (const line of text.split(/\r?\n/)) {
    const row = parseQueueLine(line);

    if (!row) continue;
    buckets.set(rowKey(row), row); // Map.set overwrites → last line wins
  }

  return [...buckets.values()];
}

export function aggregateQueue(
  text: string,
  windowStartMs: number,
  nowMs: number,
): UsageWindow {
  return aggregateQueueRows(dedupeQueue(text), windowStartMs, nowMs);
}

/**
 * Row-level core of `aggregateQueue`, exported so a caller that already
 * deduped once (the monitor snapshot feeds every window + fold from the same
 * rows) never re-parses the file per window.
 */
export function aggregateQueueRows(
  rows: QueueBucketRow[],
  windowStartMs: number,
  nowMs: number,
): UsageWindow {
  let totalTokens = 0;
  let conversations = 0;
  let attributedTokens = 0;
  let totalCostUsd = 0;
  let inputTokens = 0;
  let cachedInputTokens = 0;
  let cacheCreationInputTokens = 0;
  let outputTokens = 0;
  let reasoningOutputTokens = 0;
  let credits = 0;
  const bySource = new Map<string, TokenEntry>();
  const byModel = new Map<string, TokenEntry>();
  const byProject = new Map<string, ProjectEntry>();

  for (const row of rows) {
    const startMs = Date.parse(row.hourStart);

    if (
      !Number.isFinite(startMs) ||
      startMs < windowStartMs ||
      startMs > nowMs
    ) {
      continue;
    }
    totalTokens += row.totalTokens;
    conversations += row.conversationCount;
    totalCostUsd += rowCostUsd(row);
    inputTokens += row.inputTokens;
    cachedInputTokens += row.cachedInputTokens;
    cacheCreationInputTokens += row.cacheCreationInputTokens;
    outputTokens += row.outputTokens;
    reasoningOutputTokens += row.reasoningOutputTokens;
    credits += row.credits;
    accumulate(bySource, row.source, row);
    accumulate(byModel, row.model, row);
    if (row.projectKey) {
      accumulateProject(byProject, row.projectKey, row);
      attributedTokens += row.totalTokens;
    }
  }

  const sources: SourceUsage[] = rankByTokens(bySource).map(
    ([source, entry]) => ({
      source,
      tokens: entry.tokens,
      conversations: entry.conversations,
      share: shareOf(entry.tokens, totalTokens),
      totalCostUsd: entry.costUsd,
    }),
  );
  const models: ModelUsage[] = rankByTokens(byModel).map(([model, entry]) => ({
    model,
    tokens: entry.tokens,
    conversations: entry.conversations,
    share: shareOf(entry.tokens, totalTokens),
    totalCostUsd: entry.costUsd,
  }));
  const projects: ProjectUsage[] = rankProjects(byProject).map(
    ([projectKey, entry]) => ({
      projectKey,
      tokens: entry.tokens,
      conversations: entry.conversations,
      share: shareOf(entry.tokens, totalTokens),
      totalCostUsd: entry.costUsd,
      lastActiveMs: entry.lastActiveMs,
      sourceTokens: entry.sourceTokens,
    }),
  );

  return {
    totalTokens,
    conversations,
    sources,
    models,
    projects,
    attributedTokens,
    totalCostUsd,
    inputTokens,
    cachedInputTokens,
    cacheCreationInputTokens,
    outputTokens,
    reasoningOutputTokens,
    credits,
    cacheRate:
      totalTokens > 0
        ? (cachedInputTokens + cacheCreationInputTokens) / totalTokens
        : 0,
  };
}

interface TokenEntry {
  tokens: number;
  conversations: number;
  costUsd: number;
}

function accumulate(
  map: Map<string, TokenEntry>,
  key: string,
  row: QueueBucketRow,
): void {
  const entry = map.get(key) ?? { tokens: 0, conversations: 0, costUsd: 0 };

  entry.tokens += row.totalTokens;
  entry.conversations += row.conversationCount;
  entry.costUsd += rowCostUsd(row);
  map.set(key, entry);
}

/** Richer per-project entry: cost, newest bucket and per-source token split. */
interface ProjectEntry {
  tokens: number;
  conversations: number;
  costUsd: number;
  lastActiveMs: number | null;
  sourceTokens: Record<string, number>;
}

function accumulateProject(
  map: Map<string, ProjectEntry>,
  key: string,
  row: QueueBucketRow,
): void {
  const entry = map.get(key) ?? {
    tokens: 0,
    conversations: 0,
    costUsd: 0,
    lastActiveMs: null,
    sourceTokens: {},
  };
  const startMs = Date.parse(row.hourStart);

  entry.tokens += row.totalTokens;
  entry.conversations += row.conversationCount;
  entry.costUsd += rowCostUsd(row);
  if (
    Number.isFinite(startMs) &&
    (entry.lastActiveMs === null || startMs > entry.lastActiveMs)
  ) {
    entry.lastActiveMs = startMs;
  }
  entry.sourceTokens[row.source] =
    (entry.sourceTokens[row.source] ?? 0) + row.totalTokens;
  map.set(key, entry);
}

function shareOf(tokens: number, total: number): number {
  return total > 0 ? Math.min(1, Math.max(0, tokens / total)) : 0;
}

function rankByTokens(
  map: Map<string, TokenEntry>,
): Array<[string, TokenEntry]> {
  return [...map.entries()].sort(
    ([aKey, a], [bKey, b]) => b.tokens - a.tokens || aKey.localeCompare(bKey),
  );
}

function rankProjects(
  map: Map<string, ProjectEntry>,
): Array<[string, ProjectEntry]> {
  return [...map.entries()].sort(
    ([aKey, a], [bKey, b]) => b.tokens - a.tokens || aKey.localeCompare(bKey),
  );
}

function rowKey(row: QueueBucketRow): string {
  return [row.hourStart, row.source, row.model, row.projectKey].join("|");
}

/**
 * Rolling local-day helpers. "今日" uses the OS local timezone (the tray is a
 * per-machine view; web keeps its own browser-timezone choice separately).
 */
export function localDayStartMs(nowMs: number): number {
  const day = new Date(nowMs);

  day.setHours(0, 0, 0, 0);

  return day.getTime();
}

/** Local `YYYY-MM-DD` key for a bucket start (heatmap day bucket). */
export function localDayKey(ms: number): string {
  const date = new Date(ms);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

export interface DailyUsage {
  day: string;
  tokens: number;
  conversations: number;
  /** Read-time priced costs folded into the bucket. */
  costUsd: number;
  /** cached_input + cache_creation, for per-bucket cache-rate sparklines. */
  cacheTokens: number;
  /** Stacked-composition splits for the trend chart (web TrendPoint 口径). */
  inputTokens: number;
  outputTokens: number;
  /** Raw collector source → tokens for the day (canonicalized downstream). */
  sources: Record<string, number>;
}

/** Generic bucket fold shared by the day/hour/month aggregations. */
interface BucketEntry extends DailyUsage {}

function foldRows(
  rows: QueueBucketRow[],
  windowStartMs: number,
  nowMs: number,
  keyOf: (startMs: number) => string,
): Map<string, BucketEntry> {
  const buckets = new Map<string, BucketEntry>();

  for (const row of rows) {
    const startMs = Date.parse(row.hourStart);

    if (
      !Number.isFinite(startMs) ||
      startMs < windowStartMs ||
      startMs > nowMs
    ) {
      continue;
    }
    const key = keyOf(startMs);
    const entry = buckets.get(key) ?? {
      day: key,
      tokens: 0,
      conversations: 0,
      costUsd: 0,
      cacheTokens: 0,
      inputTokens: 0,
      outputTokens: 0,
      sources: {},
    };

    entry.tokens += row.totalTokens;
    entry.conversations += row.conversationCount;
    entry.costUsd += rowCostUsd(row);
    entry.cacheTokens += row.cachedInputTokens + row.cacheCreationInputTokens;
    entry.inputTokens += row.inputTokens;
    entry.outputTokens += row.outputTokens;
    entry.sources[row.source] =
      (entry.sources[row.source] ?? 0) + row.totalTokens;
    buckets.set(key, entry);
  }

  return buckets;
}

/**
 * Dedupe once, then fold each bucket into its local calendar day inside
 * `[windowStartMs, nowMs]`. The heatmap reads this map, so its daily totals
 * share the window filter and last-wins baseline of the summary cards.
 */
export function aggregateQueueDays(
  text: string,
  windowStartMs: number,
  nowMs: number,
): Map<string, DailyUsage> {
  return aggregateDayRows(dedupeQueue(text), windowStartMs, nowMs);
}

/** Row-level core of `aggregateQueueDays` (same once-dedupe rationale). */
export function aggregateDayRows(
  rows: QueueBucketRow[],
  windowStartMs: number,
  nowMs: number,
): Map<string, DailyUsage> {
  return foldRows(rows, windowStartMs, nowMs, localDayKey);
}

/** Row-level fold keyed by local hour-of-day `0`–`23` (今日 sparkline). */
export function aggregateHourRows(
  rows: QueueBucketRow[],
  windowStartMs: number,
  nowMs: number,
): Map<string, DailyUsage> {
  return foldRows(rows, windowStartMs, nowMs, (startMs) =>
    String(new Date(startMs).getHours()),
  );
}

/** Row-level fold keyed by local `YYYY-MM` (总计 sparkline). */
export function aggregateMonthRows(
  rows: QueueBucketRow[],
  windowStartMs: number,
  nowMs: number,
): Map<string, DailyUsage> {
  return foldRows(rows, windowStartMs, nowMs, (startMs) =>
    localDayKey(startMs).slice(0, 7),
  );
}

export const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;
export const THIRTY_DAY_MS = 30 * 24 * 60 * 60 * 1000;
export const ONE_DAY_MS = 24 * 60 * 60 * 1000;
