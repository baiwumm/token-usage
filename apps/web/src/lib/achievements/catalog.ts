// Achievement catalog — the single source of truth for thresholds (M7).
//
// Rules from docs/achievements-plan.md §2:
//   - Tiers: 0 = locked, 1 bronze, 2 silver, 3 gold, 4 diamond, 5 king.
//   - Tier metrics must be monotone: cumulative sums, historical maxima,
//     longest streaks, distinct counts and days-since-first only. Averages,
//     ratios and costs are banned because they can shrink when data arrives;
//     ratio achievements are modelled as "best single day above a volume
//     gate", which is a historical max.
//   - Day boundaries, weekends and nights follow the caller's local timezone.
//   - Thresholds live here and nowhere else; the UI reads them from the
//     payload instead of redefining them.
//
// This module must stay dependency-free and erasable-syntax-only: the
// read-only calibration script (scripts/admin/achievements-calibrate.mjs)
// loads it directly through Node's type stripping to avoid a second copy of
// the tier tables.

export const TIERS = [
  { tier: 1, key: "bronze", copyKey: "achievements.tier.bronze" },
  { tier: 2, key: "silver", copyKey: "achievements.tier.silver" },
  { tier: 3, key: "gold", copyKey: "achievements.tier.gold" },
  { tier: 4, key: "diamond", copyKey: "achievements.tier.diamond" },
  { tier: 5, key: "king", copyKey: "achievements.tier.king" },
] as const;

export type TierConfig = (typeof TIERS)[number];
export type TierKey = TierConfig["key"];
export type Tier = TierConfig["tier"];
/** 0 = locked, 1–5 = bronze…king. */
export type AchievementTier = 0 | Tier;

/** Monotone metric kinds a tier may be derived from (guard list). */
export const METRIC_KINDS = [
  "cumulative_sum",
  "historical_max",
  "longest_streak",
  "distinct_count",
  "days_since_first",
] as const;

export type MetricKind = (typeof METRIC_KINDS)[number];

/** What each achievement's scanner measures (dispatch key for compute.ts). */
export type MetricId =
  | "total_tokens"
  | "output_tokens"
  | "cached_input_tokens"
  | "first_day_age_days"
  | "best_day_tokens"
  | "best_day_cache_hit_rate"
  | "longest_session_duration"
  | "best_day_model_count"
  | "longest_streak"
  | "active_days"
  | "weekend_days"
  | "night_owl_days"
  | "distinct_models"
  | "distinct_sources"
  | "distinct_projects"
  | "top_project_tokens"
  | "distinct_devices"
  | "sync_streak";

export const ACHIEVEMENT_CATEGORIES = [
  "milestone",
  "peak",
  "rhythm",
  "exploration",
] as const;

export type AchievementCategory = (typeof ACHIEVEMENT_CATEGORIES)[number];

/** Wire units; `ratio` values and thresholds are 0–1 decimals. */
export type AchievementUnit =
  "tokens" | "days" | "count" | "duration_ms" | "ratio";

/**
 * Icon keys. P2 maps these onto `@gravity-ui/icons` in the card/medallion
 * components; the catalog only fixes the vocabulary so the guard test can
 * reject typos before any UI exists.
 */
export const ACHIEVEMENT_ICONS = [
  "tokens",
  "feather",
  "archive",
  "calendar",
  "sparkle",
  "flask",
  "timer",
  "layers",
  "flame",
  "route",
  "weekend",
  "moon",
  "globe",
  "tools",
  "compass",
  "heart",
  "devices",
  "refresh",
] as const;

export type AchievementIcon = (typeof ACHIEVEMENT_ICONS)[number];

export type Thresholds = readonly [number, number, number, number, number];

export type Achievement = {
  id: string;
  category: AchievementCategory;
  /** Scanner to run in compute.ts. */
  metric: MetricId;
  /** Monotone family of `metric`; guarded by tests. */
  kind: MetricKind;
  unit: AchievementUnit;
  icon: AchievementIcon;
  /** Copy key resolved by both zh and en catalogs (lib/copy/achievements.ts). */
  copyKey: string;
  descriptionKey: string;
  /**
   * Coverage note key for achievements whose history starts later than the
   * rest (Sessions collection start, sync-run reporting). Rendered in the
   * card detail; absent for achievements that cover all history.
   */
  coverageKey?: string;
  thresholds: Thresholds;
};

/**
 * `cache_alchemy` only counts a day once it holds this many tokens, so a tiny
 * day with one cached call cannot award a ratio tier.
 */
