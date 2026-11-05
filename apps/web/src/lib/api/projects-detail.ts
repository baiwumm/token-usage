// Per-project detail payload for the dashboard's /api/app/projects-detail
// route (docs/projects-page-plan.md). One project — or the pinned unattributed
// group — is broken down over a tz-aware day window into totals, a continuous
// daily series, per-source splits and the whole-window token denominator that
// backs the "share of total" ratio.
//
// Caliber alignment: the detail MUST use the same caliber as the list. By
// default that is NEXT_PUBLIC_PROJECTS_CALIBER === "hourly" ? hourly : sessions,
// exactly like the page's fetchProjects switch; a `caliber` query parameter
// overrides it for tests and one-off probes.
//   - sessions: token_sessions rows (loadSessionRows), ended_at day keys,
//     revoked devices and cursor / trae-cn sources excluded, cost re-estimated
//     per model entry with computeRowCost (the same SESSION_COST_KEYS logic as
//     projects.ts). conversation_count = number of session rows.
//   - hourly: canonicalRows (loadAccountUsage), hour_start day keys and the
//     absolute [from, to) instant window, revoked devices already filtered by
//     canonicalizeUsage, cost = computeRowCost(row) at read time.
//     conversation_count = sum of conversations (bucket entries, not sessions).
// In both calibers cost is a READ-TIME estimate — the persisted
// total_cost_usd sentinel is never trusted. Credits are an independent
// display-only dimension: summed into totals.credits (6 dp) and NEVER merged
// into any token column (token composition is read from the row's own token
// columns).
//
// range_total_tokens is the whole-window, all-group total (attributed +
// unattributed + zero-usage projects), i.e. the exact sum of every in-window
// row's total_tokens under the chosen caliber. It stays aligned with the list
// payload's totals.attributed_tokens + totals.unattributed_tokens because the
// row set here is identical to the one the list aggregates.

import type { RestRow } from "./supabase-rest";

import { loadAccountUsage, loadSessionRows } from "./account-data";
import { jsonResponse } from "./http";
import { addDays, dayStartIso, groupKeyOf, resolveWindow } from "./projects";

import {
  numberOr0,
  parseTzContext,
  zonedDayKey,
  type TzContext,
} from "@/lib/account/series";
import { computeRowCost } from "@/lib/pricing";

const DAY_MS = 86_400_000;
const MAX_DAILY_DAYS = 60;

export const UNATTRIBUTED_PROJECT = "__unattributed";
export type Caliber = "sessions" | "hourly";

export interface ProjectTarget {
  /** Group key to match: null selects the unattributed group. */
  key: string | null;
  unattributed: boolean;
}

/** Resolve the required `project` param; null = missing/blank (400). */
export function resolveProjectKey(
  searchParams: URLSearchParams,
): ProjectTarget | null {
  const raw = (searchParams.get("project") || "").trim();

  if (!raw) return null;
  if (raw === UNATTRIBUTED_PROJECT) return { key: null, unattributed: true };

  return { key: raw, unattributed: false };
}

/**
 * Caliber for this request: query override first, else the deployment-wide
 * NEXT_PUBLIC_PROJECTS_CALIBER switch (same exact-match rule as the page).
 * null = an unknown caliber value (400).
 */
export function resolveCaliber(searchParams: URLSearchParams): Caliber | null {
  const raw = (searchParams.get("caliber") || "").trim();

  if (!raw) {
    return process.env.NEXT_PUBLIC_PROJECTS_CALIBER === "hourly"
      ? "hourly"
      : "sessions";
  }

  return raw === "sessions" || raw === "hourly" ? raw : null;
}

// ---- Aggregation accumulators (inputs to the exported pure builders) ----

export interface DayBucket {
  total_tokens: number;
  conversation_count: number;
  total_cost_usd: number;
  sources: Map<string, number>;
}

export interface SourceBucket {
  source: string;
  total_tokens: number;
  conversation_count: number;
  total_cost_usd: number;
  /** dayKey -> tokens, for the per-source days_active count. */
  dayTokens: Map<string, number>;
}

export interface DailyWire {
  date: string;
  total_tokens: number;
  conversation_count: number;
  total_cost_usd: string;
  sources: Record<string, number>;
}

export interface SourceWire {
  source: string;
  total_tokens: number;
  conversation_count: number;
  days_active: number;
  total_cost_usd: string;
}

