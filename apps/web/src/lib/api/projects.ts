// Projects aggregation for the dashboard's own /api/app/projects route
// (docs/projects-page-plan.md 批次 1 / 阶段 0): group token_sessions rows by
// project_key over a tz-aware day window. This is a dashboard-face payload,
// NOT part of the CLI contract — docs/cli-contract.md stays untouched.
//
// Coverage caveats (mirrored by the in-page scope note): only session-sidecar
// sources land in token_sessions; account-level sources (cursor / trae-cn)
// never appear; costs are read-time list-price estimates, identical to the
// sessions series' per-model pricing.

import type { RestRow } from "./supabase-rest";

import { loadSessionRows } from "./account-data";
import { jsonResponse } from "./http";

import {
  boundRangeStart,
  isValidDayKey,
  numberOr0,
  parseTzContext,
  zonedDayKey,
  type TzContext,
} from "@/lib/account/series";
import { startOfDayUtcMs } from "@/lib/dashboard/ranges";
import { computeRowCost } from "@/lib/pricing";

const DAY_MS = 86_400_000;
const DEFAULT_RANGE_DAYS = 7;
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

export type ProjectSortKey = "tokens" | "cost";

export interface ProjectDayPeak {
  date: string;
  total_tokens: number;
}

export interface ProjectWire {
  project_key: string | null;
  name: string | null;
  total_tokens: number;
  total_cost_usd: string;
  session_count: number;
  day_peak: ProjectDayPeak | null;
  last_active: string | null;
}

// Same token-column set the sessions series costs per model entry
// (account-series-handlers.ts sessionModelsWire).
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
  const rawModels = row.models;

  if (!Array.isArray(rawModels)) return 0;
  let sum = 0;

  for (const raw of rawModels) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const costRow: Record<string, unknown> = { source, model: record.model };

    for (const key of SESSION_COST_KEYS) costRow[key] = numberOr0(record[key]);
    sum += computeRowCost(costRow);
  }

  return sum;
}

/** UTC instant of local midnight for a day key in the caller's tz context. */
function dayStartIso(dayKey: string, tzContext: TzContext): string {
  if (tzContext.timeZone) {
    try {
      return new Date(
        startOfDayUtcMs(dayKey, tzContext.timeZone),
      ).toISOString();
    } catch {
      // Invalid IANA id: fall through to the numeric offset.
    }
  }
  const offset = tzContext.offsetMinutes ?? 0;

  return new Date(
    Date.parse(`${dayKey}T00:00:00Z`) - offset * 60_000,
  ).toISOString();
}

