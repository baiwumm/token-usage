// Year-wide activity heatmap data + grid geometry (desktop-plan §12.4, web
// 仪表盘「活跃热力图」移植轮 2026-11-11): local-day totals with per-day source
// splits from the same last-wins queue baseline as the summary cards, laid
// out as 53 Monday-aligned week columns the ported card renders directly.
// Geometry constants and the width fit are ported from web's
// heatmap-geometry.ts / use-responsive-weeks.ts so both UIs size identically
// (15 px floor, 窄屏裁周 — the accepted web behavior).

import type { QueueBucketRow } from "@/lib/queue-lines";
import type { UsagePeriod } from "@/lib/preferences";

import {
  aggregateDayRows,
  localDayKey,
  localDayStartMs,
} from "@/lib/queue-lines";
import { canonicalSource } from "@/lib/source-logos";

export const HEATMAP_WEEKS = 52;
export const HEATMAP_DAYS = HEATMAP_WEEKS * 7;

export const MIN_CELL = 15;
export const CELL_GAP = 4;
export const LABEL_WIDTH = 26;
export const TOOLTIP_HIDE_DELAY_MS = 80;

/** Colour stops read by the card; same `--heatmap-*` vars as the web. */
export const HEATMAP_STOPS = [
  "var(--heatmap-0)",
  "var(--heatmap-1)",
  "var(--heatmap-2)",
  "var(--heatmap-3)",
  "var(--heatmap-4)",
] as const;

/** One grid slot: a local day with its total and canonicalized sources. */
export interface HeatmapCell {
  day: string;
  totalTokens: number;
  /** Canonical source id → tokens (aliases merged: trae-cn + trae → trae). */
  sources: Record<string, number>;
}

export interface HeatmapPayload {
  /**
   * Week columns of 7 slots, Monday-aligned via `alignWeeks` (web 同款):
   * the head of the first column is null-padded, days after `to` do not
   * exist, and the trailing slots of the last column stay null.
   */
  weeks: Array<Array<HeatmapCell | null>>;
  /** Local `YYYY-MM-DD` of the last displayed day (today). */
  to: string;
  /** Days with any usage in the window. */
  activeDays: number;
  totalTokens: number;
}

/** Tooltip anchor shared by the card and its portalled tooltip. */
export interface TooltipAnchor {
  day: string;
  cell: HeatmapCell;
  left: number;
  top: number;
  bottom: number;
}

/**
 * Local 00:00 of the first of the 364 displayed days: web window semantics
 * (`from = to − weeks*7 + 1`), so the grid always ends at today and never
 * renders future days.
 */
export function heatmapStartMs(nowMs: number): number {
  const today = new Date(nowMs);

  today.setHours(0, 0, 0, 0);
  const start = new Date(today.getTime());

  start.setDate(today.getDate() - (HEATMAP_DAYS - 1));

  return start.getTime();
}

/**
 * First local day the heatmap covers for a period (2026-11-11 acceptance
 * round 3: the card follows the header filter): today / the last 7 / the last
 * 30 calendar days, and the whole year for 总计. Day granular, so 7D covers
 * today plus the six days before it.
 */
export function heatmapPeriodStartMs(
  nowMs: number,
  period: UsagePeriod,
): number {
  if (period === "all") return 0;
  const today = localDayStartMs(nowMs);

  if (period === "today") return today;

  return today - (period === "7d" ? 6 : 29) * 86_400_000;
}

/**
 * Clip the year grid to a period start: days before `startMs` become null
 * slots, leading all-null columns are dropped, and totals / active days
 * recompute from what remains. `all` (start 0) is returned unchanged, so the
 * card keeps its full 52-week shape for 总计.
 */
export function clipHeatmap(
  payload: HeatmapPayload,
  startMs: number,
): HeatmapPayload {
  if (startMs <= 0) return payload;
  const from = localDayKey(startMs);
  const weeks = payload.weeks.map((column) =>
    column.map((cell) => (cell && cell.day >= from ? cell : null)),
  );
  const firstKept = weeks.findIndex((column) =>
    column.some((cell) => cell !== null),
  );
  const clipped = firstKept <= 0 ? weeks : weeks.slice(firstKept);
  let activeDays = 0;
  let totalTokens = 0;

  for (const cell of clipped.flat()) {
    if (!cell) continue;
    totalTokens += cell.totalTokens;
    if (cell.totalTokens > 0) activeDays += 1;
  }

  return { weeks: clipped, to: payload.to, activeDays, totalTokens };
}