/** Continuous [from, min(to, today)] daily series, capped to the last 60 days. */
export function fillDaily(
  from: string,
  to: string,
  today: string,
  byDay: Map<string, DayBucket>,
): DailyWire[] {
  const end = to < today ? to : today;
  const dayKeys: string[] = [];
  let cursor = from;

  while (cursor <= end) {
    dayKeys.push(cursor);
    cursor = addDays(cursor, 1);
  }
  const kept =
    dayKeys.length > MAX_DAILY_DAYS ? dayKeys.slice(-MAX_DAILY_DAYS) : dayKeys;

  return kept.map((date) => {
    const bucket = byDay.get(date);
    const sources: Record<string, number> = {};

    if (bucket) {
      for (const [source, tokens] of bucket.sources) sources[source] = tokens;
    }

    return {
      date,
      total_tokens: bucket?.total_tokens ?? 0,
      conversation_count: bucket?.conversation_count ?? 0,
      total_cost_usd: (bucket?.total_cost_usd ?? 0).toFixed(6),
      sources,
    };
  });
}

/** Sources sorted by tokens desc, ties broken by source ascending. */
export function mergeSources(
  bySource: Map<string, SourceBucket>,
): SourceWire[] {
  const list: SourceWire[] = Array.from(bySource.values()).map((bucket) => ({
    source: bucket.source,
    total_tokens: bucket.total_tokens,
    conversation_count: bucket.conversation_count,
    days_active: Array.from(bucket.dayTokens.values()).filter((t) => t > 0)
      .length,
    total_cost_usd: bucket.total_cost_usd.toFixed(6),
  }));

  list.sort(
    (a, b) =>
      b.total_tokens - a.total_tokens ||
      (a.source < b.source ? -1 : a.source > b.source ? 1 : 0),
  );

  return list;
}

// ---- Read-time cost for one session row (mirrors projects.ts, whose own
// sessionCostUsd is private). One computeRowCost call per model entry. ----

const SESSION_COST_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
] as const;

function sessionCostUsd(row: RestRow): number {
  const source = String(row.source ?? "");
  const rawModels: unknown = row.models;

  if (!Array.isArray(rawModels)) return 0;
  const models: unknown[] = rawModels;
  let sum = 0;

  for (const raw of models) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const costRow: Record<string, unknown> = { source, model: record.model };

    for (const key of SESSION_COST_KEYS) costRow[key] = numberOr0(record[key]);
    sum += computeRowCost(costRow);
  }

  return sum;
}

// ---- Normalized row shared by both calibers ----

interface DetailRow {
  groupKey: string | null;
  dayKey: string;
  source: string;
  tokens: number;
  input: number;
  cached: number;
  cacheCreation: number;
  output: number;
  reasoning: number;
  conversations: number;
  costUsd: number;
  credits: number;
}

function isAccountSource(rawSource: string): boolean {
  return rawSource === "cursor" || rawSource === "trae-cn";
}

async function collectSessionRows(
  userId: string,
  from: string,
  to: string,
  tzContext: TzContext,
): Promise<DetailRow[]> {
  const { sessions: rows, devices } = await loadSessionRows(
    userId,
    dayStartIso(from, tzContext),
    dayStartIso(addDays(to, 1), tzContext),
  );
  const activeDeviceIds = new Set(
    devices
      .filter((device) => !device.revoked_at)
      .map((device) => String(device.id)),
  );
  const out: DetailRow[] = [];

  for (const row of rows) {
    if (!activeDeviceIds.has(String(row.device_id ?? ""))) continue;
    const rawSource = String(row.source ?? "");

    if (isAccountSource(rawSource)) continue;
    const endedAt = String(row.ended_at ?? "");

    if (!Number.isFinite(Date.parse(endedAt))) continue;
    const dayKey = zonedDayKey(endedAt, tzContext);

    if (!dayKey) continue;
    out.push({
      groupKey: groupKeyOf(row),
      dayKey,
      source: rawSource.trim() || "unknown",
      tokens: numberOr0(row.total_tokens),
      input: numberOr0(row.input_tokens),
      cached: numberOr0(row.cached_input_tokens),
      cacheCreation: numberOr0(row.cache_creation_input_tokens),
      output: numberOr0(row.output_tokens),
      reasoning: numberOr0(row.reasoning_output_tokens),
      // A session row IS one conversation; sessions have no per-bucket count.
      conversations: 1,
      costUsd: sessionCostUsd(row),
      credits: numberOr0(row.credits),
    });
  }

  return out;
}