export const CACHE_ALCHEMY_MIN_DAY_TOKENS = 1_000_000;

/** Coverage keys shared by the sessions-sourced and sync-sourced achievements. */
export const ACHIEVEMENT_COVERAGE = {
  sessions: "achievements.coverage.sessions",
  sync: "achievements.coverage.sync",
} as const;

// Typed rather than `as const`: entries without a coverage note must still be
// readable through the shared shape (and P2 adds the copy module on top).
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: "token_titan",
    category: "milestone",
    metric: "total_tokens",
    kind: "cumulative_sum",
    unit: "tokens",
    icon: "tokens",
    copyKey: "achievements.token_titan.name",
    descriptionKey: "achievements.token_titan.description",
    thresholds: [
      100_000_000, 1_000_000_000, 10_000_000_000, 100_000_000_000,
      1_000_000_000_000,
    ],
  },
  {
    id: "wordsmith",
    category: "milestone",
    metric: "output_tokens",
    kind: "cumulative_sum",
    unit: "tokens",
    icon: "feather",
    copyKey: "achievements.wordsmith.name",
    descriptionKey: "achievements.wordsmith.description",
    thresholds: [
      5_000_000, 25_000_000, 100_000_000, 300_000_000, 1_000_000_000,
    ],
  },
  {
    id: "cachekeeper",
    category: "milestone",
    metric: "cached_input_tokens",
    kind: "cumulative_sum",
    unit: "tokens",
    icon: "archive",
    copyKey: "achievements.cachekeeper.name",
    descriptionKey: "achievements.cachekeeper.description",
    thresholds: [
      10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000, 100_000_000_000,
    ],
  },
  {
    id: "veteran",
    category: "milestone",
    metric: "first_day_age_days",
    kind: "days_since_first",
    unit: "days",
    icon: "calendar",
    copyKey: "achievements.veteran.name",
    descriptionKey: "achievements.veteran.description",
    thresholds: [30, 90, 180, 365, 730],
  },
  {
    id: "big_day",
    category: "peak",
    metric: "best_day_tokens",
    kind: "historical_max",
    unit: "tokens",
    icon: "sparkle",
    copyKey: "achievements.big_day.name",
    descriptionKey: "achievements.big_day.description",
    thresholds: [
      10_000_000, 100_000_000, 500_000_000, 3_000_000_000, 10_000_000_000,
    ],
  },
  {
    id: "cache_alchemy",
    category: "peak",
    metric: "best_day_cache_hit_rate",
    kind: "historical_max",
    unit: "ratio",
    icon: "flask",
    copyKey: "achievements.cache_alchemy.name",
    descriptionKey: "achievements.cache_alchemy.description",
    thresholds: [0.5, 0.7, 0.85, 0.95, 0.98],
  },
  {
    id: "marathon_session",
    category: "peak",
    metric: "longest_session_duration",
    kind: "historical_max",
    unit: "duration_ms",
    icon: "timer",
    copyKey: "achievements.marathon_session.name",
    descriptionKey: "achievements.marathon_session.description",
    coverageKey: ACHIEVEMENT_COVERAGE.sessions,
    // 1h / 3h / 6h / 12h / 18h, stored in milliseconds.
    thresholds: [3_600_000, 10_800_000, 21_600_000, 43_200_000, 64_800_000],
  },
  {
    id: "model_symphony",
    category: "peak",
    metric: "best_day_model_count",
    kind: "historical_max",
    unit: "count",
    icon: "layers",
    copyKey: "achievements.model_symphony.name",
    descriptionKey: "achievements.model_symphony.description",
    thresholds: [2, 3, 5, 8, 12],
  },
  {
    id: "streak",
    category: "rhythm",
    metric: "longest_streak",
    kind: "longest_streak",
    unit: "days",
    icon: "flame",
    copyKey: "achievements.streak.name",
    descriptionKey: "achievements.streak.description",
    thresholds: [3, 7, 30, 100, 365],
  },
  {
    id: "marathoner",
    category: "rhythm",
    metric: "active_days",
    kind: "cumulative_sum",
    unit: "days",
    icon: "route",
    copyKey: "achievements.marathoner.name",
    descriptionKey: "achievements.marathoner.description",
    thresholds: [7, 30, 100, 365, 730],
  },
  {
    id: "weekend_warrior",
    category: "rhythm",
    metric: "weekend_days",
    kind: "cumulative_sum",
    unit: "days",
    icon: "weekend",
    copyKey: "achievements.weekend_warrior.name",
    descriptionKey: "achievements.weekend_warrior.description",
    thresholds: [5, 20, 50, 100, 200],
  },
  {
    id: "night_owl",
    category: "rhythm",
    metric: "night_owl_days",
    kind: "distinct_count",
    unit: "days",
    icon: "moon",
    copyKey: "achievements.night_owl.name",
    descriptionKey: "achievements.night_owl.description",
    thresholds: [3, 10, 30, 60, 120],
  },
  {
    id: "polyglot",
    category: "exploration",
    metric: "distinct_models",
    kind: "distinct_count",
    unit: "count",
    icon: "globe",
    copyKey: "achievements.polyglot.name",
    descriptionKey: "achievements.polyglot.description",
    thresholds: [5, 15, 30, 60, 100],
  },
  {
    id: "multitool",
    category: "exploration",
    metric: "distinct_sources",
    kind: "distinct_count",
    unit: "count",
    icon: "tools",
    copyKey: "achievements.multitool.name",
    descriptionKey: "achievements.multitool.description",
    thresholds: [2, 4, 6, 9, 12],
  },
  {
    id: "project_hopper",
    category: "exploration",
    metric: "distinct_projects",
    kind: "distinct_count",
    unit: "count",
    icon: "compass",
    copyKey: "achievements.project_hopper.name",
    descriptionKey: "achievements.project_hopper.description",
    coverageKey: ACHIEVEMENT_COVERAGE.sessions,
    thresholds: [3, 5, 10, 20, 40],
  },
  {
    id: "project_devotion",
    category: "exploration",
    metric: "top_project_tokens",
    kind: "historical_max",
    unit: "tokens",
    icon: "heart",
    copyKey: "achievements.project_devotion.name",
    descriptionKey: "achievements.project_devotion.description",
    coverageKey: ACHIEVEMENT_COVERAGE.sessions,
    thresholds: [
      1_000_000, 10_000_000, 100_000_000, 1_000_000_000, 10_000_000_000,
    ],
  },
  {
    id: "fleet",
    category: "exploration",
    metric: "distinct_devices",
    kind: "distinct_count",
    unit: "count",
    icon: "devices",
    copyKey: "achievements.fleet.name",
    descriptionKey: "achievements.fleet.description",
    thresholds: [2, 3, 4, 5, 7],
  },
  {
    id: "sync_diligence",
    category: "exploration",
    metric: "sync_streak",
    kind: "longest_streak",
    unit: "days",
    icon: "refresh",
    copyKey: "achievements.sync_diligence.name",
    descriptionKey: "achievements.sync_diligence.description",
    coverageKey: ACHIEVEMENT_COVERAGE.sync,
    thresholds: [7, 30, 90, 180, 365],
  },
];

