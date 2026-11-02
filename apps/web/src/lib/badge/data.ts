// Aggregation for the public badge and the /u page (docs/badge.md §4).
//
// The badge shows what the dashboard shows. Account badges aggregate the
// account snapshot's canonicalRows (active devices only, Cursor deduped,
// Trae CN from session states) and cost each row with rowCost — the
// dashboard's read-time pricing, which only trusts stored costs for
// grok/cline (2026-11-02 operator call: stored costs are 0 for collector
// rows). Repo badges read the sessions the Sessions page would list and price
// their per-model entries through the same engine. Both loads reuse the
// dashboard's single-flighted snapshot loaders — no second full-pull path.
//
// A small single-flight sits on top keyed by (user, scope, project, range)
// per §8; style/theme only affect rendering. Config mutations from
// /api/app/badge call invalidateBadgeData. Tests opt out via the shared
// TOKEN_USAGE_USAGE_CACHE=off convention.

import type { RestRow } from "@/lib/api/supabase-rest";
import type { BadgeData, BadgeModel, BadgeRange, BadgeSource } from "./types";

import { loadAccountUsage, loadSessionRows } from "@/lib/api/account-data";
import { rowCost, zonedDayKey } from "@/lib/account/series";
import { normalizeProjectKey } from "@/lib/ingest/normalize";
import { ModelDisplayName, modelGroupKey } from "@/lib/model-names";
import { computeRowCost } from "@/lib/pricing";
import { sourceDisplayLabel } from "@/lib/sources";

const DAY_MS = 86_400_000;
const SERIES_DAYS = 30;
const TOP_MODELS = 5;
const TOP_SOURCES = 5;
const ALL_RANGE_FLOOR = "2000-01-01T00:00:00.000Z";
const TTL_MS = 10_000;

export type BadgeOwnerConfig = {
  displayName: string;
  timezone: string;
};

