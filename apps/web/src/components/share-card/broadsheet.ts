// Broadsheet (特刊) — editorial magazine cover. Ivory paper, warm black ink,
// single vermillion accent; serif display for the hero number and the hook,
// Maple Mono for labels and body. Structure follows the upstream reference
// (masthead / byline / hero / hook / heatmap strip / lists / footer).

import type { ShareCardCopy } from "@/lib/copy/share-card";
import type { ShareCardData } from "./types";

import {
  FONT_MONO,
  FONT_SERIF,
  drawTracked,
  drawTrackedRight,
  fitFontSize,
  truncateToWidth,
} from "./helpers";

export const SIZE = { width: 1080, height: 1500 };

const PAPER = "#f6f2e9";
const INK = "#221e18";
const INK_SOFT = "#6c6457";
const RULE = "#d8d0bf";
const VERMILLION = "#c2402a";
const HEATMAP_PALETTE = [
  "#eee7d8",
  "#e8c9a8",
  "#e0996e",
  "#d4694b",
  VERMILLION,
];

export function drawBroadsheet(
  ctx: CanvasRenderingContext2D,
  data: ShareCardData,
  copy: ShareCardCopy["broadsheet"],
): void {
  const MARGIN = 84;
  const CONTENT = SIZE.width - MARGIN * 2;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE.width, SIZE.height);

  // Masthead
  let y = MARGIN + 14;

  ctx.fillStyle = VERMILLION;
  ctx.beginPath();
  ctx.arc(MARGIN, y - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `600 15px ${FONT_MONO}`;
  drawTracked(ctx, "TOKEN USAGE", MARGIN + 20, y, 6);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_MONO}`;
  const issueText = data.periodLabel.toUpperCase();

  drawTrackedRight(ctx, issueText, MARGIN + CONTENT, y, 4);

  ctx.fillStyle = RULE;
  ctx.fillRect(MARGIN, y + 22, CONTENT, 1);
  y += 78;

  // Byline
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_MONO}`;
  drawTracked(ctx, copy.user, MARGIN, y, 5);
  ctx.fillStyle = INK;
  ctx.font = `italic 500 52px ${FONT_SERIF}`;
  ctx.fillText(
    truncateToWidth(ctx, data.handle, CONTENT - 180),
    MARGIN,
    y + 52,
  );
  if (data.tickLabel) {
    ctx.font = `500 13px ${FONT_MONO}`;
    drawTrackedRight(ctx, data.tickLabel, MARGIN + CONTENT, y + 50, 2);
  }
  y += 108;

  // Hero — serif display number, shrunk to fit
  ctx.fillStyle = VERMILLION;
  ctx.font = `600 13px ${FONT_MONO}`;
  drawTracked(ctx, copy.totalTokens, MARGIN, y, 5);
  const heroSize = fitFontSize(
    ctx,
    data.heroTokens,
    CONTENT,
    170,
    60,
    600,
    FONT_SERIF,
  );

  ctx.fillStyle = INK;
  ctx.fillText(data.heroTokens, MARGIN, y + heroSize + 16);
  y += heroSize + 44;

  // Hook — the quotable line, then the vermillion rule
  if (data.hook) {
    ctx.fillStyle = INK;
    ctx.font = `italic 400 30px ${FONT_SERIF}`;
    ctx.fillText(
      truncateToWidth(ctx, `“${data.hook}”`, CONTENT),
      MARGIN,
      y + 30,
    );
    y += 52;
  }
  ctx.fillStyle = VERMILLION;
  ctx.fillRect(MARGIN, y, CONTENT, 2);
  y += 34;

  // Stats row
  ctx.font = `500 14px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  const spend = `${copy.estSpend} · ${data.costLabel}`;
  const days = `${copy.activeDays} · ${data.activeDaysLabel}`;

  ctx.fillText(spend, MARGIN, y);
  drawTrackedRight(ctx, days, MARGIN + CONTENT, y, 1);
  y += 56;

  // Heatmap strip — "the year in print"
  if (data.heatmap) {
    ctx.fillStyle = INK;
    ctx.font = `600 13px ${FONT_MONO}`;
    drawTracked(ctx, copy.yearInPrint, MARGIN, y, 5);
    y += 20;
    const weeks = data.heatmap.weeks;
    const gap = 3;
    const cell = Math.max(
      4,
      (CONTENT - (weeks.length - 1) * gap) / weeks.length,
    );
    const stripHeight = 7 * cell + 6 * gap;

    for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
      for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
        const level = weeks[weekIndex]?.[dayIndex]?.level ?? -1;

        ctx.fillStyle =
          level < 0 ? HEATMAP_PALETTE[0] : HEATMAP_PALETTE[Math.min(4, level)];
        ctx.fillRect(
          MARGIN + weekIndex * (cell + gap),
          y + dayIndex * (cell + gap),
          cell,
          cell,
        );
      }
    }
    y += stripHeight + 52;
  }

  // Share lists — sources and models side by side
  const columnWidth = (CONTENT - 48) / 2;
  const drawList = (
    title: string,
    rows: ShareCardData["models"],
    x: number,
  ) => {
    let rowY = y;

    ctx.fillStyle = INK;
    ctx.font = `600 13px ${FONT_MONO}`;
    drawTracked(ctx, title, x, rowY, 4);
    rowY += 28;
    ctx.fillStyle = RULE;
    ctx.fillRect(x, rowY - 12, columnWidth, 1);

    for (const row of rows.slice(0, 6)) {
      ctx.fillStyle = INK;
      ctx.font = `500 14px ${FONT_MONO}`;
      ctx.fillText(truncateToWidth(ctx, row.name, columnWidth - 150), x, rowY);
      ctx.font = `400 12px ${FONT_MONO}`;
      ctx.fillStyle = INK_SOFT;
      const meta = `${row.tokens} · ${row.share}`;

      drawTrackedRight(ctx, meta, x + columnWidth, rowY, 1);
      rowY += 14;
      ctx.fillStyle = PAPER;
      ctx.fillRect(x, rowY, columnWidth, 4);
      ctx.fillStyle = VERMILLION;
      const ratio = Math.min(
        1,
        Math.max(0, Number.parseFloat(row.share) / 100 || 0),
      );

      ctx.fillRect(x, rowY, columnWidth * ratio, 4);
      rowY += 30;
    }
  };

  drawList(copy.sources, data.sources, MARGIN);
  drawList(copy.models, data.models, MARGIN + columnWidth + 48);

  // Footer
  ctx.fillStyle = RULE;
  ctx.fillRect(MARGIN, SIZE.height - MARGIN - 30, CONTENT, 1);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_MONO}`;
  drawTracked(ctx, "token-usage.cc", MARGIN, SIZE.height - MARGIN, 3);
  drawTrackedRight(
    ctx,
    copy.brandLine,
    MARGIN + CONTENT,
    SIZE.height - MARGIN,
    2,
  );
}
