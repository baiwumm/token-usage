// Neon (霓虹) — dark poster. Deep indigo field with procedural glow and fine
// noise (no bitmap assets), a 12-month heatmap grid as the hero visual, two
// fact bars and a three-tile stats row. Palette rides the brand accent.

import type { ShareCardCopy } from "@/lib/copy/share-card";
import type { ShareCardData } from "./types";

import {
  FONT_MONO,
  drawTracked,
  drawTrackedRight,
  fitFontSize,
  monthGrids,
  roundRectPath,
  seedFrom,
  seededRandom,
  truncateToWidth,
} from "./helpers";

export const SIZE = { width: 1080, height: 1620 };

const BG = "#0b0a1e";
const ACCENT = "#a78bfa";
const WHITE = "rgba(255,255,255,0.92)";
const DIM = "rgba(255,255,255,0.55)";
const FAINT = "rgba(255,255,255,0.38)";
const CARD_FILL = "rgba(255,255,255,0.045)";
const CARD_STROKE = "rgba(255,255,255,0.09)";
const HEATMAP_PALETTE = [
  "rgba(255,255,255,0.08)",
  "#312e81",
  "#4338ca",
  "#6366f1",
  ACCENT,
];

const MONTHS = [
  "",
  "1月",
  "2月",
  "3月",
  "4月",
  "5月",
  "6月",
  "7月",
  "8月",
  "9月",
  "10月",
  "11月",
  "12月",
];
const MONTHS_EN = [
  "",
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

export function drawNeon(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  copy: ShareCardCopy["neon"],
): void {
  const MARGIN = 72;
  const CONTENT = SIZE.width - MARGIN * 2;

  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE.width, SIZE.height);

  // Procedural glow + noise — deterministic, no bitmap asset.
  const glow = (x: number, y: number, radius: number, color: string) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);

    gradient.addColorStop(0, color);
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, SIZE.width, SIZE.height);
  };

  glow(SIZE.width - 200, 180, 560, "rgba(99,102,241,0.30)");
  glow(180, SIZE.height - 160, 620, "rgba(168,85,247,0.20)");
  const random = seededRandom(seedFrom(data.heroTokens));

  ctx.fillStyle = "rgba(255,255,255,0.022)";
  for (let index = 0; index < 900; index += 1) {
    ctx.fillRect(
      random() * SIZE.width,
      random() * SIZE.height,
      1 + random(),
      1 + random(),
    );
  }

  // Header
  const headerY = 96;

  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(MARGIN, headerY - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = DIM;
  ctx.font = `600 13px ${FONT_MONO}`;
  drawTracked(ctx, "TOKEN USAGE", MARGIN + 20, headerY, 6);
  ctx.fillStyle = WHITE;
  ctx.font = `700 16px ${FONT_MONO}`;
  const period = truncateToWidth(ctx, data.periodLabel, 360);
  const periodWidth = ctx.measureText(period).width;

  ctx.fillText(period, MARGIN + CONTENT - periodWidth, headerY);

  // Hero
  let y = 186;

  ctx.fillStyle = ACCENT;
  ctx.font = `600 13px ${FONT_MONO}`;
  drawTracked(ctx, copy.yearTokens, MARGIN, y, 5);
  const heroSize = fitFontSize(ctx, data.heroTokens, CONTENT, 122, 64, 700);

  ctx.fillStyle = WHITE;
  ctx.fillText(data.heroTokens, MARGIN, y + heroSize + 14);
  y += heroSize + 34;

  if (data.hook) {
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.font = `400 20px ${FONT_MONO}`;
    ctx.fillText(
      truncateToWidth(ctx, `“${data.hook}”`, CONTENT),
      MARGIN,
      y + 20,
    );
    y += 56;
  }

  // Heatmap card — 12 month grids, 4 columns × 3 rows
  const cardY = y + 22;
  const cardHeight = 652;

  roundRectPath(ctx, MARGIN, cardY, CONTENT, cardHeight, 24);
  ctx.fillStyle = CARD_FILL;
  ctx.fill();
  ctx.strokeStyle = CARD_STROKE;
  ctx.lineWidth = 1;
  ctx.stroke();

  const inner = MARGIN + 36;
  const innerWidth = CONTENT - 72;

  ctx.fillStyle = FAINT;
  ctx.font = `600 12px ${FONT_MONO}`;
  drawTracked(ctx, copy.heatmapTitle, inner, cardY + 44, 5);
  ctx.font = `400 12px ${FONT_MONO}`;
  let legendX = MARGIN + CONTENT - 36;

  ctx.fillStyle = DIM;
  drawTrackedRight(ctx, copy.more, legendX, cardY + 44, 2);
  for (let level = 4; level >= 0; level -= 1) {
    legendX -= 16;
    ctx.fillStyle = HEATMAP_PALETTE[level];
    roundRectPath(ctx, legendX, cardY + 32, 12, 12, 3);
    ctx.fill();
    legendX -= 4;
  }
  ctx.fillStyle = DIM;
  drawTrackedRight(ctx, copy.less, legendX, cardY + 44, 2);

  if (data.heatmap) {
    const months = monthGrids(data.heatmap.weeks);
    const gapX = 28;
    const colWidth = (innerWidth - gapX * 3) / 4;
    const cell = Math.min((colWidth - 2 * 2) / 7, 24);
    const gridWidth = cell * 7 + 2 * 2;
    const rowHeight = 22 + 6 * (cell + 2);
    const monthLabels = data.locale === "zh" ? MONTHS : MONTHS_EN;

    months.forEach((month, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const x = inner + col * (colWidth + gapX) + (colWidth - gridWidth) / 2;
      const top = cardY + 78 + row * (rowHeight + 18);

      ctx.fillStyle = FAINT;
      ctx.font = `400 11px ${FONT_MONO}`;
      const label = monthLabels[month.month] ?? "";

      ctx.fillText(label, x, top + 9);
      month.rows.forEach((cells, rowIndex) => {
        cells.forEach((cellData, dayIndex) => {
          if (!cellData || cellData.level < 0) return;
          const level = Math.min(4, Math.max(0, cellData.level));

          ctx.fillStyle = HEATMAP_PALETTE[level];
          roundRectPath(
            ctx,
            x + dayIndex * (cell + 2),
            top + 18 + rowIndex * (cell + 2),
            cell,
            cell,
            4,
          );
          ctx.fill();
        });
      });
    });
  }

  // Fact bars — streak + top model
  y = cardY + cardHeight + 24;
  const facts: Array<[string, string]> = [];

  if (data.heatmap && data.heatmap.streakDays > 0) {
    facts.push([copy.streak, `${data.heatmap.streakDays} ${copy.daysUnit}`]);
  }
  if (data.topModelName) {
    facts.push([copy.topModel, data.topModelName]);
  }
  facts.slice(0, 2).forEach(([label, value]) => {
    roundRectPath(ctx, MARGIN, y, CONTENT, 64, 18);
    ctx.fillStyle = CARD_FILL;
    ctx.fill();
    ctx.strokeStyle = CARD_STROKE;
    ctx.stroke();
    ctx.fillStyle = DIM;
    ctx.font = `400 14px ${FONT_MONO}`;
    ctx.fillText(label, MARGIN + 28, y + 39);
    ctx.fillStyle = WHITE;
    ctx.font = `700 18px ${FONT_MONO}`;
    const text = truncateToWidth(ctx, value, CONTENT - 200);
    const width = ctx.measureText(text).width;

    ctx.fillText(text, MARGIN + CONTENT - 28 - width, y + 40);
    y += 76;
  });

  // Stats tiles — cost / sessions / active days
  y += 8;
  const tileWidth = (CONTENT - 32) / 3;
  const tiles: Array<[string, string]> = [[copy.cost, data.costLabel]];

  if (data.sessionsLabel) tiles.push([copy.sessions, data.sessionsLabel]);
  tiles.push([copy.activeDays, data.activeDaysLabel]);

  tiles.slice(0, 3).forEach(([label, value], index) => {
    const x = MARGIN + index * (tileWidth + 16);

    roundRectPath(ctx, x, y, tileWidth, 96, 18);
    ctx.fillStyle = CARD_FILL;
    ctx.fill();
    ctx.strokeStyle = CARD_STROKE;
    ctx.stroke();
    ctx.fillStyle = FAINT;
    ctx.font = `400 11px ${FONT_MONO}`;
    ctx.fillText(label, x + 24, y + 34);
    ctx.fillStyle = WHITE;
    ctx.font = `700 20px ${FONT_MONO}`;
    ctx.fillText(truncateToWidth(ctx, value, tileWidth - 48), x + 24, y + 68);
  });

  // Footer
  ctx.fillStyle = CARD_STROKE;
  ctx.fillRect(MARGIN, SIZE.height - 96, CONTENT, 1);
  ctx.fillStyle = DIM;
  ctx.font = `500 12px ${FONT_MONO}`;
  drawTrackedRight(ctx, copy.brand, MARGIN + CONTENT, SIZE.height - 62, 1);
  ctx.fillStyle = ACCENT;
  drawTracked(ctx, "token-usage.cc", MARGIN, SIZE.height - 62, 3);
}