function n0(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

// §3.4: the owner timezone buckets active days; an invalid stored zone falls
// back to UTC inside zonedDayKey, so the badge never depends on server tz.
function dayKeyAt(instant: unknown, timeZone: string): string | null {
  const ms = Date.parse(String(instant ?? ""));

  return Number.isFinite(ms) ? zonedDayKey(new Date(ms), { timeZone }) : null;
}

function shiftDayKey(dayKey: string, days: number): string {
  const shifted = Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS;

  return new Date(shifted).toISOString().slice(0, 10);
}

type Aggregation = {
  tokens: number;
  costUsd: number;
  sourceTokens: Map<string, number>;
  models: Map<string, { names: ModelDisplayName; tokens: number }>;
  days: Map<string, number>;
};

function emptyAggregation(): Aggregation {
  return {
    tokens: 0,
    costUsd: 0,
    sourceTokens: new Map(),
    models: new Map(),
    days: new Map(),
  };
}

function addModelEntry(
  agg: Aggregation,
  rawModel: string,
  tokens: number,
): void {
  const key = modelGroupKey(rawModel);
  let entry = agg.models.get(key);

  if (!entry) {
    entry = { names: new ModelDisplayName(), tokens: 0 };
    agg.models.set(key, entry);
  }
  entry.names.add(rawModel, tokens);
  entry.tokens += tokens;
}

function dayBucket(agg: Aggregation, day: string | null, tokens: number): void {
  if (!day) return;
  agg.days.set(day, (agg.days.get(day) ?? 0) + tokens);
}

function aggregateHourly(
  rows: Record<string, unknown>[],
  timeZone: string,
): Aggregation {
  const agg = emptyAggregation();

  for (const row of rows) {
    const tokens = n0(row.total_tokens);

    agg.tokens += tokens;
    // Dashboard parity: the same per-row read-time cost summarizeRows uses.
    agg.costUsd += rowCost(row);
    const source = String(row.source ?? "").trim() || "unknown";

    agg.sourceTokens.set(source, (agg.sourceTokens.get(source) ?? 0) + tokens);
    addModelEntry(agg, String(row.model ?? ""), tokens);
    dayBucket(agg, dayKeyAt(row.hour_start, timeZone), tokens);
  }

  return agg;
}

// The sessions the Sessions page would list (docs/cli-contract.md §2.7 read
// face): active devices only, account-level sources never.
function visibleSessions(sessions: RestRow[], devices: RestRow[]): RestRow[] {
  const active = new Set(
    devices
      .filter((device) => !device.revoked_at)
      .map((device) => String(device.id)),
  );

  return sessions.filter((row) => {
    const source = String(row.source ?? "");

    return (
      active.has(String(row.device_id ?? "")) &&
      source !== "cursor" &&
      source !== "trae-cn"
    );
  });
}

// §4.2: repo cost is priced per model entry through the shared engine — the
// same treatment as the dashboard's session detail. Sessions carry no stored
// cost column; DeepSeek off-peak keys off ended_at.
function sessionCostUsd(session: Record<string, unknown>): number {
  const entries = Array.isArray(session.models) ? session.models : [];

  if (entries.length === 0) return 0;
  const hourStart = String(session.ended_at ?? "");
  let sum = 0;

  for (const entry of entries) {
    const model = (entry ?? {}) as Record<string, unknown>;

    sum += computeRowCost({
      source: session.source,
      model: model.model,
      hour_start: hourStart,
      input_tokens: model.input_tokens,
      cached_input_tokens: model.cached_input_tokens,
      cache_creation_input_tokens: model.cache_creation_input_tokens,
      output_tokens: model.output_tokens,
      reasoning_output_tokens: model.reasoning_output_tokens,
      total_tokens: model.total_tokens,
      total_cost_usd: 0,
    });
  }

  return sum;
}

function aggregateSessions(
  rows: Record<string, unknown>[],
  timeZone: string,
): Aggregation {
  const agg = emptyAggregation();

  for (const session of rows) {
    const tokens = n0(session.total_tokens);

    agg.tokens += tokens;
    agg.costUsd += sessionCostUsd(session);
    const source = String(session.source ?? "").trim() || "unknown";

    agg.sourceTokens.set(source, (agg.sourceTokens.get(source) ?? 0) + tokens);
    const entries = Array.isArray(session.models) ? session.models : [];

    for (const entry of entries) {
      const model = (entry ?? {}) as Record<string, unknown>;

      addModelEntry(agg, String(model.model ?? ""), n0(model.total_tokens));
    }
    dayBucket(agg, dayKeyAt(session.ended_at, timeZone), tokens);
  }

  return agg;
}

function buildSources(agg: Aggregation): BadgeSource[] {
  return [...agg.sourceTokens.entries()]
    .map(([key, tokens]) => ({
      key,
      label: sourceDisplayLabel(key),
      tokens,
      share: agg.tokens > 0 ? tokens / agg.tokens : 0,
    }))
    .filter((source) => source.tokens > 0)
    .sort((a, b) => b.tokens - a.tokens || (a.key < b.key ? -1 : 1))
    .slice(0, TOP_SOURCES);
}

function buildModels(agg: Aggregation): BadgeModel[] {
  return [...agg.models.entries()]
    .map(([key, entry]) => ({
      key,
      label: entry.names.resolve(),
      tokens: entry.tokens,
    }))
    .sort((a, b) => b.tokens - a.tokens || (a.key < b.key ? -1 : 1))
    .slice(0, TOP_MODELS);
}

// §4.6: the series is always the last 30 owner-tz calendar days, ascending,
// zero-filled.
function buildSeries(agg: Aggregation, timeZone: string, now: Date): number[] {
  const toDay =
    zonedDayKey(now, { timeZone }) ?? now.toISOString().slice(0, 10);
  const series: number[] = [];

  for (let offset = SERIES_DAYS - 1; offset >= 0; offset -= 1) {
    series.push(agg.days.get(shiftDayKey(toDay, -offset)) ?? 0);
  }

  return series;
}

async function buildBadgeData(
  userId: string,
  config: BadgeOwnerConfig,
  scope: "user" | "repo",
  project: string | null,
  range: BadgeRange,
): Promise<BadgeData> {
  const now = new Date();
  const timeZone = config.timezone || "UTC";

  if (scope === "repo") {
    const toIso = new Date(now.getTime() + DAY_MS).toISOString();
    const fromIso =
      range === "30d"
        ? new Date(now.getTime() - SERIES_DAYS * DAY_MS).toISOString()
        : ALL_RANGE_FLOOR;
    const { sessions, devices } = await loadSessionRows(userId, fromIso, toIso);
    // §4.2: exact match on the normalized project_key; empty-keyed historical
    // sessions can never equal a requested name, so they drop out here.
    const rows = visibleSessions(sessions, devices).filter(
      (row) => row.project_key === project,
    );
    const agg = aggregateSessions(rows, timeZone);

    return {
      scope,
      project,
      displayName: config.displayName,
      range,
      totals: {
        tokens: agg.tokens,
        costUsd: agg.costUsd,
        activeDays: agg.days.size,
      },
      sources: buildSources(agg),
      models: buildModels(agg),
      series: buildSeries(agg, timeZone, now),
    };
  }

  const usage = await loadAccountUsage(userId);
  // §4.1 dashboard parity: the snapshot's canonical rows. §4.4's 30d window
  // is a rolling cutoff from the request instant (cache-TTL drift is an
  // implementation detail).
  const cutoffMs = now.getTime() - SERIES_DAYS * DAY_MS;
  const rows =
    range === "30d"
      ? usage.canonicalRows.filter(
          (row) => Date.parse(String(row.hour_start ?? "")) >= cutoffMs,
        )
      : usage.canonicalRows;
  const agg = aggregateHourly(rows, timeZone);

  return {
    scope,
    project: null,
    displayName: config.displayName,
    range,
    totals: {
      tokens: agg.tokens,
      costUsd: agg.costUsd,
      activeDays: agg.days.size,
    },
    sources: buildSources(agg),
    models: buildModels(agg),
    series: buildSeries(agg, timeZone, now),
  };
}

type CacheEntry = {
  expiresAt: number;
  promise: Promise<BadgeData>;
};

const cache = new Map<string, CacheEntry>();

function badgeCacheDisabled(): boolean {
  return process.env.TOKEN_USAGE_USAGE_CACHE === "off";
}

export function invalidateBadgeData(userId?: string): void {
  if (userId == null) {
    cache.clear();

    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`badge|${userId}|`)) cache.delete(key);
  }
}

