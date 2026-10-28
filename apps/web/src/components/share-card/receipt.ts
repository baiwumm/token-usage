// Receipt (小票) — thermal-printed usage statement. Maple Mono only, white
// paper, dashed rules, line items = models, decorative barcode, PAID stamp,
// perforated tear edges cut out of the canvas.

import type { ShareCardCopy } from "@/lib/copy/share-card";
import type { ShareCardData } from "./types";

import {
  FONT_MONO,
  drawTracked,
  letters,
  seedFrom,
  seededRandom,
  truncateToWidth,
} from "./helpers";

export const SIZE = { width: 800, height: 1240 };

const PAPER = "#fffdf8";
const INK = "#1f1b16";
const INK_SOFT = "#8d867a";
const STAMP = "#c2402a";

const MARGIN = 64;
const CONTENT = SIZE.width - MARGIN * 2;

function dashedRule(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1;
  ctx.setLineDash([2, 5]);
  ctx.beginPath();
  ctx.moveTo(MARGIN, y);
  ctx.lineTo(MARGIN + CONTENT, y);
  ctx.stroke();
  ctx.restore();
}

// Zigzag tear edges: punch triangles out of the paper top and bottom.
function tearEdges(ctx: CanvasRenderingContext2D): void {
  const tooth = 16;
  const depth = 9;

  ctx.save();
  ctx.globalCompositeOperation = "destination-out";
  ctx.fillStyle = "#000";
  for (const edge of [0, SIZE.height - depth]) {
    ctx.beginPath();
    ctx.moveTo(0, edge);
    for (let x = 0; x < SIZE.width; x += tooth) {
      ctx.lineTo(x + tooth / 2, edge + (edge === 0 ? depth : -depth));
      ctx.lineTo(x + tooth, edge);
    }
    ctx.lineTo(SIZE.width, edge === 0 ? -1 : SIZE.height + 1);
    ctx.lineTo(0, edge === 0 ? -1 : SIZE.height + 1);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

export function drawReceipt(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  copy: ShareCardCopy["receipt"],
): void {
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE.width, SIZE.height);
  tearEdges(ctx);

  // Header
  let y = 92;

  ctx.textAlign = "left";
  ctx.fillStyle = INK;
  ctx.font = `700 22px ${FONT_MONO}`;
  drawTracked(
    ctx,
    "TOKEN USAGE",
    (SIZE.width - letters(ctx, "TOKEN USAGE", 8)) / 2,
    y,
    8,
  );
  y += 32;
  ctx.font = `500 14px ${FONT_MONO}`;
  ctx.fillStyle = INK;
  const titleWidth = letters(ctx, copy.title, 4);

  drawTracked(ctx, copy.title, (SIZE.width - titleWidth) / 2, y, 4);
  y += 26;
  ctx.font = `400 11px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  const period = truncateToWidth(ctx, data.periodLabel, CONTENT);
  const periodWidth = letters(ctx, period, 2);

  drawTracked(ctx, period, (SIZE.width - periodWidth) / 2, y, 2);
  y += 22;
  dashedRule(ctx, y);

  // Line items — top models
  y += 30;
  ctx.font = `500 14px ${FONT_MONO}`;
  for (const row of data.models.slice(0, 6)) {
    ctx.fillStyle = INK;
    ctx.font = `500 14px ${FONT_MONO}`;
    ctx.fillText(truncateToWidth(ctx, row.name, CONTENT - 190), MARGIN, y);
    ctx.font = `400 12px ${FONT_MONO}`;
    ctx.fillStyle = INK_SOFT;
    const shareWidth = letters(ctx, row.share, 0);

    ctx.fillText(row.share, MARGIN + CONTENT - 190 - shareWidth - 12, y);
    ctx.fillStyle = INK;
    ctx.font = `700 14px ${FONT_MONO}`;
    const tokensWidth = ctx.measureText(row.tokens).width;

    ctx.fillText(row.tokens, MARGIN + CONTENT - tokensWidth, y);
    y += 28;
  }
  y += 4;
  dashedRule(ctx, y);

  // Totals
  y += 32;
  const row = (label: string, value: string, big = false) => {
    ctx.font = `400 13px ${FONT_MONO}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(label, MARGIN, y);
    ctx.fillStyle = INK;
    ctx.font = big ? `800 18px ${FONT_MONO}` : `700 15px ${FONT_MONO}`;
    ctx.fillText(value, MARGIN + CONTENT - ctx.measureText(value).width, y);
    y += big ? 38 : 30;
  };

  row(copy.subtotal, data.heroTokens, true);
  row(copy.cost, data.costLabel);
  row(copy.active, data.activeDaysLabel);
  if (data.sessionsLabel) row(copy.sessions, data.sessionsLabel);
  if (data.peakDay) {
    row(
      copy.peak,
      truncateToWidth(
        ctx,
        `${data.peakDay.label} · ${data.peakDay.tokens}`,
        CONTENT - 80,
      ),
    );
  }
  y += 4;
  dashedRule(ctx, y);

  // Decorative barcode + digits
  const barcodeY = 680;
  const random = seededRandom(seedFrom(data.heroTokens));
  let barX = MARGIN + 40;

  ctx.fillStyle = INK;
  while (barX < MARGIN + CONTENT - 40) {
    const width = 2 + Math.floor(random() * 4);

    ctx.fillRect(barX, barcodeY, width, 56);
    barX += width + 2 + Math.floor(random() * 3);
  }
  const digits = data.heroTokens.replace(/\D/g, "");

  ctx.font = `400 12px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  drawTracked(
    ctx,
    digits,
    (SIZE.width - letters(ctx, digits, 4)) / 2,
    barcodeY + 82,
    4,
  );

  // PAID stamp — rotated, double border
  ctx.save();
  ctx.translate(560, 900);
  ctx.rotate(-0.21);
  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = STAMP;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.roundRect(-105, -34, 210, 68, 8);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(-98, -27, 196, 54, 6);
  ctx.stroke();
  ctx.fillStyle = STAMP;
  ctx.font = `700 19px ${FONT_MONO}`;
  const paid = `${copy.paid} · PAID`;
  const paidWidth = letters(ctx, paid, 3);

  drawTracked(ctx, paid, -paidWidth / 2, 7, 3);
  ctx.restore();

  // Footer — anchored to the torn bottom
  ctx.fillStyle = INK;
  ctx.font = `500 13px ${FONT_MONO}`;
  const thanksWidth = letters(ctx, copy.thanks, 3);

  drawTracked(ctx, copy.thanks, (SIZE.width - thanksWidth) / 2, 1118, 3);
  dashedRule(ctx, 1148);
  ctx.font = `400 11px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  const brandWidth = letters(ctx, copy.brand, 2);

  drawTracked(ctx, copy.brand, (SIZE.width - brandWidth) / 2, 1180, 2);
}
