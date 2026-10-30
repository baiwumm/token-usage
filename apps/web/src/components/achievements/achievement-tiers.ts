// Shared tier visuals for the achievement surface: the metal palette that
// paints a badge's outer ring, the metallic ramp that paints the tier label
// and the tier track, and the per-achievement hue that tints the glow.
//
// The bitmap artwork is tier-agnostic (one image per achievement, reused for
// all five tiers), so the tier lives entirely in this palette: the ring metal
// plus the label colours.
//
// The metals follow the upstream TokenTracker tier palette (fixed hex, not
// Tailwind classes — the values live in SVG gradient stops and inline
// backgrounds, so they cannot react to the dark class): every tier is a
// mid tone → a narrow light band → a deep tone, which is what reads as metal.
// Upstream has four tiers; `king` is ours and follows the same recipe.

import { TIERS, type TierKey } from "@/lib/achievements/catalog";

export type MetalPalette = {
  /** The specular band. */
  light: string;
  /** The mid tone the band sits on. */
  mid: string;
  /** The shadow side. */
  deep: string;
};

/** One metal per tier; the king metal is the amethyst one. */
export const TIER_METALS: Record<TierKey, MetalPalette> = {
  bronze: { light: "#e8c3a0", mid: "#a06a44", deep: "#5c3a22" },
  silver: { light: "#f2f5f7", mid: "#aab3bb", deep: "#67707b" },
  gold: { light: "#ffe9a8", mid: "#c9971c", deep: "#8a6508" },
  diamond: { light: "#eafcff", mid: "#62b1e0", deep: "#7c6fd9" },
  king: { light: "#f5d0fe", mid: "#a855f7", deep: "#4c1d95" },
};

/** Locked badges never show a tier metal — they stay neutral grey. */
export const LOCKED_METAL: MetalPalette = {
  light: "#dde1de",
  mid: "#a8ada9",
  deep: "#7c817d",
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
  bronze: { from: "#a06a44", mid: "#e8c3a0", to: "#5c3a22", ink: "#3f2817" },
  silver: { from: "#aab3bb", mid: "#f2f5f7", to: "#67707b", ink: "#39424b" },
  gold: { from: "#c9971c", mid: "#ffe9a8", to: "#8a6508", ink: "#5c430e" },
  diamond: { from: "#62b1e0", mid: "#eafcff", to: "#7c6fd9", ink: "#27496d" },
  king: { from: "#a855f7", mid: "#f5d0fe", to: "#4c1d95", ink: "#3b0764" },
};

/** Neutral ramp for locked badges. */
export const LOCKED_RAMP: TierRamp = {
  from: "#a8ada9",
  mid: "#dde1de",
  to: "#7c817d",
  ink: "#6a706c",
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

/**
 * The ring gradient: the same mid → light → deep recipe as the label, but
 * rotated and with a narrower specular band (42 %), the way the upstream
 * badge coin frames its artwork.
 */
export function tierRingGradient(tier: number): string {
  const metal = tierMetal(tier);

  return `linear-gradient(135deg, ${metal.mid} 0%, ${metal.light} 42%, ${metal.deep} 100%)`;
}

/** The mid → light → deep stops for an SVG gradient, in draw order. */
export function tierRingStops(tier: number): [string, string, string] {
  const metal = tierMetal(tier);

  return [metal.mid, metal.light, metal.deep];
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
