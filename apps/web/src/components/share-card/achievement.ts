// Achievement medallion card — one badge, its tier and its value on a dark
// medal poster (docs/ui-spec.md 分享卡片). 1080 × 1350 is the export size, so
// the canvas draws at 1x; text waits for `document.fonts.ready` and the badge
// bitmap is a same-origin asset, so the canvas is never tainted.
//
// The tier palette is the same metal the badge wall uses (`achievement-tiers
// .ts`); a missing bitmap falls back to a metal disc with the name's initial,
// and the card still exports.

import type { AchievementShareData } from "@/lib/achievements/share";

import {
  FONT_MONO,
  FONT_SERIF,
  drawTracked,
  fillTemplate,
  fitFontSize,
  letters,
  loadShareImage,
  roundRectPath,
  truncateToWidth,
} from "./helpers";

import {
  TIER_METALS,
  TIER_RAMPS,
} from "@/components/achievements/achievement-tiers";
import { artworkScale } from "@/lib/achievements/art-fit";
import { SHARE_CARD_COPY } from "@/lib/copy/share-card";

export const ACHIEVEMENT_CARD = { width: 1080, height: 1350 };

const WIDTH = ACHIEVEMENT_CARD.width;
const HEIGHT = ACHIEVEMENT_CARD.height;
const MARGIN = 96;
const INK = "#f4f6f8";
const INK_SOFT = "rgba(244, 246, 248, 0.62)";
const HAIRLINE = "rgba(244, 246, 248, 0.14)";

