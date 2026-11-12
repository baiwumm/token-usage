// Composition layer for the monitor snapshot: turns raw local-file texts
// (read by the Rust layer, never written) into the numbers the UI and the
// tray show. Pure and synchronous — the polling hook only does IO.

import type { UsagePeriod } from "@/lib/preferences";

import { buildHeatmap, type HeatmapPayload } from "@/lib/heatmap-helpers";
import {
  ONE_DAY_MS,
  SEVEN_DAY_MS,
  THIRTY_DAY_MS,
  aggregateDayRows,
  aggregateHourRows,
  aggregateMonthRows,
  aggregateQueueRows,
  dedupeQueue,
  localDayKey,
  localDayStartMs,
  type DailyUsage,
  type QueueBucketRow,
  type UsageWindow,
} from "@/lib/queue-lines";
import {
  mergeProjectsByRepo,
  parseProjectRepoMap,
  type ProjectRepoUsage,
  type RepoUrls,
} from "@/lib/project-repos";
import {
  summarizeSyncLog,
  syncFailureStreak,
  type SyncRunSummary,
} from "@/lib/sync-log";

export interface TrackerFileTexts {
  /** queue.jsonl — missing file reads as null (fresh install / no CLI). */
  queue: string | null;
  /** pause.flag.json — `{paused: true, at}` when collection is paused. */
  pause: string | null;
  /** queue.state.json — `{offset, updatedAt}` upload cursor. */
  queueState: string | null;
  /** logs/sync.log — rolling JSONL written by `tokenusage sync`. */
  syncLog: string | null;
  /** project.repos.state.json — confirmed `project_key → URL` map. */
  projectRepos: string | null;
}

export interface CliStatus {
  available: boolean;
  version: string | null;
}

/** A usage window whose project rows carry their confirmed repository URL. */
export interface MonitorWindow extends UsageWindow {
  projects: ProjectRepoUsage[];
}

/** One sparkline / trend bucket (hour / day / month) of the selected metric. */
export interface UsagePoint {
  /** Hour-of-day `0`–`23`, `YYYY-MM-DD`, or `YYYY-MM`. */
  key: string;
  tokens: number;
  costUsd: number;
  conversations: number;
  /** cached_input + cache_creation (cache-rate sparkline numerator). */
  cacheTokens: number;
  /** Stacked-composition splits for the trend chart (web TrendPoint 口径). */
  inputTokens: number;
  outputTokens: number;
}

/** 用量趋势卡 series for one period: daily + monthly buckets, oldest first. */
export interface TrendSeries {
  daily: UsagePoint[];
  monthly: UsagePoint[];
}

/** Sparkline buckets behind the four stat cards (per selected period). */
export interface UsageSeries {
  /** 今日: 24 local-hour buckets, zero-filled. */
  hours: UsagePoint[];
  /** Rolling last 30 local days, oldest first (7D slices the last 7). */
  days: UsagePoint[];
  /** Last 12 local months, oldest first (总计). */
  months: UsagePoint[];
}

export interface MonitorSnapshot {
  today: MonitorWindow;
  week: MonitorWindow;
  /** Rolling 30-day window (近 30 天 mix-card period). */
  month: MonitorWindow;
  /** Whole local history (总计 mix-card period; the queue is never rotated). */
  all: MonitorWindow;
  /** Previous equal-length windows backing the stat cards' 环比 badges. */
  yesterday: MonitorWindow;
  prevWeek: MonitorWindow;
  prevMonth: MonitorWindow;
  /** Sparkline buckets: hours for 今日, days for 7D/30D, months for 总计. */
  series: UsageSeries;
  /** 用量趋势卡 series per period (daily + monthly buckets of that window). */
  trend: Record<UsagePeriod, TrendSeries>;
  /**
   * Deduped queue rows, kept for on-demand drill-down (project detail folds
   * its own daily / per-source series). Never serialized anywhere.
   */
  rows: QueueBucketRow[];
  /** Bytes of queue.jsonl the CLI hasn't uploaded yet (size - offset). */
  pendingBytes: number;
  /** Total size of queue.jsonl in bytes (proxy for queue growth). */
  queueBytes: number;
  paused: boolean;
  pausedAt: string | null;
  lastRun: SyncRunSummary | null;
  lastError: { ts: string; msg: string } | null;
  /** Consecutive failed sync runs (D4 failure alert threshold). */
  failureStreak: number;
  /** Message of the newest error in the current failing streak. */
  failureMessage: string | null;
  /** Paired instance dashboard URL (from CLI config, read-only). */
  dashboardUrl: string | null;
  /** Confirmed `project_key → repository URL` map (may be empty). */
  repoUrls: RepoUrls;
  /** Full-year activity heatmap (web 活跃热力图 payload shape). */
  heatmap: HeatmapPayload;
  /** When this snapshot was composed (ms) — the "更新于" stamp. */
  updatedAt: number;
  cli: CliStatus;
}