function addDays(dayKey: string, days: number): string {
  return new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

type Window = { from: string; to: string } | { error: string };

/**
 * Resolve the day-key window. Absent from/to default to the last
 * DEFAULT_RANGE_DAYS days ending today in the caller's tz; a partially
 * supplied or malformed window is a client error.
 */
function resolveWindow(
  searchParams: URLSearchParams,
  tzContext: TzContext,
  now: Date,
): Window {
  const fromParam = (searchParams.get("from") || "").trim();
  const toParam = (searchParams.get("to") || "").trim();

  if (!fromParam && !toParam) {
    const today = zonedDayKey(now.toISOString(), tzContext) ?? "1970-01-01";

    return { from: addDays(today, -(DEFAULT_RANGE_DAYS - 1)), to: today };
  }
  if (
    !isValidDayKey(fromParam) ||
    !isValidDayKey(toParam) ||
    fromParam > toParam
  ) {
    return { error: "Invalid from/to" };
  }

  return { from: boundRangeStart(fromParam, toParam), to: toParam };
}

function resolveSort(searchParams: URLSearchParams): ProjectSortKey | null {
  const raw = (searchParams.get("sort") || "").trim().toLowerCase();

  if (!raw) return "tokens";

  return raw === "tokens" || raw === "cost" ? raw : null;
}

function resolveLimit(searchParams: URLSearchParams): number {
  const param = searchParams.get("limit");
  const raw = param == null || param === "" ? Number.NaN : Number(param);

  return Number.isFinite(raw)
    ? Math.min(Math.max(Math.trunc(raw), 1), MAX_LIMIT)
    : DEFAULT_LIMIT;
}

function resolveOffset(searchParams: URLSearchParams): number {
  const param = searchParams.get("offset");
  const raw = param == null || param === "" ? 0 : Number(param);

  return Number.isFinite(raw) && raw > 0 ? Math.trunc(raw) : 0;
}

type ProjectGroup = {
  key: string | null;
  totalTokens: number;
  costUsd: number;
  sessionCount: number;
  lastActiveMs: number;
  lastActive: string | null;
  dayTokens: Map<string, number>;
};

function groupKeyOf(row: RestRow): string | null {
  const raw = row.project_key;

  if (raw == null) return null;
  const key = String(raw).trim();

  return key || null;
}

function toWire(group: ProjectGroup): ProjectWire {
  let dayPeak: ProjectDayPeak | null = null;

  for (const [date, tokens] of group.dayTokens) {
    if (
      dayPeak == null ||
      tokens > dayPeak.total_tokens ||
      (tokens === dayPeak.total_tokens && date < dayPeak.date)
    ) {
      dayPeak = { date, total_tokens: tokens };
    }
  }

  return {
    project_key: group.key,
    // project_key already IS the basename (the ingest path strips the cwd to
    // its last segment), so identical basenames merge naturally; the display
    // layer's resolveProjectDisplayName is the future rename/merge hook.
    name: group.key,
    total_tokens: group.totalTokens,
    total_cost_usd: group.costUsd.toFixed(6),
    session_count: group.sessionCount,
    day_peak: dayPeak,
    last_active: group.lastActive,
  };
}

export async function projectsPayloadForUser(
  userId: string,
  searchParams: URLSearchParams,
  now: Date = new Date(),
): Promise<Response> {
  const tzContext = parseTzContext(searchParams);
  const window = resolveWindow(searchParams, tzContext, now);

  if ("error" in window) return jsonResponse(400, { error: window.error });
  const sort = resolveSort(searchParams);

  if (sort == null) return jsonResponse(400, { error: "Invalid sort" });
  const limit = resolveLimit(searchParams);
  const offset = resolveOffset(searchParams);
  const { from, to } = window;
  const days =
    Math.round(
      (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
        DAY_MS,
    ) + 1;

  const emptyPayload = {
    from,
    to,
    days,
    total: 0,
    limit,
    offset,
    totals: {
      attributed_tokens: 0,
      unattributed_tokens: 0,
      unattributed_sessions: 0,
    },
    projects: [],
  };

  // Sessions semantics: absolute [from, to) instants on ended_at, revoked
  // devices excluded wholesale, account-level sources never surface.
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
  const groups = new Map<string | null, ProjectGroup>();

  for (const row of rows) {
    const rowDeviceId = String(row.device_id ?? "");

    if (!activeDeviceIds.has(rowDeviceId)) continue;
    const source = String(row.source ?? "");

    if (source === "cursor" || source === "trae-cn") continue;
    const endedAt = String(row.ended_at ?? "");
    const endedMs = Date.parse(endedAt);

    if (!Number.isFinite(endedMs)) continue;
    const dayKey = zonedDayKey(endedAt, tzContext);

    if (!dayKey) continue;
    const key = groupKeyOf(row);
    let group = groups.get(key);

    if (!group) {
      group = {
        key,
        totalTokens: 0,
        costUsd: 0,
        sessionCount: 0,
        lastActiveMs: 0,
        lastActive: null,
        dayTokens: new Map(),
      };
      groups.set(key, group);
    }
    const tokens = numberOr0(row.total_tokens);

    group.totalTokens += tokens;
    group.costUsd += sessionCostUsd(row);
    group.sessionCount += 1;
    group.dayTokens.set(dayKey, (group.dayTokens.get(dayKey) ?? 0) + tokens);
    if (endedMs > group.lastActiveMs) {
      group.lastActiveMs = endedMs;
      group.lastActive = endedAt;
    }
  }

  if (groups.size === 0) return jsonResponse(200, emptyPayload);

  const attributed: ProjectGroup[] = [];
  let unattributed: ProjectGroup | null = null;
  let attributedTokens = 0;

  for (const group of groups.values()) {
    if (group.key == null) unattributed = group;
    else {
      attributed.push(group);
      attributedTokens += group.totalTokens;
    }
  }

  const valueOf = (group: ProjectGroup): number =>
    sort === "cost" ? group.costUsd : group.totalTokens;

  attributed.sort(
    (first, second) =>
      valueOf(second) - valueOf(first) ||
      ((first.key ?? "") < (second.key ?? "")
        ? -1
        : (first.key ?? "") > (second.key ?? "")
          ? 1
          : 0),
  );
  // The unattributed group always sinks to the bottom, regardless of sort.
  const ordered = unattributed ? [...attributed, unattributed] : attributed;
  const page = ordered.slice(offset, offset + limit).map(toWire);

  return jsonResponse(200, {
    from,
    to,
    days,
    total: ordered.length,
    limit,
    offset,
    totals: {
      attributed_tokens: attributedTokens,
      unattributed_tokens: unattributed?.totalTokens ?? 0,
      unattributed_sessions: unattributed?.sessionCount ?? 0,
    },
    projects: page,
  });
}
