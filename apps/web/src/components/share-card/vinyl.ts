// Vinyl (唱片) — square album cover. A pressed disc whose grooves carry the
// year's heatmap as a 52-week color ring, a paper center label with the year,
// and a back-cover block: album = year, artist = top model, tracks = models.

import type { ShareCardCopy } from "@/lib/copy/share-card";
import type { ShareCardData } from "./types";

import {
  FONT_MONO,
  FONT_SERIF,
  drawTracked,
  drawTrackedRight,
  letters,
  truncateToWidth,
} from "./helpers";

export const SIZE = { width: 1080, height: 1080 };

const BG = "#171410";
const PAPER = "#f6f2e9";
const INK = "#221e18";
const INK_SOFT = "#6c6457";
const VERMILLION = "#c2402a";
const WHITE = "rgba(255,255,255,0.88)";
const DIM = "rgba(255,255,255,0.5)";
const HEATMAP_PALETTE = [
  "rgba(255,255,255,0.06)",
  "#312e81",
  "#4338ca",
  "#6366f1",
  "#818cf8",
];

export function drawVinyl(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  copy: ShareCardCopy["vinyl"],
): void {
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, SIZE.width, SIZE.height);

  // Disc
  const cx = SIZE.width / 2;
  const cy = 400;

  ctx.fillStyle = "#0d0b09";
  ctx.beginPath();
  ctx.arc(cx, cy, 296, 0, Math.PI * 2);
  ctx.fill();

  // Grooves
  ctx.strokeStyle = "rgba(255,255,255,0.035)";
  ctx.lineWidth = 1;
  for (let radius = 132; radius <= 288; radius += 7) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Heatmap ring — one segment per week, clockwise from the top
  if (data.heatmap) {
    const weeks = data.heatmap.weeks;
    const sweep = (Math.PI * 2) / Math.max(1, weeks.length);

    weeks.forEach((week, index) => {
      const level = week.find((cell) => cell.level >= 0)?.level ?? -1;

      if (level < 0) return;
      ctx.fillStyle = HEATMAP_PALETTE[Math.min(4, level)];
      ctx.beginPath();
      ctx.arc(
        cx,
        cy,
        252,
        -Math.PI / 2 + index * sweep,
        -Math.PI / 2 + (index + 1) * sweep,
      );
      ctx.arc(
        cx,
        cy,
        216,
        -Math.PI / 2 + (index + 1) * sweep,
        -Math.PI / 2 + index * sweep,
        true,
      );
      ctx.closePath();
      ctx.fill();
    });
  }

  // Center label
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.arc(cx, cy, 104, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK_SOFT;
  ctx.font = `600 10px ${FONT_MONO}`;
  const brandWidth = letters(ctx, "TOKEN USAGE", 4);

  drawTracked(ctx, "TOKEN USAGE", cx - brandWidth / 2, cy - 52, 4);
  ctx.fillStyle = VERMILLION;
  ctx.font = `600 9px ${FONT_MONO}`;
  const sideWidth = letters(ctx, "SIDE A", 3);

  drawTracked(ctx, "SIDE A", cx - sideWidth / 2, cy - 28, 3);
  const year = data.periodLabel.match(/\d{4}/)?.[0] ?? "";

  ctx.fillStyle = INK;
  ctx.font = `400 44px ${FONT_SERIF}`;
  ctx.fillText(year, cx - ctx.measureText(year).width / 2, cy + 18);
  if (data.topModelName) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = `400 11px ${FONT_MONO}`;
    const artist = truncateToWidth(ctx, data.topModelName, 160);
    const artistWidth = ctx.measureText(artist).width;

    ctx.fillText(artist, cx - artistWidth / 2, cy + 48);
  }
  ctx.fillStyle = BG;
  ctx.beginPath();
  ctx.arc(cx, cy, 13, 0, Math.PI * 2);
  ctx.fill();

  // Back cover — title / artist / runtime on the left, tracks on the right
  const textY = 790;

  ctx.fillStyle = PAPER;
  ctx.font = `400 48px ${FONT_SERIF}`;
  ctx.fillText(year || data.periodLabel, 72, textY);
  if (data.topModelName) {
    ctx.fillStyle = VERMILLION;
    ctx.font = `500 15px ${FONT_MONO}`;
    ctx.fillText(truncateToWidth(ctx, data.topModelName, 420), 72, textY + 40);
  }
  ctx.fillStyle = DIM;
  ctx.font = `400 12px ${FONT_MONO}`;
  ctx.fillText(copy.runtime, 72, textY + 78);
  ctx.fillStyle = WHITE;
  ctx.font = `700 17px ${FONT_MONO}`;
  ctx.fillText(truncateToWidth(ctx, data.heroTokens, 420), 72, textY + 106);

  const listX = 600;

  ctx.fillStyle = DIM;
  ctx.font = `600 11px ${FONT_MONO}`;
  drawTracked(ctx, copy.tracks, listX, textY, 5);
  ctx.fillStyle = "rgba(255,255,255,0.14)";
  ctx.fillRect(listX, textY + 12, 408, 1);
  data.models.slice(0, 4).forEach((model, index) => {
    const rowY = textY + 46 + index * 36;

    ctx.fillStyle = VERMILLION;
    ctx.font = `italic 400 18px ${FONT_SERIF}`;
    const side = `A${index + 1}`;

    ctx.fillText(side, listX, rowY);
    ctx.fillStyle = WHITE;
    ctx.font = `400 14px ${FONT_MONO}`;
    ctx.fillText(truncateToWidth(ctx, model.name, 260), listX + 40, rowY);
    ctx.font = `700 14px ${FONT_MONO}`;
    const tokensWidth = ctx.measureText(model.tokens).width;

    ctx.fillText(model.tokens, 1008 - tokensWidth, rowY);
  });
  if (data.topSourceName) {
    const labelY = textY + 46 + 4 * 36 + 8;

    ctx.fillStyle = DIM;
    ctx.font = `400 11px ${FONT_MONO}`;
    ctx.fillText(
      `${copy.label} · ${truncateToWidth(ctx, data.topSourceName, 300)}`,
      listX,
      labelY,
    );
  }

  // Footer
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.fillRect(72, 1012, 936, 1);
  ctx.fillStyle = VERMILLION;
  ctx.font = `500 12px ${FONT_MONO}`;
  drawTracked(ctx, "token-usage.cc", 72, 1048, 3);
  ctx.fillStyle = DIM;
  drawTrackedRight(ctx, copy.brand, 1008, 1048, 1);
}
