// Shared tier visuals for the achievement surface: the metal palette that
// paints a badge's outer ring, the classes used by the tier chip and the tier
// bars, and the per-achievement hue that tints the glow.
//
// The bitmap artwork is tier-agnostic (one image per achievement, reused for
// all five tiers), so the tier lives entirely in this palette: the ring metal
// plus the label colours.

import { TIERS, type TierKey } from "@/lib/achievements/catalog";

export type MetalPalette = {
  light: string;
  mid: string;
  deep: string;
};

/** One metal per tier; the king metal is the iridescent one. */
export const TIER_METALS: Record<TierKey, MetalPalette> = {
  bronze: { light: "#ffd9a8", mid: "#c4762f", deep: "#6d3a12" },
  silver: { light: "#ffffff", mid: "#b8c1cd", deep: "#646d7b" },
  gold: { light: "#fff3bd", mid: "#e5ad38", deep: "#8a5a10" },
  diamond: { light: "#e9fbff", mid: "#63c6ea", deep: "#25698d" },
  king: { light: "#ffe7a6", mid: "#df67c6", deep: "#5731c4" },
};

/** Locked badges never show a tier metal — they stay neutral grey. */
export const LOCKED_METAL: MetalPalette = {
  light: "#dfe3ea",
  mid: "#a7aeb9",
  deep: "#6e7480",
};

/** Per-achievement hue pair: the face glow and a complementary accent. */
const HUES: Record<string, { hue: number; accent: number }> = {
  token_titan: { hue: 42, accent: 18 },
  wordsmith: { hue: 330, accent: 285 },
  cachekeeper: { hue: 168, accent: 200 },
  veteran: { hue: 24, accent: 0 },
  big_day: { hue: 46, accent: 8 },
  cache_alchemy: { hue: 275, accent: 315 },
  marathon_session: { hue: 205, accent: 245 },
  model_symphony: { hue: 292, accent: 330 },
  streak: { hue: 14, accent: 38 },
  marathoner: { hue: 120, accent: 172 },
  weekend_warrior: { hue: 348, accent: 20 },
  night_owl: { hue: 248, accent: 210 },
  polyglot: { hue: 190, accent: 225 },
  multitool: { hue: 88, accent: 142 },
  project_hopper: { hue: 310, accent: 258 },
  project_devotion: { hue: 356, accent: 320 },
  fleet: { hue: 216, accent: 186 },
  sync_diligence: { hue: 142, accent: 96 },
};

const FALLBACK_HUE = { hue: 220, accent: 260 };

export function achievementHue(id: string): { hue: number; accent: number } {
  return HUES[id] ?? FALLBACK_HUE;
}

/** Metal for a tier number (0 = locked). */
export function tierMetal(tier: number): MetalPalette {
  if (tier < 1) return LOCKED_METAL;

  const key = TIERS[tier - 1].key;

  return TIER_METALS[key];
}

/** Metal chip classes for the tier label in the dialog. */
export function tierChipClass(tier: number): string {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

  if (tier < 1) return `${base} border-border bg-default/50 text-muted`;

  const key = TIERS[tier - 1].key;

  switch (key) {
    case "bronze":
      return `${base} border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300`;
    case "silver":
      return `${base} border-slate-400/35 bg-slate-400/10 text-slate-600 dark:text-slate-300`;
    case "gold":
      return `${base} border-yellow-500/35 bg-yellow-400/10 text-yellow-700 dark:text-yellow-300`;
    case "diamond":
      return `${base} border-sky-400/35 bg-sky-400/10 text-sky-700 dark:text-sky-300`;
    case "king":
      return `${base} border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300`;
  }
}

/** Text colour for a tier label (the wall cell prints the tier in metal). */
export function tierTextClass(tier: number): string {
  if (tier < 1) return "text-muted";

  const key = TIERS[tier - 1].key;

  switch (key) {
    case "bronze":
      return "text-amber-700 dark:text-amber-300";
    case "silver":
      return "text-slate-600 dark:text-slate-300";
    case "gold":
      return "text-yellow-700 dark:text-yellow-300";
    case "diamond":
      return "text-sky-700 dark:text-sky-300";
    case "king":
      return "text-fuchsia-700 dark:text-fuchsia-300";
  }
}

/** Track segment classes, one per tier (the king segment is iridescent). */
export function tierBarClass(tier: TierKey): string {
  switch (tier) {
    case "bronze":
      return "bg-linear-to-r from-amber-600 to-orange-300";
    case "silver":
      return "bg-linear-to-r from-slate-500 to-slate-200";
    case "gold":
      return "bg-linear-to-r from-amber-500 to-yellow-200";
    case "diamond":
      return "bg-linear-to-r from-sky-500 to-cyan-200";
    case "king":
      return "bg-linear-to-r from-fuchsia-500 via-amber-300 to-violet-500";
  }
}
