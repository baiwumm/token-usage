// Broadsheet (特刊) — editorial magazine cover. Ivory paper, warm black ink,
// single vermillion accent; serif display for the hero number and the hook,
// Maple Mono for labels and body. Structure follows the upstream reference:
// masthead / byline / hero / hook / heatmap strip / full-width model roster
// (top five, numbered) / footer. Token counts print in full with separators,
// exactly like the upstream broadsheet.

import type { ShareCardCopy } from "@/lib/copy/share-card";
import type { ShareCardData } from "./types";

import {
  FONT_MONO,
  FONT_SERIF,
  drawTracked,
  drawTrackedRight,
  fillTemplate,
  fitFontSize,
  letters,
  truncateToWidth,
} from "./helpers";

export const SIZE = { width: 1200, height: 1630 };

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
  const MARGIN = 88;
  const CONTENT = SIZE.width - MARGIN * 2;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, SIZE.width, SIZE.height);

  // Masthead — brand dot + wordmark, issue line on the right
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
  drawTrackedRight(
    ctx,
    truncateToWidth(
      ctx,
      `${copy.issue} № ${data.periodLabel.toUpperCase()}`,
      CONTENT / 2,
    ),
    MARGIN + CONTENT,
    y,
    4,
  );

  ctx.fillStyle = RULE;
  ctx.fillRect(MARGIN, y + 22, CONTENT, 1);
  y += 78;

  // Byline — who is on the cover
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_MONO}`;
  drawTracked(ctx, copy.user, MARGIN, y, 5);
  ctx.fillStyle = INK;
  ctx.font = `italic 500 52px ${FONT_SERIF}`;
  ctx.fillText(
    truncateToWidth(ctx, data.handle, CONTENT - 260),
    MARGIN,
    y + 52,
  );
  if (data.tickLabel) {
    ctx.font = `500 13px ${FONT_MONO}`;
    ctx.fillStyle = INK_SOFT;
    drawTrackedRight(ctx, data.tickLabel, MARGIN + CONTENT, y + 50, 2);
  }
  y += 108;

  // Hero — full count with separators, serif display, shrunk to fit
  ctx.fillStyle = VERMILLION;
  ctx.font = `600 13px ${FONT_MONO}`;
  drawTracked(ctx, copy.totalTokens, MARGIN, y, 5);
  const heroSize = fitFontSize(
    ctx,
    data.heroTokensFull,
    CONTENT,
    188,
    96,
    400,
    FONT_SERIF,
  );
  const heroBaseline = y + 20 + heroSize * 0.72;

  ctx.fillStyle = INK;
  ctx.font = `400 ${heroSize}px ${FONT_SERIF}`;
  ctx.fillText(data.heroTokensFull, MARGIN, heroBaseline);
  // Georgia's old-style figures descend well below the baseline — reserve that
  // descender (≈0.3em) before the hook line, or the two collide.
  y = heroBaseline + 30 + heroSize * 0.32;

  // Hook — the quotable line, then the vermillion rule
  if (data.hook) {
    ctx.fillStyle = INK;
    ctx.font = `italic 400 34px ${FONT_SERIF}`;
    ctx.fillText(truncateToWidth(ctx, `“${data.hook}”`, CONTENT), MARGIN, y);
    y += 58;
  }
  ctx.fillStyle = VERMILLION;
  ctx.fillRect(MARGIN, y, CONTENT, 1);
  y += 30;

  // Stats row — spend on the left, active days on the right
  ctx.font = `500 14px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(`${copy.estSpend} · ${data.costLabel}`, MARGIN, y);
  drawTrackedRight(
    ctx,
    `${copy.activeDays} · ${data.activeDaysLabel}`,
    MARGIN + CONTENT,
    y,
    1,
  );
  y += 52;

  // Heatmap strip — "the year in print", days on record on the right
  if (data.heatmap && data.heatmap.weeks.length > 0) {
    const weeks = data.heatmap.weeks;
    let activeDays = 0;
    let totalDays = 0;

    for (const week of weeks) {
      for (const cell of week) {
        if (cell.level < 0) continue;
        totalDays += 1;
        if (cell.level > 0) activeDays += 1;
      }
    }

    ctx.fillStyle = INK;
    ctx.font = `600 13px ${FONT_MONO}`;
    drawTracked(ctx, copy.yearInPrint, MARGIN, y, 5);
    ctx.fillStyle = INK_SOFT;
    ctx.font = `500 12px ${FONT_MONO}`;
    drawTrackedRight(
      ctx,
      fillTemplate(copy.daysOnRecord, { active: activeDays, total: totalDays }),
      MARGIN + CONTENT,
      y,
      2,
    );
    y += 22;

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
    y += stripHeight + 44;
  }

  // Model roster — top five, one per row, numbered like a chart
  ctx.fillStyle = INK;
  ctx.font = `600 13px ${FONT_MONO}`;
  drawTracked(ctx, copy.models, MARGIN, y, 5);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_MONO}`;
  drawTrackedRight(ctx, copy.rosterSubtitle, MARGIN + CONTENT, y, 2);
  y += 20;
  ctx.fillStyle = INK;
  ctx.fillRect(MARGIN, y, CONTENT, 1);
  y += 10;

  const rows = data.models.slice(0, 5);

  if (rows.length === 0) {
    ctx.fillStyle = INK_SOFT;
    ctx.font = `italic 400 28px ${FONT_SERIF}`;
    ctx.fillText(copy.empty, MARGIN, y + 40);
  } else {
    const ROW_HEIGHT = 84;
    const INDEX_WIDTH = 52;
    const PERCENT_WIDTH = 68;
    const COLUMN_GAP = 16;

    rows.forEach((row, index) => {
      const baseline = y + 50;

      ctx.fillStyle = VERMILLION;
      ctx.font = `italic 400 34px ${FONT_SERIF}`;
      ctx.fillText(String(index + 1).padStart(2, "0"), MARGIN, baseline);

      // Tokens sit right-aligned before the share column; the name gets the
      // remaining width and ellipsizes.
      ctx.font = `400 28px ${FONT_SERIF}`;
      const tokensWidth = ctx.measureText(row.tokensFull).width;
      const tokensX =
        MARGIN + CONTENT - PERCENT_WIDTH - COLUMN_GAP - tokensWidth;

      ctx.fillStyle = INK;
      ctx.fillText(row.tokensFull, tokensX, baseline);

      ctx.font = `400 32px ${FONT_SERIF}`;
      ctx.fillText(
        truncateToWidth(
          ctx,
          row.name,
          tokensX - COLUMN_GAP - (MARGIN + INDEX_WIDTH + COLUMN_GAP),
        ),
        MARGIN + INDEX_WIDTH + COLUMN_GAP,
        baseline,
      );

      ctx.fillStyle = INK_SOFT;
      ctx.font = `500 13px ${FONT_MONO}`;
      drawTrackedRight(ctx, row.share, MARGIN + CONTENT, baseline - 2, 1);

      y += ROW_HEIGHT;
      ctx.fillStyle = RULE;
      ctx.fillRect(MARGIN, y, CONTENT, 1);
    });
  }

  // Footer — active days / streak on the left, CTA on the right
  const footerY = SIZE.height - MARGIN;

  ctx.fillStyle = INK;
  ctx.fillRect(MARGIN, footerY - 34, CONTENT, 1);

  ctx.font = `500 13px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  const activeText = `${copy.activeDays} ${fillTemplate(copy.daysCount, {
    days: data.activeDaysLabel,
  })}`;
  let footerX = MARGIN;

  drawTracked(ctx, activeText, footerX, footerY, 2);
  footerX += letters(ctx, activeText, 2) + 32;

  if (data.heatmap && data.heatmap.streakDays > 0) {
    drawTracked(
      ctx,
      `${copy.streak} ${fillTemplate(copy.daysCount, {
        days: data.heatmap.streakDays,
      })}`,
      footerX,
      footerY,
      2,
    );
  }

  ctx.font = `500 12px ${FONT_MONO}`;
  const site = "token-usage.cc";
  const prefix = `${copy.trackYours} → `;
  const prefixWidth = letters(ctx, prefix, 2);
  const siteWidth = letters(ctx, site, 2);
  const ctaX = MARGIN + CONTENT - prefixWidth - siteWidth;

  ctx.fillStyle = INK_SOFT;
  drawTracked(ctx, prefix, ctaX, footerY, 2);
  ctx.fillStyle = VERMILLION;
  drawTracked(ctx, site, ctaX + prefixWidth, footerY, 2);
}
