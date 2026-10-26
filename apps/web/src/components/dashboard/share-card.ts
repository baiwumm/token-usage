"use client";

// Dashboard share card: canvas-drawn PNG in the upstream "Broadsheet" spirit —
// ivory paper, warm ink, single vermillion accent, masthead, hero token count,
// a 52-week heatmap strip and source/model share lists. Drawn by hand because
// html-to-image hangs in this Tailwind4/oklch stack (recorded in
// docs/rewrite-plan.md §5 M4 note).

export interface ShareCardInput {
  handle: string;
  rangeLabel: string;
  totalTokens: string;
  totalTokensExact: string;
  costLabel: string;
  activeDays: number;
  sources: Array<{ name: string; tokens: string; share: string }>;
  models: Array<{ name: string; tokens: string; share: string }>;
  /** 52 columns × 7 rows of levels (0-4, -1 = no data / future). */
  heatmapLevels: number[][];
  tickLabel: string;
  locale: "zh" | "en";
}

const WIDTH = 1080;
const HEIGHT = 1500;
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

const FONT_BODY = '"Maple Mono CN", "Helvetica Neue", Arial, sans-serif';
const FONT_SERIF = 'Georgia, "Times New Roman", serif';

function letters(
  ctx: CanvasRenderingContext2D,
  text: string,
  spacing: number,
): number {
  let width = 0;

  for (const char of text) width += ctx.measureText(char).width + spacing;

  return Math.max(0, width - spacing);
}

