// Canvas share-card engine (web 同款移植, desktop-plan §12.13). Variants live
// in sibling files and draw from ShareCardData only; the preview on the
// dialog is the same data URL the actions export, so what you see is what
// you get. The web's `<a download>` export is replaced by the Rust
// `save_to_downloads` bridge (lib/save-file.ts); copying keeps the
// ClipboardItem path with a boolean-fail fallback to saving.

import type { ShareCardCopy } from "./copy";
import type { ShareCardData, ShareCardVariant } from "./types";

import { SIZE as broadsheetSize, drawBroadsheet } from "./broadsheet";
import { SIZE as neonSize, drawNeon } from "./neon";
import { SIZE as receiptSize, drawReceipt } from "./receipt";
import { SIZE as vinylSize, drawVinyl } from "./vinyl";
import { SHARE_CARD_COPY } from "./copy";

export type {
  ShareCardData,
  ShareCardVariant,
  ShareHeatmapCell,
} from "./types";
export { buildShareHook } from "./share-hook-helpers";

interface ShareVariantDef {
  id: ShareCardVariant;
  width: number;
  height: number;
  draw: (
    ctx: CanvasRenderingContext2D,
    data: ShareCardData,
    copy: ShareCardCopy,
  ) => void;
}

const VARIANTS: Record<ShareCardVariant, ShareVariantDef> = {
  broadsheet: {
    id: "broadsheet",
    width: broadsheetSize.width,
    height: broadsheetSize.height,
    draw: (ctx, data, copy) => drawBroadsheet(ctx, data, copy.broadsheet),
  },
  receipt: {
    id: "receipt",
    width: receiptSize.width,
    height: receiptSize.height,
    draw: (ctx, data, copy) => drawReceipt(ctx, data, copy.receipt),
  },
  neon: {
    id: "neon",
    width: neonSize.width,
    height: neonSize.height,
    draw: (ctx, data, copy) => drawNeon(ctx, data, copy.neon),
  },
  vinyl: {
    id: "vinyl",
    width: vinylSize.width,
    height: vinylSize.height,
    draw: (ctx, data, copy) => drawVinyl(ctx, data, copy.vinyl),
  },
};

/** Registry order is the switcher order; labels come from the copy module. */
export const SHARE_VARIANTS: Array<{
  id: ShareCardVariant;
  width: number;
  height: number;
}> = (Object.keys(VARIANTS) as ShareCardVariant[]).map((id) => ({
  id,
  width: VARIANTS[id].width,
  height: VARIANTS[id].height,
}));

export function getShareVariantSize(id: ShareCardVariant): {
  width: number;
  height: number;
} {
  return { width: VARIANTS[id].width, height: VARIANTS[id].height };
}

/** Draw at 2x and return the PNG data URL. */
export function drawShareCard(
  variant: ShareCardVariant,
  data: ShareCardData,
): string {
  const def = VARIANTS[variant];
  const scale = 2;
  const canvas = document.createElement("canvas");

  canvas.width = def.width * scale;
  canvas.height = def.height * scale;

  const ctx = canvas.getContext("2d");

  if (!ctx) throw new Error("canvas unavailable");
  ctx.scale(scale, scale);
  def.draw(ctx, data, SHARE_CARD_COPY);

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
