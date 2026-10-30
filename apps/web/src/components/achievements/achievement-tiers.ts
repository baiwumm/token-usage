// Shared tier visuals for the achievement surface: the metal palette that
// paints a badge's outer ring, the metallic ramp that paints the tier label
// and the tier track, and the per-achievement hue that tints the glow.
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

/**
 * Metallic ramp for the tier label and the tier track: light → mid → deep,
 * with the text colour that stays legible on top of it. The same ramp paints
 * the tier badge label, the tier history track and the progress bar, so a
 * tier reads the same everywhere on the page.
 */
export type TierRamp = {
  from: string;
  mid: string;
  to: string;
  /** Text colour on top of the ramp. */
  ink: string;
};

export const TIER_RAMPS: Record<TierKey, TierRamp> = {
  bronze: { from: "#f3d8b8", mid: "#cf8a4c", to: "#8a5324", ink: "#452a12" },
  silver: { from: "#f7fafc", mid: "#c3ccd6", to: "#7d8794", ink: "#39424b" },
  gold: { from: "#fff2bd", mid: "#e5ad38", to: "#a0700f", ink: "#5c430e" },
  diamond: { from: "#e6fbff", mid: "#6ec9ec", to: "#2b7ba3", ink: "#1b4d70" },
  king: { from: "#f6d9ff", mid: "#cba6f7", to: "#8b5cf6", ink: "#4c1d95" },
};

/** Neutral ramp for locked badges. */
export const LOCKED_RAMP: TierRamp = {
  from: "#e6e8ec",
  mid: "#b3b9c2",
  to: "#7b828d",
  ink: "#3d434c",
};

/** Ramp for a tier number (0 = locked). */
export function tierRamp(tier: number): TierRamp {
  if (tier < 1) return LOCKED_RAMP;

  const key = TIERS[tier - 1].key;

  return TIER_RAMPS[key];
}

/** The metallic gradient itself, ready for a `background`. */
export function tierGradient(tier: number, angle = 120): string {
  const ramp = tierRamp(tier);

  return `linear-gradient(${angle}deg, ${ramp.from} 0%, ${ramp.mid} 55%, ${ramp.to} 100%)`;
}

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