/** getUTCDay() of a `YYYY-MM-DD` key: 0 = Sunday … 6 = Saturday (web 同款). */
export function weekdayIndex(day: string): number {
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/**
 * Monday-aligned week columns from the flat day cells (web alignWeeks 同款):
 * the head is padded to the first Monday, the tail to a full 7-row column.
 */
export function alignWeeks(
  cells: HeatmapCell[],
): Array<Array<HeatmapCell | null>> {
  const first = cells[0]?.day;
  const pad = first != null ? (weekdayIndex(first) + 6) % 7 : 0;
  const columns: Array<Array<HeatmapCell | null>> = [];
  let column: Array<HeatmapCell | null> = [];

  for (let index = 0; index < pad; index += 1) {
    column.push(null);
  }
  for (const cell of cells) {
    column.push(cell);
    if (column.length === 7) {
      columns.push(column);
      column = [];
    }
  }
  if (column.length > 0) {
    while (column.length < 7) column.push(null);
    columns.push(column);
  }

  return columns;
}

/**
 * Month labels positioned at the week column containing each month start
 * (web buildMonthMarkers 同款: derived from the columns count + the last day,
 * so a narrowed window that drops weeks keeps its labels consistent).
 */
export function buildMonthMarkers(
  columns: number,
  lastDay: string,
  labels: Intl.DateTimeFormat,
): Array<{ index: number; label: string }> {
  if (columns <= 0) return [];
  const end = new Date(`${lastDay}T00:00:00Z`);
  // Anchor: the Sunday ending the (Monday-start) week containing `lastDay`.
  const endWeekStart = new Date(end);

  endWeekStart.setUTCDate(end.getUTCDate() - end.getUTCDay());
  const start = new Date(endWeekStart);

  start.setUTCDate(endWeekStart.getUTCDate() - (columns - 1) * 7);

  const markers: Array<{ index: number; label: string }> = [];
  const used = new Set<number>();

  for (let back = 11; back >= 0; back -= 1) {
    const month = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - back, 1),
    );
    const index = Math.floor(
      (month.getTime() - start.getTime()) / (7 * 86_400_000),
    );

    if (index < 0 || index >= columns || used.has(index)) continue;
    used.add(index);
    markers.push({ index, label: labels.format(month) });
  }

  return markers;
}

export function buildHeatmap(
  rows: QueueBucketRow[],
  nowMs: number,
): HeatmapPayload {
  const startMs = heatmapStartMs(nowMs);
  const byDay = aggregateDayRows(rows, startMs, nowMs);
  const cells: HeatmapCell[] = [];
  const start = new Date(startMs);
  let totalTokens = 0;
  let activeDays = 0;

  for (let index = 0; index < HEATMAP_DAYS; index += 1) {
    const date = new Date(start.getTime());

    date.setDate(start.getDate() + index);
    const key = localDayKey(date.getTime());
    const usage = byDay.get(key);
    const sources: Record<string, number> = {};

    if (usage) {
      for (const [source, tokens] of Object.entries(usage.sources)) {
        const id = canonicalSource(source);

        sources[id] = (sources[id] ?? 0) + tokens;
      }
    }
    const dayTokens = usage?.tokens ?? 0;

    totalTokens += dayTokens;
    if (dayTokens > 0) activeDays += 1;
    cells.push({ day: key, totalTokens: dayTokens, sources });
  }

  return {
    weeks: alignWeeks(cells),
    to: localDayKey(nowMs),
    activeDays,
    totalTokens,
  };
}

/** Local timezone label (UTC+08:00 style) for the card footer. */
export function localTzLabel(): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;

    return name && name !== "GMT" ? name.replace("GMT", "UTC") : "UTC+00:00";
  } catch {
    return "UTC";
  }
}

/**
 * Pure fit calculation, ported from web's use-responsive-weeks.ts so the
 * right-edge clipping regression can be asserted without a DOM. The rendered
 * template is `LABEL_WIDTHpx repeat(weeks, cellSizepx)` with `CELL_GAP`
 * between every adjacent column — i.e. `weeks` gaps, including the
 * label→first-week one.
 */
export function fitHeatmapWidth(
  width: number,
  maxWeeks: number,
): { weeks: number; cellSize: number } {
  if (maxWeeks <= 0 || width <= 0) return { weeks: 0, cellSize: MIN_CELL };

  const fitted = Math.floor((width - LABEL_WIDTH) / (MIN_CELL + CELL_GAP));
  const weeks = Math.max(1, Math.min(maxWeeks, fitted || 1));

  if (weeks >= maxWeeks) {
    const gaps = maxWeeks * CELL_GAP;

    return {
      weeks: maxWeeks,
      cellSize: Math.max(
        1,
        Math.floor((width - LABEL_WIDTH - gaps) / maxWeeks),
      ),
    };
  }

  return { weeks, cellSize: MIN_CELL };
}

/** Total px width the grid will actually occupy. */
export function heatmapGridWidth(weeks: number, cellSize: number): number {
  return LABEL_WIDTH + weeks * cellSize + weeks * CELL_GAP;
}
