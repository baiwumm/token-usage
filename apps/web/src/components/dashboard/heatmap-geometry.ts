// Pure geometry and colour helpers for the activity heatmap. Kept out of the
// card so the render module only owns state and layout.

import type { HeatmapPayload } from "@/lib/dashboard/api";

import { canonicalSource } from "./sources";

export const MIN_CELL = 15;
export const CELL_GAP = 4;
export const LABEL_WIDTH = 26;
export const TARGET_WEEKS = 52;
export const TOOLTIP_HIDE_DELAY_MS = 80;

/** Level stops mirror the --heatmap-* tokens in globals.css. */
export const HEATMAP_STOPS = [
  "var(--heatmap-0)",
  "var(--heatmap-1)",
  "var(--heatmap-2)",
  "var(--heatmap-3)",
  "var(--heatmap-4)",
] as const;

export interface GridCell {
  day: string;
  /** Tokens of the active source selection (falls back to the raw total). */
  total: number;
  level: number;
  /** Canonical-id → tokens, aliases merged (Pi, DeepSeek Harness …). */
  sources: Record<string, number>;
}

export interface TooltipAnchor {
  day: string;
  cell: GridCell;
  left: number;
  top: number;
  bottom: number;
}

export function canonicalSources(
  raw: Record<string, number> | null,
): Record<string, number> {
  const out: Record<string, number> = {};

  for (const [source, tokens] of Object.entries(raw ?? {})) {
    const id = canonicalSource(source);

    out[id] = (out[id] ?? 0) + tokens;
  }

  return out;
}

export function weekdayIndex(day: string): number {
  // getUTCDay(): 0=Sun..6=Sat
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Columns are Mon-start weeks; the head is padded so the grid aligns. */
export function alignWeeks(
  payload: HeatmapPayload,
): Array<
  Array<{ day: string | null; sources: Record<string, number> | null }>
> {
  const flat = payload.weeks.flat();
  const first = flat[0]?.day;
  const pad = first != null ? (weekdayIndex(first) + 6) % 7 : 0;
  const columns: Array<
    Array<{ day: string | null; sources: Record<string, number> | null }>
  > = [];
  let row = 0;
  let col: Array<{
    day: string | null;
    sources: Record<string, number> | null;
  }> = [];

  for (let index = 0; index < pad; index++) {
    col.push({ day: null, sources: null });
  }
  for (const cell of flat) {
    col.push({ day: cell.day, sources: cell.sources });
    row += 1;
    if (row === 7) {
      columns.push(col);
      col = [];
      row = 0;
    }
  }
  if (col.length > 0) {
    while (col.length < 7) col.push({ day: null, sources: null });
    columns.push(col);
  }

  return columns;
}

/** Month labels positioned at the week column containing each month start. */
export function buildMonthMarkers(
  columns: number,
  lastDay: string,
  labels: Intl.DateTimeFormat,
): Array<{ index: number; label: string }> {
  if (columns <= 0) return [];
  const end = new Date(`${lastDay}T00:00:00Z`);
  // Anchor: the Sunday that starts the week containing `lastDay`.
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
