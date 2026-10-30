// Guard tests for the achievement catalog (docs/achievements-plan.md §6):
// ids are unique, thresholds are five strictly increasing steps, every tier
// metric is on the monotone whitelist, and every card/icon/copy key resolves.
// These tests intentionally read the catalog instead of a copy of the tiers.

import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_CATEGORIES,
  ACHIEVEMENT_COPY_KEYS,
  ACHIEVEMENT_ICONS,
  CACHE_ALCHEMY_MIN_DAY_TOKENS,
  METRIC_KINDS,
  TIERS,
  achievementById,
  achievementsByCategory,
  nextThreshold,
  thresholdForTier,
  tierForValue,
  tierKeyForTier,
} from "@/lib/achievements/catalog";

const THRESHOLD_COUNT = 5;

describe("catalog shape", () => {
  it("ships the planned 18 achievements with unique ids", () => {
    expect(ACHIEVEMENTS).toHaveLength(18);
    expect(new Set(ACHIEVEMENTS.map((entry) => entry.id)).size).toBe(
      ACHIEVEMENTS.length,
    );
    expect(achievementById("token_titan")).toBeDefined();
    expect(achievementById("not-an-achievement")).toBeUndefined();
  });

  it("covers every category with at least one achievement", () => {
    for (const category of ACHIEVEMENT_CATEGORIES) {
      expect(achievementsByCategory(category).length).toBeGreaterThan(0);
      expect(
        achievementsByCategory(category).every(
          (entry) => entry.category === category,
        ),
      ).toBe(true);
    }
  });

  it("defines five tiers in order with distinct copy keys", () => {
    expect(TIERS.map((tier) => tier.tier)).toEqual([1, 2, 3, 4, 5]);
    expect(TIERS.map((tier) => tier.key)).toEqual([
      "bronze",
      "silver",
      "gold",
      "diamond",
      "king",
    ]);
    expect(new Set(TIERS.map((tier) => tier.copyKey)).size).toBe(TIERS.length);
  });
});

describe("thresholds", () => {
  it("holds five strictly increasing steps per achievement", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.thresholds).toHaveLength(THRESHOLD_COUNT);
      for (let index = 1; index < achievement.thresholds.length; index += 1) {
        expect(achievement.thresholds[index]).toBeGreaterThan(
          achievement.thresholds[index - 1],
        );
      }
      if (achievement.unit === "ratio") {
        expect(achievement.thresholds.at(-1)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("keeps ratio thresholds inside 0–1 and the cache gate positive", () => {
    for (const achievement of ACHIEVEMENTS.filter(
      (entry) => entry.unit === "ratio",
    )) {
      for (const threshold of achievement.thresholds) {
        expect(threshold).toBeGreaterThan(0);
        expect(threshold).toBeLessThanOrEqual(1);
      }
    }
    expect(CACHE_ALCHEMY_MIN_DAY_TOKENS).toBeGreaterThan(0);
  });
});

describe("monotone metric whitelist", () => {
  it("only uses whitelisted kinds", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(METRIC_KINDS).toContain(achievement.kind);
    }
  });

  it("never derives a tier from an average, ratio or cost", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(METRIC_KINDS).toContain(achievement.kind);
      expect(achievement.metric).not.toMatch(
        /(^|_)(average|mean|median|cost|percent)(_|$)/,
      );
      expect(achievement.kind).not.toMatch(/(average|mean|median|cost|percent)/);
    }

    // A ratio may only feed a tier through the single-day + volume-gate
    // pattern, which is still a historical max.
    for (const achievement of ACHIEVEMENTS.filter(
      (entry) => entry.unit === "ratio",
    )) {
      expect(achievement.kind).toBe("historical_max");
      expect(achievement.metric).toBe("best_day_cache_hit_rate");
    }
  });
});

describe("copy and icons", () => {
  it("gives every achievement zh/en-capable copy keys present in the key set", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.copyKey).toMatch(/^achievements\.[a-z_]+\.[a-z]+$/);
      expect(achievement.descriptionKey).toMatch(
        /^achievements\.[a-z_]+\.[a-z]+$/,
      );
      expect(achievement.copyKey).not.toBe(achievement.descriptionKey);
      expect(ACHIEVEMENT_COPY_KEYS).toContain(achievement.copyKey);
      expect(ACHIEVEMENT_COPY_KEYS).toContain(achievement.descriptionKey);
    }
    expect(ACHIEVEMENT_COPY_KEYS).toContain("achievements.tier.king");
  });

  it("keeps the coverage note on the sessions- and sync-sourced achievements", () => {
    const covered = ACHIEVEMENTS.filter((entry) => Boolean(entry.coverageKey));

    expect(covered.map((entry) => entry.id).sort()).toEqual([
      "marathon_session",
      "project_devotion",
      "project_hopper",
      "sync_diligence",
    ]);
    for (const achievement of covered) {
      const key = achievement.coverageKey;

      expect(key).toBeDefined();
      expect(ACHIEVEMENT_COPY_KEYS).toContain(key as string);
    }
  });

  it("resolves every icon key from the shared vocabulary", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(ACHIEVEMENT_ICONS).toContain(achievement.icon);
    }
  });
});

describe("artwork", () => {
  it("points every achievement at its own bitmap under /achievements", () => {
    for (const achievement of ACHIEVEMENTS) {
      expect(achievement.art).toBe(`/achievements/${achievement.id}.png`);
    }
  });

  it("ships one PNG per achievement id", () => {
    const artworkDir = join(
      import.meta.dirname,
      "..",
      "..",
      "public",
      "achievements",
    );

    for (const achievement of ACHIEVEMENTS) {
      const file = join(artworkDir, `${achievement.id}.png`);

      expect(existsSync(file), file).toBe(true);
    }
  });
});

describe("tier helpers", () => {
  const thresholds = [10, 20, 30, 40, 50] as const;

  it("maps values to the highest reached tier", () => {
    expect(tierForValue(thresholds, 0)).toBe(0);
    expect(tierForValue(thresholds, 9)).toBe(0);
    expect(tierForValue(thresholds, 10)).toBe(1);
    expect(tierForValue(thresholds, 39)).toBe(3);
    expect(tierForValue(thresholds, 50)).toBe(5);
    expect(tierForValue(thresholds, 5000)).toBe(5);
  });

  it("returns the next threshold and the tier threshold", () => {
    expect(nextThreshold(thresholds, 0)).toBe(10);
    expect(nextThreshold(thresholds, 10)).toBe(20);
    expect(nextThreshold(thresholds, 50)).toBeNull();
    expect(thresholdForTier(thresholds, 1)).toBe(10);
    expect(thresholdForTier(thresholds, 5)).toBe(50);
    expect(thresholdForTier(thresholds, 0)).toBeNull();
    expect(thresholdForTier(thresholds, 6)).toBeNull();
  });

  it("maps tier numbers to wire keys", () => {
    expect(tierKeyForTier(1)).toBe("bronze");
    expect(tierKeyForTier(5)).toBe("king");
    expect(tierKeyForTier(0)).toBeNull();
  });
});
