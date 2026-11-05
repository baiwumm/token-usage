// Public page data contract (docs/badge.md §4.7 / §6, §9).
// Pure projections only — no Supabase fixture needed. Covers the all-time
// day-bucket maths and the always-on page payload shape.

import type { AchievementProgress } from "../../src/lib/achievements/types";
import type { BadgeData } from "../../src/lib/badge/types";
import type { HeatmapPayload } from "../../src/lib/dashboard/api";

import { describe, expect, it } from "vitest";

import {
  MAX_PUBLIC_DAYS,
  capDayPoints,
  fillZeroDays,
  levelFor,
  longestStreakDays,
  normalizeDayTotals,
  peakDay,
  quantileStops,
  splitYears,
} from "../../src/lib/public-page/heatmap";
import {
  assemblePublicPageData,
  unlockedAchievements,
  type PublicPageInput,
} from "../../src/lib/public-page/project";

const account = {
  scope: "user",
  project: null,
  displayName: "Ming Wei",
  range: "all",
  totals: { tokens: 100, costUsd: 1, activeDays: 3 },
  sources: [],
  models: [],
  series: [],
} as unknown as BadgeData;

const heatmap = {
  from: "2025-01-01",
  to: "2025-12-31",
  week_starts_on: "mon",
  active_days: 3,
  streak_days: 0,
  weeks: [],
  total_cost_usd: 1,
} as HeatmapPayload;

function progress(
  id: string,
  tier: number,
): AchievementProgress {
  return {
    id,
    tier,
    value: 123456,
    thresholds: [1, 2, 3, 4, 5],
    next_threshold: 6,
    achieved_at: {},
  } as unknown as AchievementProgress;
}

function baseInput(overrides: Partial<PublicPageInput> = {}): PublicPageInput {
  return {
    account,
    heatmap,
    achievements: [],
    avatarDataUri: null,
    timezone: "Asia/Shanghai",
    dayTotals: new Map<string, number>([
      ["2024-12-31", 10],
      ["2025-01-01", 20],
      ["2025-01-03", 5],
    ]),
    sourceCount: 2,
    modelCount: 3,
    modelCosts: {},
    updatedAt: "2025-01-03T12:00:00.000Z",
    ...overrides,
  };
}

describe("public heatmap projections (docs/badge.md §6.4)", () => {
  it("normalizes, merges and sorts day totals", () => {
    const raw: Array<[string, number]> = [
      ["2025-01-03", 5],
      ["2025-01-01", 10],
      ["2025-01-01", 20],
      ["not-a-day", 99],
      ["2025-01-02", 0],
      ["2025-01-04", Number.NaN],
    ];

    expect(normalizeDayTotals(raw)).toEqual([
      { day: "2025-01-01", total: 30 },
      { day: "2025-01-03", total: 5 },
    ]);
  });

  it("zero-fills gaps without inventing days outside the range", () => {
    expect(
      fillZeroDays([
        { day: "2025-01-01", total: 10 },
        { day: "2025-01-03", total: 5 },
      ]),
    ).toEqual([
      { day: "2025-01-01", total: 10 },
      { day: "2025-01-02", total: 0 },
      { day: "2025-01-03", total: 5 },
    ]);
    expect(fillZeroDays([])).toEqual([]);
  });

  it("caps at 10 years and keeps the earlier span for monthly summary", () => {
    const days = normalizeDayTotals(
      Array.from({ length: MAX_PUBLIC_DAYS + 4 }, (_, index) => {
        const day = new Date(Date.UTC(2015, 0, 1) + index * 86_400_000)
          .toISOString()
          .slice(0, 10);

        return [day, 1] as const;
      }),
    );
    const { recent, earlier } = capDayPoints(days);

    expect(recent).toHaveLength(MAX_PUBLIC_DAYS);
    expect(earlier).toHaveLength(4);
    expect(recent[0].day).toBe(days[4].day);
  });

  it("splits years newest-first with 12 zero-filled month slots", () => {
    const sections = splitYears(
      fillZeroDays([
        { day: "2024-12-31", total: 10 },
        { day: "2025-01-01", total: 20 },
        { day: "2025-01-03", total: 5 },
      ]),
    );

    expect(sections.map((section) => section.year)).toEqual([2025, 2024]);
    expect(sections[0].months).toHaveLength(12);
    expect(sections[0].months[0]).toEqual({ month: "2025-01", total: 25 });
    expect(sections[1].months[11]).toEqual({ month: "2024-12", total: 10 });
  });

  it("grades by full-history quantiles, not per-year maxima", () => {
    const days = normalizeDayTotals(
      Array.from({ length: 20 }, (_, index) => [
        `2025-01-${String(index + 1).padStart(2, "0")}`,
        (index + 1) * 10,
      ] as const),
    );
    const stops = quantileStops(days);

    expect(stops).toEqual([100, 150, 180, 190]);
    expect(levelFor(0, stops)).toBe(0);
    expect(levelFor(10, stops)).toBe(1);
    expect(levelFor(140, stops)).toBe(2);
    expect(levelFor(175, stops)).toBe(3);
    expect(levelFor(200, stops)).toBe(4);
    expect(quantileStops([])).toEqual([0, 0, 0, 0]);
  });

  it("derives the two full-history facts", () => {
    const days = fillZeroDays([
      { day: "2025-01-01", total: 10 },
      { day: "2025-01-02", total: 30 },
      { day: "2025-01-04", total: 5 },
    ]);

    expect(longestStreakDays(days)).toBe(2);
    expect(peakDay(days)).toEqual({ day: "2025-01-02", tokens: 30 });
    expect(peakDay([])).toBeNull();
  });
});

describe("assemblePublicPageData (docs/badge.md §4.7)", () => {
  it("always carries the heatmap, avatar, timezone and unlocked achievements", () => {
    const data = assemblePublicPageData(
      baseInput({
        avatarDataUri: "data:image/png;base64,AAAA",
        modelCosts: { "gpt-5": 12.5 },
        achievements: [
          progress("locked", 0),
          progress("gold", 3),
          progress("silver", 2),
        ],
      }),
    );

    expect(data.heatmap).toBe(heatmap);
    expect(data.avatarDataUri).toBe("data:image/png;base64,AAAA");
    expect(data.timezone).toBe("Asia/Shanghai");
    expect(data.achievements).toHaveLength(2);
    expect(data.achievements.map((item) => item.id)).toEqual([
      "gold",
      "silver",
    ]);
    // The shared achievement dialog needs the full progress payload.
    expect(data.achievements[0].value).toBe(123456);
    expect(data.modelCosts).toEqual({ "gpt-5": 12.5 });
    expect(data.meta).toMatchObject({
      firstDay: "2024-12-31",
      lastDay: "2025-01-03",
      sourceCount: 2,
      modelCount: 3,
      longestStreakDays: 2,
      peakDay: { day: "2025-01-01", tokens: 20 },
    });
  });

  it("keeps an empty account in a defined empty state", () => {
    const data = assemblePublicPageData(
      baseInput({ dayTotals: new Map() }),
    );

    expect(data.achievements).toEqual([]);
    expect(data.meta.firstDay).toBeNull();
    expect(data.meta.lastDay).toBeNull();
    expect(data.meta.peakDay).toBeNull();
    expect(data.meta.longestStreakDays).toBe(0);
  });
});

describe("unlockedAchievements (docs/badge.md §6.5)", () => {
  it("keeps catalog order and drops locked entries", () => {
    expect(
      unlockedAchievements([
        progress("a", 1),
        progress("b", 0),
        progress("c", 4),
      ]).map((item) => item.id),
    ).toEqual(["a", "c"]);
  });
});
