// Annual-review scoping for achievements (/wrapped).
//
// Tiers are computed once over the whole history and only ever go up
// (docs/achievements-plan.md §3.4), so the annual review needs no second
// compute pass and no year parameter on the API: the card asks for each
// achievement's tier at the END of the selected year, and tiers reached later
// stay hidden. `achieved_at` holds local-day `YYYY-MM-DD` strings, so the
// cutoff is a plain lexicographic compare (no timezone work here — the dates
// are already local to the caller).

import type { AchievementProgress } from "./types";

import { TIERS } from "./catalog";

export type ScopedAchievement = {
  progress: AchievementProgress;
  /** Tier reached on or before Dec 31 of the scoped year; 0 = not yet. */
  tier: number;
};

/** Highest tier reached on or before Dec 31 of `year`. */
export function tierAsOfYear(
  progress: AchievementProgress,
  year: number,
): number {
  const cutoff = `${year}-12-31`;
  let tier = 0;

  // TIERS is ordered bronze → king, so the last match wins.
  for (const entry of TIERS) {
    const reached = progress.achieved_at[entry.key];

    if (reached != null && reached <= cutoff) tier = entry.tier;
  }

  return tier;
}

/**
 * Achievements unlocked by the end of `year`, highest tier first. Payload order
 * is catalog order and `sort` is stable, so achievements sharing a tier keep
 * that order.
 */
export function achievementsAsOfYear(
  achievements: AchievementProgress[],
  year: number,
): ScopedAchievement[] {
  return achievements
    .map((progress) => ({ progress, tier: tierAsOfYear(progress, year) }))
    .filter((entry) => entry.tier >= 1)
    .sort((a, b) => b.tier - a.tier);
}
