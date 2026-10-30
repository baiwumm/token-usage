// Guards for the pure achievement projections used by the dashboard strip and
// the unlock watcher: newest-first ordering, the seen watermark comparison and
// the day-key validation that protects the POST body.

import { describe, expect, it } from "vitest";

import type { AchievementProgress } from "@/lib/achievements/types";

import {
  countUnlocked,
  isDayKey,
  latestAchievedDay,
  maxAchievedDay,
  nearestUnlocks,
  recentUnlocks,
  unlocksSince,
} from "@/lib/achievements/highlights";

function row(
  id: string,
  over: Partial<AchievementProgress> = {},
): AchievementProgress {
  return {
    id,
    category: "milestone",
    unit: "tokens",
    tier: 0,
    value: 0,
    thresholds: [10, 100, 1_000, 10_000, 100_000],
    next_threshold: 10,
    achieved_at: {
      bronze: null,
      silver: null,
      gold: null,
      diamond: null,
      king: null,
    },
    ...over,
  };
}

function unlocked(id: string, day: string, tier = 1): AchievementProgress {
  const achieved = {
    bronze: day,
    silver: null,
    gold: null,
    diamond: null,
    king: null,
  };

  return row(id, { tier, value: 50, next_threshold: 100, achieved_at: achieved });
}

describe("latestAchievedDay / maxAchievedDay", () => {
  it("takes the latest of the five tier days", () => {
    const achieved = {
      bronze: "2026-01-01",
      silver: "2026-03-01",
      gold: "2026-02-01",
      diamond: null,
      king: null,
    };

    expect(latestAchievedDay(achieved)).toBe("2026-03-01");
  });

  it("returns null when nothing is unlocked", () => {
    expect(latestAchievedDay({ bronze: null, silver: null })).toBeNull();
    expect(maxAchievedDay([])).toBeNull();
    expect(maxAchievedDay([row("a")])).toBeNull();
  });

  it("maxes across rows", () => {
    expect(
      maxAchievedDay([
        unlocked("a", "2026-02-01"),
        unlocked("b", "2026-04-01"),
        unlocked("c", "2026-03-01"),
      ]),
    ).toBe("2026-04-01");
  });
});

describe("unlocksSince", () => {
  it("treats a null watermark as the first visit (nothing new)", () => {
    expect(unlocksSince([unlocked("a", "2026-04-01")], null)).toEqual([]);
  });

  it("returns only later unlocks, newest first, ignoring locked rows", () => {
    const rows = [
      unlocked("old", "2026-01-01"),
      unlocked("new", "2026-04-01"),
      unlocked("mid", "2026-03-01"),
      row("locked"),
    ];

    expect(unlocksSince(rows, "2026-02-01").map((entry) => entry.id)).toEqual([
      "new",
      "mid",
    ]);
    expect(unlocksSince(rows, "2026-04-01")).toEqual([]);
    expect(unlocksSince(rows, "2026-04-02")).toEqual([]);
  });
});

describe("recentUnlocks", () => {
  it("orders by latest unlock and honours the limit", () => {
    const rows = [
      unlocked("a", "2026-01-01"),
      unlocked("b", "2026-05-01"),
      unlocked("c", "2026-03-01"),
      row("locked"),
    ];

    expect(recentUnlocks(rows, 2).map((entry) => entry.id)).toEqual(["b", "c"]);
  });

  it("keeps catalog order on equal days", () => {
    const rows = [unlocked("a", "2026-05-01"), unlocked("b", "2026-05-01")];

    expect(recentUnlocks(rows, 2).map((entry) => entry.id)).toEqual(["a", "b"]);
  });
});

describe("nearestUnlocks", () => {
  it("skips king rows and rows without progress", () => {
    const rows = [
      row("zero", { value: 0, next_threshold: 10 }),
      unlocked("king", "2026-01-01", 5),
      row("bronze", { tier: 1, value: 50, next_threshold: 100 }),
    ];

    expect(nearestUnlocks(rows, 3).map((entry) => entry.id)).toEqual(["bronze"]);
  });

  it("orders by share of the next threshold", () => {
    const rows = [
      row("quarter", { tier: 1, value: 25, next_threshold: 100 }),
      row("half", { tier: 1, value: 50, next_threshold: 100 }),
      row("three-quarters", { tier: 1, value: 750, next_threshold: 1_000 }),
    ];

    expect(nearestUnlocks(rows, 2).map((entry) => entry.id)).toEqual([
      "three-quarters",
      "half",
    ]);
  });

  it("breaks ratio ties by id", () => {
    const rows = [
      row("z", { tier: 1, value: 50, next_threshold: 100 }),
      row("a", { tier: 1, value: 5, next_threshold: 10 }),
    ];

    expect(nearestUnlocks(rows, 2).map((entry) => entry.id)).toEqual(["a", "z"]);
  });
});

describe("countUnlocked", () => {
  it("counts rows with at least one tier day", () => {
    expect(
      countUnlocked([unlocked("a", "2026-01-01"), row("b"), unlocked("c", "2026-02-01")]),
    ).toBe(2);
  });
});

describe("isDayKey", () => {
  it("accepts real calendar days", () => {
    expect(isDayKey("2026-10-30")).toBe(true);
    expect(isDayKey("2028-02-29")).toBe(true);
    expect(isDayKey("2000-01-01")).toBe(true);
  });

  it("rejects malformed, impossible and non-string values", () => {
    for (const value of [
      "2026-2-3",
      "2026-02-30",
      "2026-13-01",
      "2026-00-10",
      "1234-1-1",
      "2026-10-30T00:00:00Z",
      20261030,
      null,
      undefined,
    ]) {
      expect(isDayKey(value)).toBe(false);
    }
  });
});
