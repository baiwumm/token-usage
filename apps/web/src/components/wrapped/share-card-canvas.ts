// Canvas-drawn share card for /wrapped: html-to-image hangs cloning this page's
// Tailwind-4/oklch computed styles (tried font on/off, pixelRatio 1/2 — the
// img.load step never settles), so the export draws the same design with Canvas
// 2D directly. Deterministic and resolution-independent.

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { DashboardPayload } from "@/lib/dashboard/api";

import { toast } from "@heroui/react";

export interface ShareCardContext {
  copy: WrappedCopy;
  year: number;
  totals: DashboardPayload["totals"] | undefined;
  highlights: Array<[string, string]>;
  formatTokens: (value: number) => string;
  formatCost: (value: number) => string;
  formatNumber: (value: number) => string;
}

export function drawShareCard({
  copy,
  year,
  totals: yearTotals,
  highlights,
  formatTokens,
  formatCost,
  formatNumber,
}: ShareCardContext): string {
  const width = 1200;
  const height = 630;
  const scale = 2;
  const canvas = document.createElement("canvas");

  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("canvas unavailable");
  ctx.scale(scale, scale);

  const font = '"Maple Mono CN", ui-monospace, monospace';

  // Backdrop: dark brand surface with a soft primary glow.
  ctx.fillStyle = "#101014";
  ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(
    width - 160,
    120,
    40,
    width - 160,
    120,
    520,
  );

  glow.addColorStop(0, "rgba(99,102,241,0.35)");
  glow.addColorStop(1, "rgba(99,102,241,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, width, height);

  ctx.textBaseline = "top";

  // Header.
  ctx.fillStyle = "#f1f1f3";
  ctx.font = `600 30px ${font}`;
  ctx.fillText("Token Usage", 64, 56);
  ctx.fillStyle = "rgba(241,241,243,0.55)";
  ctx.font = `400 16px ${font}`;
  ctx.fillText(copy.share.cardCaption, 64, 96);

  // Year headline — same title the preview shows.
  ctx.fillStyle = "#f1f1f3";
  ctx.font = `700 54px ${font}`;
  ctx.fillText(copy.share.cardTitle.replace("{year}", String(year)), 64, 150);

  // Big token number.
  ctx.fillStyle = "#818cf8";
  ctx.font = `700 64px ${font}`;
  ctx.fillText(formatTokens(yearTotals?.total_tokens ?? 0), 64, 236);
  ctx.fillStyle = "rgba(241,241,243,0.55)";
  ctx.font = `400 18px ${font}`;
  ctx.fillText(copy.cards.totalTokens, 64, 312);

  // Stat tiles.
  const tiles: Array<[string, string]> = [
    [copy.cards.cost, formatCost(yearTotals?.total_cost_usd ?? 0)],
    [copy.cards.conversations, formatNumber(yearTotals?.conversations ?? 0)],
    [copy.cards.activeDays, formatNumber(yearTotals?.active_days ?? 0)],
  ];
  let tileX = 64;

  for (const [label, value] of tiles) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath();
    ctx.roundRect(tileX, 368, 330, 108, 14);
    ctx.fill();
    ctx.fillStyle = "rgba(241,241,243,0.55)";
    ctx.font = `400 15px ${font}`;
    ctx.fillText(label, tileX + 22, 392);
    ctx.fillStyle = "#f1f1f3";
    ctx.font = `600 28px ${font}`;
    ctx.fillText(value, tileX + 22, 422);
    tileX += 354;
  }

  // Highlights line.
  if (highlights.length > 0) {
    ctx.fillStyle = "rgba(241,241,243,0.7)";
    ctx.font = `400 17px ${font}`;
    const line = highlights
      .map(([label, value]) => `${label}: ${value}`)
      .join("   ·   ");

    ctx.fillText(line.slice(0, 110), 64, 528);
  }

  return canvas.toDataURL("image/png");
}

// Draw, download and toast, with a 15s guard so a stuck canvas cannot leave
// the button spinning forever.
export async function exportShareCard(
  context: ShareCardContext,
): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("export timeout")), 15_000);
  });

  try {
    const dataUrl = await Promise.race([drawShareCard(context), timeout]);
    const link = document.createElement("a");

    link.download = `token-usage-wrapped-${context.year}.png`;
    link.href = dataUrl;
    link.click();
    toast.success(context.copy.share.exported);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";

    toast(
      detail
        ? `${context.copy.share.exportFailed} (${detail})`
        : context.copy.share.exportFailed,
    );
  } finally {
    clearTimeout(timer);
  }
}
