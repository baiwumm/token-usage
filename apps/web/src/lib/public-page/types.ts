// Public page data contract (docs/badge.md §4.7 / §6). Kept separate from
// BadgeData on purpose: the latter is the SVG renderer's input and is pinned
// by byte-level snapshots, so page-only fields must never land there.
//
// 2026-11-05 second pass (operator call): the heatmap and achievement wall
// are always on, with no per-user switches; the public page now carries the
// same HeatmapPayload / AchievementProgress shapes the dashboard uses.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { BadgeData } from "@/lib/badge/types";
import type { HeatmapPayload } from "@/lib/dashboard/api";

export type PublicDayPoint = {
  day: string; // YYYY-MM-DD in the owner's timezone
  total: number; // total_tokens for that local day
};

export type PublicMonthPoint = {
  month: string; // YYYY-MM
  total: number;
};

export type PublicYearSection = {
  year: number;
  days: PublicDayPoint[];
  months: PublicMonthPoint[];
};

export type PublicPageMeta = {
  firstDay: string | null;
  lastDay: string | null;
  updatedAt: string | null;
  sourceCount: number;
  modelCount: number;
  longestStreakDays: number;
  peakDay: { day: string; tokens: number } | null;
};

export type PublicPageData = {
  account: BadgeData;
  meta: PublicPageMeta;
  /** Inline data: URI of the owner's avatar, or null for an initials circle. */
  avatarDataUri: string | null;
  /** Owner IANA timezone, used by the heatmap's footnote. */
  timezone: string;
  /** Last 52 weeks, same payload shape as the dashboard heatmap. */
  heatmap: HeatmapPayload;
  /** Every unlocked achievement, full progress so the shared dialog works. */
  achievements: AchievementProgress[];
  /** Read-time estimated cost per model group key (USD), for the model list. */
  modelCosts: Record<string, number>;
};