function drawTracked(
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

export function drawShareCard(input: ShareCardInput): string {
  const scale = 2;
  const canvas = document.createElement("canvas");

  canvas.width = WIDTH * scale;
  canvas.height = HEIGHT * scale;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("canvas unavailable");
  ctx.scale(scale, scale);

  const MARGIN = 84;
  const CONTENT = WIDTH - MARGIN * 2;

  // Paper
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Masthead
  let y = MARGIN + 14;

  ctx.fillStyle = VERMILLION;
  ctx.beginPath();
  ctx.arc(MARGIN, y - 5, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.font = `600 15px ${FONT_BODY}`;
  drawTracked(ctx, "TOKEN USAGE", MARGIN + 20, y, 6);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_BODY}`;
  const issueText = input.rangeLabel.toUpperCase();
  const issueWidth = letters(ctx, issueText, 4);

  drawTracked(ctx, issueText, MARGIN + CONTENT - issueWidth, y, 4);

  ctx.fillStyle = RULE;
  ctx.fillRect(MARGIN, y + 22, CONTENT, 1);
  y += 78;

  // Byline
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_BODY}`;
  drawTracked(ctx, input.locale === "zh" ? "使用者" : "USER", MARGIN, y, 5);
  ctx.fillStyle = INK;
  ctx.font = `italic 500 52px ${FONT_SERIF}`;
  ctx.fillText(
    input.handle.length > 26 ? `${input.handle.slice(0, 25)}…` : input.handle,
    MARGIN,
    y + 52,
  );
  ctx.font = `500 13px ${FONT_BODY}`;
  const tickText = input.tickLabel;
  const tickWidth = letters(ctx, tickText, 2);

  drawTracked(ctx, tickText, MARGIN + CONTENT - tickWidth, y + 50, 2);
  y += 108;

  // Hero
  ctx.fillStyle = VERMILLION;
  ctx.font = `600 13px ${FONT_BODY}`;
  drawTracked(
    ctx,
    input.locale === "zh" ? "总 TOKENS" : "TOTAL TOKENS",
    MARGIN,
    y,
    5,
  );
  ctx.fillStyle = INK;
  const heroText = input.totalTokens;
  let heroSize = 170;

  ctx.font = `600 ${heroSize}px ${FONT_BODY}`;
  while (ctx.measureText(heroText).width > CONTENT && heroSize > 60) {
    heroSize -= 6;
    ctx.font = `600 ${heroSize}px ${FONT_BODY}`;
  }
  ctx.fillText(heroText, MARGIN, y + heroSize + 16);
  y += heroSize + 56;

  // Hook rule + stats row
  ctx.fillStyle = VERMILLION;
  ctx.fillRect(MARGIN, y, CONTENT, 2);
  y += 34;
  ctx.font = `500 14px ${FONT_BODY}`;
  ctx.fillStyle = INK_SOFT;
  const spend = `${input.locale === "zh" ? "预估费用" : "EST. SPEND"} · ${input.costLabel}`;
  const days = `${input.locale === "zh" ? "活跃天数" : "ACTIVE DAYS"} · ${input.activeDays}`;

  ctx.fillText(spend, MARGIN, y);
  const daysWidth = letters(ctx, days, 1);

  drawTracked(ctx, days, MARGIN + CONTENT - daysWidth, y, 1);
  y += 56;

  // Heatmap strip — "the year in print"
  ctx.fillStyle = INK;
  ctx.font = `600 13px ${FONT_BODY}`;
  drawTracked(
    ctx,
    input.locale === "zh" ? "全年用量" : "THE YEAR IN PRINT",
    MARGIN,
    y,
    5,
  );
  y += 20;
  const weeks = input.heatmapLevels;
  const gap = 3;
  const cell = Math.max(4, (CONTENT - (weeks.length - 1) * gap) / weeks.length);
  const stripHeight = 7 * cell + 6 * gap;

  for (let weekIndex = 0; weekIndex < weeks.length; weekIndex += 1) {
    for (let dayIndex = 0; dayIndex < 7; dayIndex += 1) {
      const level = weeks[weekIndex]?.[dayIndex] ?? -1;

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

  // Share lists — sources and models side by side
  const columnWidth = (CONTENT - 48) / 2;
  const drawList = (
    title: string,
    rows: Array<{ name: string; tokens: string; share: string }>,
    x: number,
  ) => {
    let rowY = y;

    ctx.fillStyle = INK;
    ctx.font = `600 13px ${FONT_BODY}`;
    drawTracked(ctx, title, x, rowY, 4);
    rowY += 28;
    ctx.fillStyle = RULE;
    ctx.fillRect(x, rowY - 12, columnWidth, 1);

    for (const row of rows.slice(0, 6)) {
      ctx.fillStyle = INK;
      ctx.font = `500 14px ${FONT_BODY}`;
      const name =
        row.name.length > 22 ? `${row.name.slice(0, 21)}…` : row.name;

      ctx.fillText(name, x, rowY);
      ctx.font = `400 12px ${FONT_BODY}`;
      ctx.fillStyle = INK_SOFT;
      const meta = `${row.tokens} · ${row.share}`;
      const metaWidth = letters(ctx, meta, 1);

      drawTracked(ctx, meta, x + columnWidth - metaWidth, rowY, 1);
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

  drawList(input.locale === "zh" ? "来源" : "SOURCES", input.sources, MARGIN);
  drawList(
    input.locale === "zh" ? "模型" : "MODELS",
    input.models,
    MARGIN + columnWidth + 48,
  );

  // Footer
  ctx.fillStyle = RULE;
  ctx.fillRect(MARGIN, HEIGHT - MARGIN - 30, CONTENT, 1);
  ctx.fillStyle = INK_SOFT;
  ctx.font = `500 12px ${FONT_BODY}`;
  drawTracked(ctx, "token-usage.cc", MARGIN, HEIGHT - MARGIN, 3);
  const brand =
    input.locale === "zh"
      ? "自托管 Token 用量追踪"
      : "Self-hosted token tracking";
  const brandWidth = letters(ctx, brand, 2);

  drawTracked(ctx, brand, MARGIN + CONTENT - brandWidth, HEIGHT - MARGIN, 2);

  return canvas.toDataURL("image/png");
}

export async function copyPngDataUrl(dataUrl: string): Promise<boolean> {
  try {
    const blob = await (await fetch(dataUrl)).blob();

    await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);

    return true;
  } catch {
    return false;
  }
}

export function downloadPngDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");

  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
}