export const DEFAULT_DASHBOARD_URL = "https://token-usage.baiwumm.com";

export function buildMonitorSnapshot(
  files: TrackerFileTexts,
  cli: CliStatus,
  dashboardUrl: string | null,
  nowMs: number = Date.now(),
): MonitorSnapshot {
  const queueText = files.queue ?? "";
  const repoUrls = parseProjectRepoMap(files.projectRepos);
  // One dedupe pass feeds every window and the heatmap day fold.
  const rows: QueueBucketRow[] = dedupeQueue(queueText);
  const dayStart = localDayStartMs(nowMs);
  const today = withRepoLinks(
    aggregateQueueRows(rows, dayStart, nowMs),
    repoUrls,
  );
  const week = withRepoLinks(
    aggregateQueueRows(rows, nowMs - SEVEN_DAY_MS, nowMs),
    repoUrls,
  );
  const month = withRepoLinks(
    aggregateQueueRows(rows, nowMs - THIRTY_DAY_MS, nowMs),
    repoUrls,
  );
  const all = withRepoLinks(aggregateQueueRows(rows, 0, nowMs), repoUrls);
  const yesterday = withRepoLinks(
    aggregateQueueRows(rows, dayStart - ONE_DAY_MS, dayStart),
    repoUrls,
  );
  const prevWeek = withRepoLinks(
    aggregateQueueRows(rows, nowMs - 2 * SEVEN_DAY_MS, nowMs - SEVEN_DAY_MS),
    repoUrls,
  );
  const prevMonth = withRepoLinks(
    aggregateQueueRows(rows, nowMs - 2 * THIRTY_DAY_MS, nowMs - THIRTY_DAY_MS),
    repoUrls,
  );
  const series = buildUsageSeries(rows, nowMs);
  const trend: Record<UsagePeriod, TrendSeries> = {
    today: buildTrendSeries(rows, dayStart, nowMs, true),
    "7d": buildTrendSeries(rows, nowMs - SEVEN_DAY_MS, nowMs, true),
    "30d": buildTrendSeries(rows, nowMs - THIRTY_DAY_MS, nowMs, true),
    all: buildTrendSeries(rows, 0, nowMs, false),
  };

  const { pendingBytes, queueBytes } = queueSizes(
    files.queue,
    files.queueState,
  );
  const pause = parsePauseFlag(files.pause);
  const { lastRun, lastError } = summarizeSyncLog(files.syncLog ?? "");
  const failure = syncFailureStreak(files.syncLog ?? "");
  const heatmap = buildHeatmap(rows, nowMs);

  return {
    today,
    week,
    month,
    all,
    yesterday,
    prevWeek,
    prevMonth,
    series,
    trend,
    rows,
    pendingBytes,
    queueBytes,
    paused: pause.paused,
    pausedAt: pause.at,
    lastRun,
    lastError,
    failureStreak: failure.streak,
    failureMessage: failure.message,
    dashboardUrl,
    repoUrls,
    heatmap,
    updatedAt: nowMs,
    cli,
  };
}

/** Swap the raw project rows for repo-merged ones (one row per repository). */
function withRepoLinks(window: UsageWindow, repoUrls: RepoUrls): MonitorWindow {
  return {
    ...window,
    projects: mergeProjectsByRepo(
      window.projects,
      repoUrls,
      window.totalTokens,
    ),
  };
}

const SERIES_DAYS = 30;
const SERIES_MONTHS = 12;

/** Window start (inclusive) for a mix-card / trend period. */
export function periodStartMs(period: UsagePeriod, nowMs: number): number {
  if (period === "today") return localDayStartMs(nowMs);
  if (period === "7d") return nowMs - SEVEN_DAY_MS;
  if (period === "30d") return nowMs - THIRTY_DAY_MS;

  return 0;
}

