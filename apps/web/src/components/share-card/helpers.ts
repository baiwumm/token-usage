// Canvas 2D drawing helpers shared by the share-card variants.

import type { ShareHeatmapCell } from "./types";

export const FONT_MONO = '"Maple Mono CN", ui-monospace, monospace';
export const FONT_SERIF =
  'Georgia, "Times New Roman", "Songti SC", "SimSun", serif';

/** Width of `text` when drawn letter-by-letter with `spacing` between chars. */
export function letters(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
): number {
  let width = 0;

  for (const char of text) width += ctx.measureText(char).width + spacing;

  return Math.max(0, width - spacing);
}

/** Letter-spaced fillText, aligned left at `x`. */
export function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  spacing: number,
): void {
  let cursor = x;

  for (const char of text) {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width + spacing;
  }
}

/** Letter-spaced fillText, aligned so the run ends at `x` + width. */
export function drawTrackedRight(
  ctx: CanvasRenderingContext2D,
  text: string,
  rightX: number,
  y: number,
  spacing: number,
): void {
  drawTracked(ctx, text, rightX - letters(ctx, text, spacing), y, spacing);
}

/** Shrink `size` until `text` fits `maxWidth` (or `minSize`). */
export function fitFontSize(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  startSize: number,
  minSize: number,
  weight = 600,
  font = FONT_MONO,
): number {
  let size = startSize;

  ctx.font = `${weight} ${size}px ${font}`;
  while (ctx.measureText(text).width > maxWidth && size > minSize) {
    size -= 6;
    ctx.font = `${weight} ${size}px ${font}`;
  }

  return size;
}

/** Ellipsize `text` to `maxWidth` under the current font. */
export function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let sliced = text;

  while (sliced.length > 1 && ctx.measureText(`${sliced}…`).width > maxWidth) {
    sliced = sliced.slice(0, -1);
  }

  return `${sliced}…`;
}

/** Fill `{placeholders}` from `values`; unknown keys stay literal. */
export function fillTemplate(
  template: string,
  values: Record<string, string | number>,
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, radius);
}

/**
 * Deterministic PRNG (mulberry32) so decorative noise and barcodes render
 * identically on preview, export and re-export.
 */
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Stable numeric seed from a string (card content drives decoration). */
export function seedFrom(text: string): number {
  let hash = 2166136261;

  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

// One request per source: the achievement card is redrawn on every dialog
// open, and the badge bitmaps never change within a session.
const shareImages = new Map<string, Promise<HTMLImageElement | null>>();

/**
 * Load a same-origin image for the canvas (the badge artwork). Resolves null
 * when it cannot load — the caller draws its own placeholder, so a missing
 * asset never breaks the export.
 */
export function loadShareImage(src: string): Promise<HTMLImageElement | null> {
  const cached = shareImages.get(src);

  if (cached) return cached;

  const request = new Promise<HTMLImageElement | null>((resolve) => {
    const image = new Image();

    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = src;
  });

  shareImages.set(src, request);

  return request;
}

export interface MonthGrid {
  month: number;
  /** 7-column (Sunday-start) rows; null pads leading/trailing days. */
  rows: Array<Array<ShareHeatmapCell | null>>;
}

/**
 * Regroup Monday-start heatmap weeks into per-month Sunday-start mini grids
 * (3 columns × 4 rows on the neon card), newest 12 months.
 */
export function monthGrids(weeks: ShareHeatmapCell[][]): MonthGrid[] {
  const byMonth = new Map<string, ShareHeatmapCell[]>();

  for (const week of weeks) {
    for (const cell of week) {
      if (!cell?.day || cell.level < 0) continue;
      const key = cell.day.slice(0, 7);
      const bucket = byMonth.get(key);

      if (bucket) bucket.push(cell);
      else byMonth.set(key, [cell]);
    }
  }

  return [...byMonth.entries()]
    .sort(([first], [second]) => first.localeCompare(second))
    .slice(-12)
    .map(([key, cells]) => {
      const sorted = [...cells].sort((first, second) =>
        first.day.localeCompare(second.day),
      );
      const lead = new Date(`${sorted[0].day}T00:00:00Z`).getUTCDay();
      const padded: Array<ShareHeatmapCell | null> = [
        ...Array<null>(lead).fill(null),
        ...sorted,
      ];
      const rows: Array<Array<ShareHeatmapCell | null>> = [];

      for (let index = 0; index < padded.length; index += 7) {
        rows.push(padded.slice(index, index + 7));
      }
      const last = rows[rows.length - 1];

      while (last && last.length < 7) last.push(null);

      return { month: Number(key.slice(5, 7)), rows: rows.slice(0, 6) };
    });
}
