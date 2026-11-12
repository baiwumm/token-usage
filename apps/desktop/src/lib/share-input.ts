// Share-card payload projection (desktop-plan §12.13, web dashboard
// share-input 移植): pure projection of the monitor snapshot into the
// shared ShareCardData input (components/share-card). Calibers follow the
// desktop's accepted D9/D10 rules — the heatmap is 本机口径 and follows the
// header period (clipped grid, quartile levels like the heatmap card), while
// hero / cost / sources / models come from the same usage window the mix
// cards read. Returns null when the window has nothing to share.

import type { MonitorSnapshot } from "@/lib/monitor";
import type { UsagePeriod } from "@/lib/preferences";

import {
  buildShareHook,
  type ShareCardData,
  type ShareHeatmapCell,
} from "@/components/share-card";
import { localTzLabel } from "@/lib/heatmap-helpers";
import {
  formatCost,
  formatNumber,
  formatPercent,
  formatTokens,
} from "@/lib/format-tokens";
import { periodStartMs } from "@/lib/monitor";

export function buildShareInput({
  hostname,
  period,
  snapshot,
}: {
  hostname: string | null;
  period: UsagePeriod;
  snapshot: MonitorSnapshot;
}): ShareCardData | null {
  const window =
    period === "today"
      ? snapshot.today
      : period === "7d"
        ? snapshot.week
        : period === "30d"
          ? snapshot.month
          : snapshot.all;

  if (window.totalTokens <= 0) return null;

  const totalTokens = window.totalTokens;
  const shareOf = (value: number) =>
    totalTokens > 0 ? formatPercent(value / totalTokens) : "0%";
  const sortedSources = [...window.sources].sort(
    (first, second) => second.tokens - first.tokens,
  );
  const sortedModels = [...window.models].sort(
    (first, second) => second.tokens - first.tokens,
  );
  const topModel = sortedModels[0] ?? null;
  const year = new Date(snapshot.updatedAt).getFullYear();
  const heatmap = shareHeatmap(snapshot, period);

  return {
    handle: hostname || "Token Usage",
    periodLabel: sharePeriodLabel(period, snapshot.updatedAt),
    hook: buildShareHook({
      activeDays: heatmap?.activeDays ?? 0,
      modelCount: sortedModels.length,
      topModelName: topModel?.model ?? null,
      topModelPercent:
        topModel && totalTokens > 0 ? (topModel.tokens / totalTokens) * 100 : 0,
      year,
    }),
    heroTokens: formatTokens(totalTokens),
    heroTokensFull: formatNumber(totalTokens),
    costLabel: formatCost(window.totalCostUsd),
    activeDaysLabel: formatNumber(heatmap?.activeDays ?? 0),
    sessionsLabel:
      window.conversations > 0 ? formatNumber(window.conversations) : null,
    peakDay: peakDayOf(snapshot, period),
    sources: sortedSources.map((source) => ({
      name: source.source,
      tokens: formatTokens(source.tokens),
      tokensFull: formatNumber(source.tokens),
      share: shareOf(source.tokens),
    })),
    models: sortedModels.map((model) => ({
      name: model.model,
      tokens: formatTokens(model.tokens),
      tokensFull: formatNumber(model.tokens),
      share: shareOf(model.tokens),
    })),
    topModelName: topModel?.model ?? null,
    topSourceName: sortedSources[0]?.source ?? null,
    heatmap: heatmap?.payload ?? null,
    tickLabel: localTzLabel(),
    locale: "zh",
  };
}

/** "11月6日 — 11月12日" for the presets; the bare year for 总计. */
function sharePeriodLabel(period: UsagePeriod, nowMs: number): string {
  if (period === "all") return String(new Date(nowMs).getFullYear());
  const formatter = new Intl.DateTimeFormat("zh-CN", {
    day: "numeric",
    month: "short",
  });
  const fromMs = periodStartMs(period, nowMs);

  return `${formatter.format(fromMs)} — ${formatter.format(nowMs)}`;
}

function peakDayOf(
  snapshot: MonitorSnapshot,
  period: UsagePeriod,
): { label: string; tokens: string } | null {
  let peak: { key: string; tokens: number } | null = null;

  for (const point of snapshot.trend[period].daily) {
    if (peak === null || point.tokens > peak.tokens) {
      peak = { key: point.key, tokens: point.tokens };
    }
  }

  return peak && peak.tokens > 0
    ? { label: peak.key, tokens: formatTokens(peak.tokens) }
    : null;
}

interface ShareHeatmapProjection {
  payload: {
    weeks: ShareHeatmapCell[][];
    streakDays: number;
  };
  activeDays: number;
}

/**
 * The clipped period grid (same shape the heatmap card shows) projected onto
 * share cells: null slots → -1 (not a day), 0 stays 0, tokens → quartile
 * level against the window's busiest day (web 同款 thresholds). The streak
 * counts the longest consecutive run of active days in the same window.
 */
function shareHeatmap(
  snapshot: MonitorSnapshot,
  period: UsagePeriod,
): ShareHeatmapProjection | null {
  const startMs = periodStartMs(period, snapshot.updatedAt);
  const fromKey = localDayKey(startMs);
  let maxValue = 0;

  for (const week of snapshot.heatmap.weeks) {
    for (const cell of week) {
      if (!cell) continue;
      const tokens = cell.day < fromKey ? 0 : cell.totalTokens;

      if (tokens > maxValue) maxValue = tokens;
    }
  }

  const levelOf = (tokens: number): number => {
    if (tokens <= 0) return 0;
    if (maxValue === 0) return 1;
    const ratio = tokens / maxValue;

    if (ratio <= 0.25) return 1;
    if (ratio <= 0.5) return 2;
    if (ratio <= 0.75) return 3;

    return 4;
  };

  let activeDays = 0;
  const weeks: ShareHeatmapCell[][] = snapshot.heatmap.weeks.map((week) =>
    week.map((cell) => {
      if (!cell) return { day: "", level: -1 };
      const tokens = cell.day < fromKey ? 0 : cell.totalTokens;

      if (tokens > 0) activeDays += 1;

      return { day: cell.day, level: levelOf(tokens) };
    }),
  );

  return {
    payload: { weeks, streakDays: streakDaysOf(weeks) },
    activeDays,
  };
}

/** Longest run of calendar-consecutive days with level > 0. */
function streakDaysOf(weeks: ShareHeatmapCell[][]): number {
  const days = [
    ...new Set(
      weeks
        .flat()
        .filter((cell) => cell.level > 0)
        .map((cell) => cell.day),
    ),
  ].sort();

  let best = 0;
  let run = 0;
  let previous = "";

  for (const day of days) {
    if (
      previous !== "" &&
      new Date(`${day}T00:00:00Z`).getTime() -
        new Date(`${previous}T00:00:00Z`).getTime() ===
        86_400_000
    ) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    previous = day;
  }

  return best;
}

function localDayKey(ms: number): string {
  const date = new Date(ms);
  const pad = (value: number) => String(value).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
