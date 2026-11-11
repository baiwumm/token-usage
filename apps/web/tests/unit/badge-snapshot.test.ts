// Unit coverage for the §2.4.2 projection: the contract test only seeds one
// source/model, so the trimming, rounding and week-major flattening rules are
// pinned here.

import { describe, expect, it } from "vitest";

import { buildPublicSnapshot } from "@/lib/public-page/snapshot";
import type { PublicPageData } from "@/lib/public-page/types";

function cell(day: string, tokens: number, level: number) {
  return {
    day,
    total_tokens: tokens,
    billable_total_tokens: tokens,
    level,
    models: null,
    sources: null,
  };
}

function fixture(): PublicPageData {
  return {
    account: {
      scope: "user",
      project: null,
      displayName: "Ming Wei",
      range: "all",
      totals: { tokens: 2000, costUsd: 12.3456, activeDays: 2 },
      sources: [6, 5, 4, 3, 2, 1].map((tokens, index) => ({
        key: `s${index}`,
        label: `Source ${index}`,
        tokens,
        share: tokens / 2000 + 0.00001,
      })),
      models: [6, 5, 4, 3, 2, 1].map((tokens, index) => ({
        key: `m${index}`,
        label: `Model ${index}`,
        tokens,
      })),
      series: [1, 2, 3],
    },
    meta: {
      firstDay: "2026-01-01",
      lastDay: "2026-01-03",
      updatedAt: "2026-01-03T04:00:00.000Z",
      sourceCount: 6,
      modelCount: 6,
      longestStreakDays: 2,
      peakDay: { day: "2026-01-02", tokens: 900 },
    },
    avatarDataUri: "data:image/png;base64,aaaa",
    timezone: "Asia/Shanghai",
    heatmap: {
      from: "2026-01-01",
      to: "2026-01-03",
      week_starts_on: "mon",
      active_days: 2,
      streak_days: 0,
      weeks: [
        [cell("2026-01-01", 10, 1), cell("2026-01-02", 900, 4)],
        [cell("2026-01-03", 0, 0)],
      ],
      total_cost_usd: 12.3456,
    },
    achievements: [],
    modelCosts: {},
  };
}

describe("buildPublicSnapshot", () => {
  it("flattens the week grid week-major and keeps the dashboard levels", () => {
    const snapshot = buildPublicSnapshot(fixture());

    expect(snapshot.heatmap.cells).toEqual([
      ["2026-01-01", 10, 1],
      ["2026-01-02", 900, 4],
      ["2026-01-03", 0, 0],
    ]);
    expect(snapshot.heatmap).toMatchObject({
      from: "2026-01-01",
      to: "2026-01-03",
      activeDays: 2,
    });
    expect(snapshot.fetchedAt).toBe("2026-01-03");
  });

  it("trims both rankings to five rows and rounds money/shares", () => {
    const snapshot = buildPublicSnapshot(fixture());

    expect(snapshot.sources).toHaveLength(5);
    expect(snapshot.models).toHaveLength(5);
    expect(snapshot.sources[0]).toEqual({
      label: "Source 0",
      tokens: 6,
      share: 0.003,
    });
    expect(snapshot.totals.costUsd).toBe(12.35);
  });

  it("copies the series and never carries the avatar or owner name", () => {
    const data = fixture();
    const snapshot = buildPublicSnapshot(data);
    const json = JSON.stringify(snapshot);

    expect(snapshot.series).toEqual([1, 2, 3]);
    expect(snapshot.series).not.toBe(data.account.series);
    expect(json).not.toContain("data:image/");
    expect(json).not.toContain("Ming Wei");
    expect(json).not.toContain("Asia/Shanghai");
  });
});
