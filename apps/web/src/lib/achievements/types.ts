// Wire types for GET /api/app/achievements (docs/achievements-plan.md §3.3).
//
// Type-only module: the browser-side client imports this without dragging the
// server compute graph (canonicalization, pricing, Supabase REST) into the
// client bundle.

import type {
  AchievementCategory,
  AchievementUnit,
  Thresholds,
  TierKey,
} from "./catalog";

export type AchievementProgress = {
  id: string;
  category: AchievementCategory;
  unit: AchievementUnit;
  /** 0 = locked, 1 bronze … 5 king. */
  tier: number;
  value: number;
  thresholds: Thresholds;
  next_threshold: number | null;
  /** Local-day dates keyed by tier; null when that tier is not reached. */
  achieved_at: Record<TierKey, string | null>;
};

export type AchievementsPayload = {
  generated_at: string;
  achievements: AchievementProgress[];
};
