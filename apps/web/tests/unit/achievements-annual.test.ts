// Guards for /wrapped's annual achievement scoping: the card shows each
// achievement's tier at the end of the selected year, so earlier years lose
// rows/tiers and the current year matches the all-time payload.

import { describe, expect, it } from "vitest";

import type { AchievementProgress } from "@/lib/achievements/types";

import {
  achievementsAsOfYear,
  tierAsOfYear,
} from "@/lib/achievements/annual";

function row(
  id: string,
  achieved: Partial<AchievementProgress["achieved_at"]> = {},
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
      ...achieved,
    },
  };
}

describe("tierAsOfYear", () => {
  const progress = row("wordsmith", {
    bronze: "2023-05-01",
    silver: "2024-02-29",
    gold: "2025-12-31",
  });

  it("returns 0 before the first tier", () => {
    expect(tierAsOfYear(progress, 2022)).toBe(0);
  });

  it("takes the highest tier reached by Dec 31, inclusive", () => {
    expect(tierAsOfYear(progress, 2023)).toBe(1);
    expect(tierAsOfYear(progress, 2024)).toBe(2);
    expect(tierAsOfYear(progress, 2025)).toBe(3);
  });

  it("does not leak tiers reached after the year", () => {
    expect(tierAsOfYear(progress, 2026)).toBe(3);
  });

  it("ignores a Jan 1 date one year later than the cutoff", () => {
    const strict = row("marathon_session", { bronze: "2026-01-01" });

    expect(tierAsOfYear(strict, 2025)).toBe(0);
    expect(tierAsOfYear(strict, 2026)).toBe(1);
  });
});

describe("achievementsAsOfYear", () => {
  const rows = [
    row("early-king", {
      bronze: "2022-01-01",
      silver: "2022-06-01",
      gold: "2023-01-01",
      diamond: "2023-03-01",
      king: "2023-06-01",
    }),
    row("late-gold", { bronze: "2023-01-01", gold: "2026-03-01" }),
    row("locked"),
    row("tied-silver-a", { silver: "2023-04-01" }),
    row("tied-silver-b", { silver: "2023-04-02" }),
  ];

  it("drops locked rows and sorts by tier, keeping catalog order on ties", () => {
    const scoped = achievementsAsOfYear(rows, 2023);

    expect(scoped.map((entry) => [entry.progress.id, entry.tier])).toEqual([
      ["early-king", 5],
      ["tied-silver-a", 2],
      ["tied-silver-b", 2],
      ["late-gold", 1],
    ]);
  });

  it("shows fewer rows and lower tiers for an earlier year", () => {
    expect(
      achievementsAsOfYear(rows, 2022).map((entry) => entry.progress.id),
    ).toEqual(["early-king"]);
    expect(achievementsAsOfYear(rows, 2021)).toEqual([]);
  });

  it("keeps later-tier dates hidden until their year", () => {
    expect(
      achievementsAsOfYear(rows, 2025).find(
        (entry) => entry.progress.id === "late-gold",
      )?.tier,
    ).toBe(1);
    expect(
      achievementsAsOfYear(rows, 2026).find(
        (entry) => entry.progress.id === "late-gold",
      )?.tier,
    ).toBe(3);
  });
});
