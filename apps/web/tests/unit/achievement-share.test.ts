import type { AchievementProgress } from "@/lib/achievements/types";

import { describe, expect, it } from "vitest";

import {
  achievementShareFilename,
  buildAchievementShareData,
} from "@/lib/achievements/share";

const formatValue = (unit: string, value: number) => `${unit}:${value}`;

function progress(over: Partial<AchievementProgress> = {}): AchievementProgress {
  return {
    id: "token_titan",
    category: "milestone",
    unit: "tokens",
    tier: 3,
    value: 12_000_000_000,
    thresholds: [
      100_000_000, 1_000_000_000, 10_000_000_000, 100_000_000_000,
      1_000_000_000_000,
    ],
    next_threshold: 100_000_000_000,
    achieved_at: {
      bronze: "2026-01-02",
      silver: "2026-03-04",
      gold: "2026-05-06",
      diamond: null,
      king: null,
    },
    ...over,
  };
}

describe("buildAchievementShareData", () => {
  it("projects the unlocked tier, value and landing day", () => {
    const data = buildAchievementShareData(progress(), {
      locale: "zh",
      handle: "小北",
      formatValue,
    });

    expect(data).toMatchObject({
      id: "token_titan",
      name: "Token 巨擘",
      description: "累计用量一次次跨过新的数量级。",
      tier: 3,
      tierKey: "gold",
      tierName: "黄金",
      valueLabel: "tokens:12000000000",
      achievedDay: "2026-05-06",
      art: "/achievements/token_titan.png",
      handle: "小北",
      locale: "zh",
    });
  });

  it("localizes the tier name for en", () => {
    const data = buildAchievementShareData(progress(), {
      locale: "en",
      handle: "Nora",
      formatValue,
    });

    expect(data?.name).toBe("Token Titan");
    expect(data?.tierName).toBe("Gold");
  });

  it("falls back to the copy module for a blank handle", () => {
    const data = buildAchievementShareData(progress(), {
      locale: "en",
      handle: "   ",
      formatValue: () => "x",
    });

    expect(data?.handle).toBe("A developer");
  });

  it("refuses locked rows and unknown ids", () => {
    expect(
      buildAchievementShareData(progress({ tier: 0 }), {
        locale: "zh",
        handle: "小北",
        formatValue,
      }),
    ).toBeNull();
    expect(
      buildAchievementShareData(progress({ id: "not_a_badge" }), {
        locale: "zh",
        handle: "小北",
        formatValue,
      }),
    ).toBeNull();
  });

  it("keeps a null landing day when the tier date is missing", () => {
    const data = buildAchievementShareData(
      progress({
        achieved_at: {
          bronze: "2026-01-02",
          silver: "2026-03-04",
          gold: null,
          diamond: null,
          king: null,
        },
      }),
      { locale: "zh", handle: "小北", formatValue },
    );

    expect(data?.achievedDay).toBeNull();
  });
});

describe("achievementShareFilename", () => {
  it("names the file after the badge and its tier", () => {
    expect(achievementShareFilename("token_titan", "gold")).toBe(
      "token-usage-token_titan-gold.png",
    );
  });
});