function toPoint(key: string, entry: DailyUsage | undefined): UsagePoint {
  return {
    key,
    tokens: entry?.tokens ?? 0,
    costUsd: entry?.costUsd ?? 0,
    conversations: entry?.conversations ?? 0,
    cacheTokens: entry?.cacheTokens ?? 0,
    inputTokens: entry?.inputTokens ?? 0,
    outputTokens: entry?.outputTokens ?? 0,
  };
}

/**
 * 用量趋势卡 series: daily + monthly buckets of the window, oldest first.
 * Preset windows zero-fill the daily buckets (今天 / 7D / 30D — the bar chart
 * keeps its calendar shape); 总计 keeps only the days with data (years of
 * empty bars would be noise).
 */
function buildTrendSeries(
  rows: QueueBucketRow[],
  startMs: number,
  nowMs: number,
  zeroFillDays: boolean,
): TrendSeries {
  const dayMap = aggregateDayRows(rows, startMs, nowMs);
  let daily: UsagePoint[];

  if (zeroFillDays) {
    daily = [];
    const start = new Date(startMs);

    start.setHours(0, 0, 0, 0);
    for (let cursor = start.getTime(); cursor <= nowMs;) {
      daily.push(toPoint(localDayKey(cursor), dayMap.get(localDayKey(cursor))));
      const next = new Date(cursor);

      next.setDate(next.getDate() + 1);
      cursor = next.getTime();
    }
  } else {
    daily = [...dayMap.keys()]
      .sort()
      .map((key) => toPoint(key, dayMap.get(key)));
  }

  const monthMap = aggregateMonthRows(rows, startMs, nowMs);
  const monthly = [...monthMap.keys()]
    .sort()
    .map((key) => toPoint(key, monthMap.get(key)));

  return { daily, monthly };
}

/**
 * Sparkline buckets behind the stat cards: 24 zero-filled hour slots for
 * 今日, the rolling last 30 local days for 7D/30D, and the last 12 local
 * months for 总计. Same deduped rows as every window, so the mini charts and
 * the headline numbers can never disagree.
 */
function buildUsageSeries(rows: QueueBucketRow[], nowMs: number): UsageSeries {
  const hourMap = aggregateHourRows(rows, localDayStartMs(nowMs), nowMs);
  const hours = Array.from({ length: 24 }, (_, hour) =>
    toPoint(String(hour), hourMap.get(String(hour))),
  );

  const dayMap = aggregateDayRows(
    rows,
    nowMs - SERIES_DAYS * ONE_DAY_MS,
    nowMs,
  );
  const days: UsagePoint[] = [];

  for (let index = SERIES_DAYS - 1; index >= 0; index -= 1) {
    const key = localDayKey(nowMs - index * ONE_DAY_MS);

    days.push(toPoint(key, dayMap.get(key)));
  }

  const monthMap = aggregateMonthRows(rows, 0, nowMs);
  const months = [...monthMap.keys()]
    .sort()
    .slice(-SERIES_MONTHS)
    .map((key) => toPoint(key, monthMap.get(key)));

  return { hours, days, months };
}

function queueSizes(
  queueText: string | null,
  stateText: string | null,
): { pendingBytes: number; queueBytes: number } {
  // Byte sizes, not char counts: offset in queue.state.json is a byte
  // cursor. ASCII-heavy JSONL makes char≈byte, but compute honestly.
  const encoder = new TextEncoder();
  const queueBytes = queueText === null ? 0 : encoder.encode(queueText).length;
  let offset = 0;

  if (stateText !== null) {
    try {
      const parsed: unknown = JSON.parse(stateText);

      if (
        parsed !== null &&
        typeof parsed === "object" &&
        typeof (parsed as { offset?: unknown }).offset === "number"
      ) {
        offset = (parsed as { offset: number }).offset;
      }
    } catch {
      // Corrupt state → treat as fully uploaded rather than alarming.
      offset = queueBytes;
    }
  }

  return { pendingBytes: Math.max(0, queueBytes - offset), queueBytes };
}

function parsePauseFlag(text: string | null): {
  paused: boolean;
  at: string | null;
} {
  if (text === null) return { paused: false, at: null };
  try {
    const parsed: unknown = JSON.parse(text);

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { paused?: unknown }).paused === true
    ) {
      const at = (parsed as { at?: unknown }).at;

      return {
        paused: true,
        at: typeof at === "string" ? at : null,
      };
    }

    return { paused: false, at: null };
  } catch {
    // Corrupt flag must never silently stop collection — CLI semantics.
    return { paused: false, at: null };
  }
}