/** `#rrggbb` → `rgba()` so the tier palette can tint the backdrop. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const red = parseInt(value.slice(0, 2), 16);
  const green = parseInt(value.slice(2, 4), 16);
  const blue = parseInt(value.slice(4, 6), 16);

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

export async function drawAchievementShareCard(
  data: AchievementShareData,
): Promise<string> {
  await document.fonts.ready;

  const copy = SHARE_CARD_COPY[data.locale].achievement;
  const ramp = TIER_RAMPS[data.tierKey];
  const metal = TIER_METALS[data.tierKey];
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  canvas.width = WIDTH;
  canvas.height = HEIGHT;

  if (!ctx) throw new Error("canvas unavailable");

  // Backdrop: deep ink with a tier-coloured glow behind the coin.
  ctx.fillStyle = "#0b0d12";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  const glow = ctx.createRadialGradient(540, 470, 40, 540, 470, 780);

  glow.addColorStop(0, withAlpha(ramp.mid, 0.34));
  glow.addColorStop(0.55, withAlpha(ramp.from, 0.1));
  glow.addColorStop(1, "rgba(11, 13, 18, 0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Top bar: brand on the left, handle on the right.
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = "rgba(244, 246, 248, 0.7)";
  ctx.font = `700 22px ${FONT_MONO}`;
  drawTracked(ctx, "TOKEN USAGE", MARGIN, 108, 8);

  if (data.handle) {
    ctx.font = `400 24px ${FONT_MONO}`;
    ctx.fillStyle = INK_SOFT;
    ctx.textAlign = "right";
    ctx.fillText(
      truncateToWidth(ctx, data.handle, WIDTH - MARGIN * 2 - 260),
      WIDTH - MARGIN,
      108,
    );
    ctx.textAlign = "left";
  }

  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 136);
  ctx.lineTo(WIDTH - MARGIN, 136);
  ctx.stroke();

  // Coin: metal ring over the bitmap (or a metal disc with the initial).
  const cx = WIDTH / 2;
  const cy = 470;
  const outer = 238;
  const ringWidth = 15;
  const clip = outer - ringWidth - 6;
  const image = await loadShareImage(data.art);

  ctx.beginPath();
  ctx.arc(cx, cy, clip + 2, 0, Math.PI * 2);
  ctx.fillStyle = "#05060a";
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, clip, 0, Math.PI * 2);
  ctx.clip();

  if (image) {
    const size = clip * 2 * artworkScale(data.id);

    ctx.drawImage(image, cx - size / 2, cy - size / 2, size, size);
  } else {
    const disc = ctx.createLinearGradient(
      cx - outer,
      cy - outer,
      cx + outer,
      cy + outer,
    );

    disc.addColorStop(0, metal.light);
    disc.addColorStop(0.5, metal.mid);
    disc.addColorStop(1, metal.deep);
    ctx.fillStyle = disc;
    ctx.fillRect(cx - clip, cy - clip, clip * 2, clip * 2);
    ctx.fillStyle = ramp.ink;
    ctx.font = `700 240px ${FONT_SERIF}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(Array.from(data.name)[0] ?? "?", cx, cy + 10);
  }
  ctx.restore();

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const ring = ctx.createLinearGradient(
    cx - outer,
    cy - outer,
    cx + outer,
    cy + outer,
  );

  ring.addColorStop(0, metal.light);
  ring.addColorStop(0.45, metal.mid);
  ring.addColorStop(1, metal.deep);
  ctx.strokeStyle = ring;
  ctx.lineWidth = ringWidth;
  ctx.beginPath();
  ctx.arc(cx, cy, outer - ringWidth / 2, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.28)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, outer - 0.75, 0, Math.PI * 2);
  ctx.stroke();

  // Tier pill in the metal ramp.
  ctx.font = `600 34px ${FONT_MONO}`;
  const labelWidth = letters(ctx, data.tierName, 6);
  const pillWidth = labelWidth + 88;
  const pillHeight = 72;
  const pillTop = 742;
  const pillGradient = ctx.createLinearGradient(
    cx - pillWidth / 2,
    0,
    cx + pillWidth / 2,
    0,
  );

  pillGradient.addColorStop(0, ramp.from);
  pillGradient.addColorStop(0.5, ramp.mid);
  pillGradient.addColorStop(1, ramp.to);
  roundRectPath(
    ctx,
    cx - pillWidth / 2,
    pillTop,
    pillWidth,
    pillHeight,
    pillHeight / 2,
  );
  ctx.fillStyle = pillGradient;
  ctx.fill();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.32)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = ramp.ink;
  ctx.textBaseline = "middle";
  drawTracked(
    ctx,
    data.tierName,
    cx - labelWidth / 2,
    pillTop + pillHeight / 2 + 1,
    6,
  );
  ctx.textBaseline = "alphabetic";

  // Name + description.
  const nameSize = fitFontSize(
    ctx,
    data.name,
    WIDTH - MARGIN * 2,
    80,
    42,
    700,
    FONT_SERIF,
  );

  ctx.font = `700 ${nameSize}px ${FONT_SERIF}`;
  ctx.fillStyle = INK;
  ctx.textAlign = "center";
  ctx.fillText(data.name, cx, 916);

  ctx.font = `400 30px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(
    truncateToWidth(ctx, data.description, WIDTH - MARGIN * 2),
    cx,
    970,
  );

  // Current value + landing day.
  ctx.font = `500 22px ${FONT_MONO}`;
  ctx.fillStyle = INK_SOFT;
  drawTracked(
    ctx,
    copy.currentValue,
    cx - letters(ctx, copy.currentValue, 5) / 2,
    1044,
    5,
  );

  const valueSize = fitFontSize(
    ctx,
    data.valueLabel,
    880,
    96,
    54,
    800,
    FONT_MONO,
  );

  ctx.font = `800 ${valueSize}px ${FONT_MONO}`;
  ctx.fillStyle = INK;
  ctx.fillText(data.valueLabel, cx, 1148);

  if (data.achievedDay) {
    const day = fillTemplate(copy.unlockedOn, { date: data.achievedDay });

    ctx.font = `400 26px ${FONT_MONO}`;
    ctx.fillStyle = INK_SOFT;
    ctx.fillText(day, cx, 1204);
  }

  // Footer.
  ctx.strokeStyle = HAIRLINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(MARGIN, 1258);
  ctx.lineTo(WIDTH - MARGIN, 1258);
  ctx.stroke();

  ctx.font = `500 22px ${FONT_MONO}`;
  ctx.fillStyle = "rgba(244, 246, 248, 0.5)";
  drawTracked(ctx, copy.brand, cx - letters(ctx, copy.brand, 4) / 2, 1308, 4);

  return canvas.toDataURL("image/png");
}