/** Every copy key the achievement surface must provide in zh and en. */
export const ACHIEVEMENT_COPY_KEYS: readonly string[] = Array.from(
  new Set([
    ...TIERS.map((tier) => tier.copyKey),
    ...ACHIEVEMENTS.flatMap((achievement) =>
      achievement.coverageKey
        ? [
            achievement.copyKey,
            achievement.descriptionKey,
            achievement.coverageKey,
          ]
        : [achievement.copyKey, achievement.descriptionKey],
    ),
  ]),
);

export function achievementById(id: string): Achievement | undefined {
  return ACHIEVEMENTS.find((achievement) => achievement.id === id);
}

export function achievementsByCategory(
  category: AchievementCategory,
): readonly Achievement[] {
  return ACHIEVEMENTS.filter(
    (achievement) => achievement.category === category,
  );
}

export function tierKeyForTier(tier: number): TierKey | null {
  const config = TIERS.find((entry) => entry.tier === tier);

  return config ? config.key : null;
}

export function thresholdForTier(
  thresholds: Thresholds,
  tier: number,
): number | null {
  if (tier < 1 || tier > thresholds.length) return null;

  return thresholds[tier - 1];
}

/** Highest tier whose threshold `value` reaches; 0 when below bronze. */
export function tierForValue(
  thresholds: Thresholds,
  value: number,
): AchievementTier {
  let tier: AchievementTier = 0;

  for (const config of TIERS) {
    if (value >= thresholds[config.tier - 1]) tier = config.tier;
    else break;
  }

  return tier;
}

/** Next threshold above `value`, or null once the king tier is reached. */
export function nextThreshold(
  thresholds: Thresholds,
  value: number,
): number | null {
  for (const threshold of thresholds) if (value < threshold) return threshold;

  return null;
}