export function loadBadgeData(
  userId: string,
  config: BadgeOwnerConfig,
  scope: "user" | "repo",
  project: string | null,
  range: BadgeRange,
): Promise<BadgeData> {
  if (badgeCacheDisabled()) {
    return buildBadgeData(userId, config, scope, project, range);
  }

  const key = `badge|${userId}|${scope}|${project ?? ""}|${range}`;
  const now = Date.now();
  const hit = cache.get(key);

  if (hit && hit.expiresAt > now) return hit.promise;

  const promise = buildBadgeData(userId, config, scope, project, range);

  // A failed load must not pin its rejection for the TTL window.
  promise.catch(() => {
    const entry = cache.get(key);

    if (entry?.promise === promise) cache.delete(key);
  });
  cache.set(key, { expiresAt: now + TTL_MS, promise });

  return promise;
}

// §4.2: whitelist comparison happens on normalized keys (basename, both
// separators, control chars stripped) — the same normalizer ingest applies.
export function normalizeBadgeProject(value: unknown): string | null {
  return normalizeProjectKey(value);
}

export function normalizeBadgeAllowlist(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const items: string[] = [];

  for (const entry of value) {
    const key = normalizeBadgeProject(entry);

    if (key && !items.includes(key)) items.push(key);
  }

  return items;
}

// §3.4: valid IANA name as-is, anything else (including empty) back to UTC.
export function normalizeBadgeTimezone(value: unknown): string {
  const raw = String(value ?? "").trim();

  if (!raw) return "UTC";
  try {
    new Intl.DateTimeFormat("en", { timeZone: raw });

    return raw;
  } catch {
    return "UTC";
  }
}

const MAX_KNOWN_PROJECTS = 200;

// Settings allowlist source (§7.2): the distinct non-empty project_keys of the
// owner's sessions, busiest first — a projection of data the Sessions page
// already shows, through the same single-flighted loader.
export async function loadKnownProjects(userId: string): Promise<string[]> {
  const toIso = new Date(Date.now() + DAY_MS).toISOString();
  const { sessions, devices } = await loadSessionRows(
    userId,
    ALL_RANGE_FLOOR,
    toIso,
  );
  const totals = new Map<string, number>();

  for (const row of visibleSessions(sessions, devices)) {
    const key = typeof row.project_key === "string" ? row.project_key : "";

    if (key) totals.set(key, (totals.get(key) ?? 0) + n0(row.total_tokens));
  }

  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_KNOWN_PROJECTS)
    .map(([key]) => key);
}