async function collectHourlyRows(
  userId: string,
  from: string,
  to: string,
  tzContext: TzContext,
): Promise<DetailRow[]> {
  const { canonicalRows } = await loadAccountUsage(userId);
  const fromMs = Date.parse(dayStartIso(from, tzContext));
  const toMs = Date.parse(dayStartIso(addDays(to, 1), tzContext));
  const out: DetailRow[] = [];

  for (const row of canonicalRows) {
    const hourStart = String(row.hour_start ?? "");
    const hourMs = Date.parse(hourStart);

    if (!Number.isFinite(hourMs) || hourMs < fromMs || hourMs >= toMs) continue;
    const dayKey = zonedDayKey(hourStart, tzContext);

    if (!dayKey) continue;
    out.push({
      groupKey: groupKeyOf(row),
      dayKey,
      source: String(row.source ?? "").trim() || "unknown",
      tokens: numberOr0(row.total_tokens),
      input: numberOr0(row.input_tokens),
      cached: numberOr0(row.cached_input_tokens),
      cacheCreation: numberOr0(row.cache_creation_input_tokens),
      output: numberOr0(row.output_tokens),
      reasoning: numberOr0(row.reasoning_output_tokens),
      // Hourly buckets carry per-bucket conversation counts, not sessions.
      conversations: numberOr0(row.conversations),
      costUsd: computeRowCost(row),
      credits: numberOr0(row.credits),
    });
  }

  return out;
}

// ---- Payload builder ----

export async function projectsDetailPayloadForUser(
  userId: string,
  searchParams: URLSearchParams,
  now: Date = new Date(),
): Promise<Response> {
  const target = resolveProjectKey(searchParams);

  if (target == null) return jsonResponse(400, { error: "Missing project" });
  const caliber = resolveCaliber(searchParams);

  if (caliber == null) return jsonResponse(400, { error: "Invalid caliber" });
  const tzContext = parseTzContext(searchParams);
  const window = resolveWindow(searchParams, tzContext, now);

  if ("error" in window) return jsonResponse(400, { error: window.error });
  const { from, to } = window;
  const days =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS,
    ) + 1;

  const allRows =
    caliber === "hourly"
      ? await collectHourlyRows(userId, from, to, tzContext)
      : await collectSessionRows(userId, from, to, tzContext);

  const byDay = new Map<string, DayBucket>();
  const bySource = new Map<string, SourceBucket>();
  let rangeTotalTokens = 0;
  let totalTokens = 0;
  let input = 0;
  let cached = 0;
  let cacheCreation = 0;
  let output = 0;
  let reasoning = 0;
  let conversationCount = 0;
  let costUsd = 0;
  let credits = 0;

  for (const row of allRows) {
    // Whole-window, all-group denominator — includes unattributed and
    // zero-usage projects, independent of the target selection.
    rangeTotalTokens += row.tokens;
    if (row.groupKey !== target.key) continue;

    totalTokens += row.tokens;
    input += row.input;
    cached += row.cached;
    cacheCreation += row.cacheCreation;
    output += row.output;
    reasoning += row.reasoning;
    conversationCount += row.conversations;
    costUsd += row.costUsd;
    credits += row.credits;

    let day = byDay.get(row.dayKey);

    if (!day) {
      day = {
        total_tokens: 0,
        conversation_count: 0,
        total_cost_usd: 0,
        sources: new Map(),
      };
      byDay.set(row.dayKey, day);
    }
    day.total_tokens += row.tokens;
    day.conversation_count += row.conversations;
    day.total_cost_usd += row.costUsd;
    day.sources.set(
      row.source,
      (day.sources.get(row.source) ?? 0) + row.tokens,
    );

    let source = bySource.get(row.source);

    if (!source) {
      source = {
        source: row.source,
        total_tokens: 0,
        conversation_count: 0,
        total_cost_usd: 0,
        dayTokens: new Map(),
      };
      bySource.set(row.source, source);
    }
    source.total_tokens += row.tokens;
    source.conversation_count += row.conversations;
    source.total_cost_usd += row.costUsd;
    source.dayTokens.set(
      row.dayKey,
      (source.dayTokens.get(row.dayKey) ?? 0) + row.tokens,
    );
  }

  // days_active (top-level and per-source) counts distinct day keys with
  // token>0 over the full resolved window. `daily` is a display view that may
  // be truncated to today / the last 60 days, but the active-day counts and the
  // totals/sources describe the whole window (documented caliber choice).
  let daysActive = 0;

  for (const day of byDay.values()) if (day.total_tokens > 0) daysActive += 1;
  const today = zonedDayKey(now.toISOString(), tzContext) ?? to;

  return jsonResponse(200, {
    from,
    to,
    days,
    caliber,
    project_key: target.key,
    totals: {
      total_tokens: totalTokens,
      input_tokens: input,
      cached_input_tokens: cached,
      cache_creation_input_tokens: cacheCreation,
      output_tokens: output,
      reasoning_output_tokens: reasoning,
      conversation_count: conversationCount,
      total_cost_usd: costUsd.toFixed(6),
      credits: Math.round(credits * 1e6) / 1e6,
    },
    range_total_tokens: rangeTotalTokens,
    days_active: daysActive,
    daily: fillDaily(from, to, today, byDay),
    sources: mergeSources(bySource),
  });
}
