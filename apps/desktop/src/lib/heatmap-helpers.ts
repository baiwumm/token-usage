// Full-year activity heatmap (desktop-plan §12.4; operator review 2026-11-10
// asked for 近一年 and the web dashboard's presentation): local-day totals from
// the same last-wins queue baseline the summary cards use, laid out as
// Monday-aligned weeks with month markers and a weekday ruler.

import { aggregateQueueDays, localDayKey } from "@/lib/queue-lines";

export const HEATMAP_WEEKS = 53;
export const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

export interface HeatmapDay {
  /** Local `YYYY-MM-DD`. */
  day: string;
  tokens: number;
  conversations: number;
}

/** Month label anchored to the week column that contains the 1st. */
export interface HeatmapMonth {
  index: number;
  label: string;
}

export interface HeatmapData {
  days: HeatmapDay[];
  months: HeatmapMonth[];
  totalTokens: number;
  maxTokens: number;
}

/** Local Monday 00:00 of the first of the 53 displayed weeks. */
export function heatmapStartMs(nowMs: number): number {
  const today = new Date(nowMs);

  today.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday; shift so Monday is 0.
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime());

  start.setDate(today.getDate() - sinceMonday - (HEATMAP_WEEKS - 1) * 7);

  return start.getTime();
}

/**
 * One marker per month present in the range, placed on the week column of its
 * 1st. The first displayed day also gets a marker so a range that starts
 * mid-month is not unlabeled (the web heatmap does the same).
 */
export function buildMonthMarkers(days: HeatmapDay[]): HeatmapMonth[] {
  const markers: HeatmapMonth[] = [];
  let previousColumn = -1;

  days.forEach((entry, index) => {
    if (index !== 0 && !entry.day.endsWith("-01")) return;
    const column = Math.floor(index / 7);

    if (column === previousColumn) return;
    previousColumn = column;
    markers.push({
      index: column,
      label: `${Number(entry.day.slice(5, 7))}月`,
    });
  });

  return markers;
}

export function buildHeatmap(text: string, nowMs: number): HeatmapData {
  const startMs = heatmapStartMs(nowMs);
  const byDay = aggregateQueueDays(text, startMs, nowMs);
  const days: HeatmapDay[] = [];
  const start = new Date(startMs);

  for (let index = 0; index < HEATMAP_DAYS; index += 1) {
    const date = new Date(start.getTime());

    date.setDate(start.getDate() + index);
    const key = localDayKey(date.getTime());
    const usage = byDay.get(key);

    days.push({
      day: key,
      tokens: usage?.tokens ?? 0,
      conversations: usage?.conversations ?? 0,
    });
  }

  return {
    days,
    months: buildMonthMarkers(days),
    totalTokens: days.reduce((sum, day) => sum + day.tokens, 0),
    maxTokens: days.reduce((max, day) => Math.max(max, day.tokens), 0),
  };
}

/**
 * 0 = no usage, 1–4 = quartiles of the busiest day in the window. A window
 * with any usage keeps its quiet days at level 0 (empty), matching the web
 * heatmap's five-step scale.
 */
export function heatmapLevel(tokens: number, maxTokens: number): number {
  if (tokens <= 0) return 0;
  if (maxTokens <= 0) return 1;
  const ratio = tokens / maxTokens;

  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;

  return 4;
}
