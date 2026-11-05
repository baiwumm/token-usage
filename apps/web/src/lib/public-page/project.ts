// Pure assembly of the /u/<token> payload (docs/badge.md §4.7 / §6).
// Keeping IO out of this module keeps the page contract testable: the loader
// supplies the heatmap payload and the unlocked achievements, this function
// only derives the all-time header facts and shapes the response.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { BadgeData } from "@/lib/badge/types";
import type { HeatmapPayload } from "@/lib/dashboard/api";
import type { PublicPageData, PublicPageMeta } from "./types";

import {
  capDayPoints,
  fillZeroDays,
  longestStreakDays,
  normalizeDayTotals,
  peakDay,
} from "./heatmap";

export type PublicPageInput = {
  account: BadgeData;
  heatmap: HeatmapPayload;
  achievements: readonly AchievementProgress[];
  avatarDataUri: string | null;
  timezone: string;
  dayTotals: Map<string, number>;
  sourceCount: number;
  modelCount: number;
  modelCosts: Record<string, number>;
  updatedAt: string | null;
};

/** Only unlocked items, catalog order preserved (the dialog needs full data). */
export function unlockedAchievements(
  progress: readonly AchievementProgress[],
): AchievementProgress[] {
  return progress.filter((achievement) => achievement.tier >= 1);
}

export function assemblePublicPageData(input: PublicPageInput): PublicPageData {
  const activeDays = normalizeDayTotals(input.dayTotals);
  const { recent } = capDayPoints(activeDays);
  const filled = fillZeroDays(recent);
  const meta: PublicPageMeta = {
    firstDay: activeDays[0]?.day ?? null,
    lastDay: activeDays[activeDays.length - 1]?.day ?? null,
    updatedAt: input.updatedAt,
    sourceCount: input.sourceCount,
    modelCount: input.modelCount,
    longestStreakDays: longestStreakDays(filled),
    peakDay: peakDay(activeDays),
  };

  return {
    account: input.account,
    meta,
    avatarDataUri: input.avatarDataUri,
    timezone: input.timezone,
    heatmap: input.heatmap,
    achievements: unlockedAchievements(input.achievements),
    modelCosts: input.modelCosts,
  };
}
