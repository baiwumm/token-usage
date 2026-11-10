// 12-week activity heatmap (desktop-plan §12.4): local-day totals from the
// same last-wins queue baseline the summary cards use, laid out as
// Monday-aligned weeks. The last column always ends on Sunday, so days after
// today exist as empty cells instead of shifting the weekday rows.

import { aggregateQueueDays, localDayKey } from "@/lib/queue-lines";

export const HEATMAP_WEEKS = 12;
export const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

export interface HeatmapDay {
  /** Local `YYYY-MM-DD`. */
  day: string;
  tokens: number;
  conversations: number;
}

export interface HeatmapData {
  days: HeatmapDay[];
  totalTokens: number;
  maxTokens: number;
}

/** Local Monday 00:00 of the first of the 12 displayed weeks. */
export function heatmapStartMs(nowMs: number): number {
  const today = new Date(nowMs);

  today.setHours(0, 0, 0, 0);
  // getDay(): 0 = Sunday; shift so Monday is 0.
  const sinceMonday = (today.getDay() + 6) % 7;
  const start = new Date(today.getTime());

  start.setDate(today.getDate() - sinceMonday - (HEATMAP_WEEKS - 1) * 7);

  return start.getTime();
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
