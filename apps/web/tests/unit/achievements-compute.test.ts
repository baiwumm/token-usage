// Unit tests for the pure achievement computation (docs/achievements-plan.md
// §2 catalog, §3.4 scans, §6 guards). Thresholds are read from the catalog —
// a second copy here would silently drift from the shipped tiers.

import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENTS,
  CACHE_ALCHEMY_MIN_DAY_TOKENS,
  TIERS,
  achievementById,
} from "@/lib/achievements/catalog";
import {
  computeAchievements,
  type AchievementsInput,
  type AchievementsSnapshot,
} from "@/lib/achievements/compute";

const SHANGHAI = { timeZone: "Asia/Shanghai", offsetMinutes: 480 };
const UTC = { timeZone: null, offsetMinutes: 0 };
const NOW = "2026-10-30T04:00:00.000Z"; // 2026-10-30 12:00 Asia/Shanghai

function row(over: Record<string, unknown> = {}) {
  return {
    hour_start: "2026-10-01T02:00:00.000Z",
    source: "codex",
    model: "test-model",
    device_id: "device-a",
    input_tokens: 100,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 50,
    reasoning_output_tokens: 0,
    total_tokens: 150,
    conversations: 1,
    total_cost_usd: 0,
    updated_at: "2026-10-01T03:00:00.000Z",
    ...over,
  };
}

function session(over: Record<string, unknown> = {}) {
  return {
    session_id: "session",
    device_id: "device-a",
    source: "codex",
    project_key: "alpha",
    started_at: "2026-10-01T02:00:00.000Z",
    ended_at: "2026-10-01T03:00:00.000Z",
    total_tokens: 1000,
    ...over,
  };
}

function compute(over: Partial<AchievementsInput> = {}) {
  return computeAchievements({
    hourly: [],
    sessionStates: [],
    sessions: [],
    syncRuns: [],
    devices: [],
    tzContext: SHANGHAI,
    now: NOW,
    ...over,
  });
}

function progress(payload: AchievementsSnapshot, id: string) {
  const found = payload.achievements.find((entry) => entry.id === id);

  if (!found) throw new Error(`missing achievement ${id}`);

  return found;
}

function thresholdsOf(id: string) {
  const achievement = achievementById(id);

  if (!achievement) throw new Error(`missing achievement ${id}`);

  return achievement.thresholds;
}

describe("computeAchievements — catalog wiring", () => {
  it("returns one progress row per catalog entry with catalog thresholds", () => {
    const payload = compute();

    expect(payload.achievements.map((entry) => entry.id)).toEqual(
      ACHIEVEMENTS.map((entry) => entry.id),
    );
    for (const achievement of ACHIEVEMENTS) {
      const entry = progress(payload, achievement.id);

      expect(entry.thresholds).toEqual(achievement.thresholds);
      expect(entry.category).toBe(achievement.category);
      expect(entry.unit).toBe(achievement.unit);
    }
  });

  it("locks the whole grid for an empty account and keeps the tier keys fixed", () => {
    const payload = compute();

    for (const entry of payload.achievements) {
      expect(entry.tier).toBe(0);
      expect(entry.value).toBe(0);
      expect(entry.next_threshold).toBe(entry.thresholds[0]);
      expect(Object.keys(entry.achieved_at)).toEqual([
        "bronze",
        "silver",
        "gold",
        "diamond",
        "king",
      ]);
      expect(Object.values(entry.achieved_at).every((day) => day === null)).toBe(
        true,
      );
    }
    expect(payload.generated_at).toBe(new Date(NOW).toISOString());
  });
});

describe("computeAchievements — cumulative tiers", () => {
  it("awards on the exact threshold and stays locked one token earlier", () => {
    const [bronze, silver] = thresholdsOf("token_titan");
    const exact = compute({ hourly: [row({ total_tokens: bronze })] });
    const below = compute({ hourly: [row({ total_tokens: bronze - 1 })] });

    expect(progress(exact, "token_titan")).toMatchObject({
      value: bronze,
      tier: 1,
      next_threshold: silver,
      achieved_at: {
        bronze: "2026-10-01",
        silver: null,
        gold: null,
        diamond: null,
        king: null,
      },
    });
    expect(progress(below, "token_titan").tier).toBe(0);
    expect(progress(below, "token_titan").achieved_at.bronze).toBeNull();
  });

  it("dates each cumulative tier on the running-sum crossing day", () => {
    const [bronze, silver] = thresholdsOf("token_titan");
    const hourly = [
      row({ hour_start: "2026-10-01T02:00:00.000Z", total_tokens: bronze }),
      row({
        hour_start: "2026-10-02T02:00:00.000Z",
        total_tokens: silver - bronze,
      }),
    ];
    const entry = progress(compute({ hourly }), "token_titan");

    expect(entry.value).toBe(silver);
    expect(entry.tier).toBe(2);
    expect(entry.achieved_at.bronze).toBe("2026-10-01");
    expect(entry.achieved_at.silver).toBe("2026-10-02");
    expect(entry.achieved_at.gold).toBeNull();
  });

  it("steps every historical-max tier exactly at its threshold", () => {
    thresholdsOf("big_day").forEach((threshold, index) => {
      const entry = progress(
        compute({ hourly: [row({ total_tokens: threshold })] }),
        "big_day",
      );

      expect(entry.tier).toBe(index + 1);
      expect(entry.value).toBe(threshold);
      expect(entry.achieved_at.bronze).toBe("2026-10-01");
      expect(entry.achieved_at[TIERS[index].key]).toBe("2026-10-01");
    });
  });

  it("measures output and cached tokens from their own fields", () => {
    const output = progress(
      compute({
        hourly: [
          row({ output_tokens: thresholdsOf("wordsmith")[0], total_tokens: 1 }),
        ],
      }),
      "wordsmith",
    );
    const cached = progress(
      compute({
        hourly: [
          row({
            cached_input_tokens: thresholdsOf("cachekeeper")[0],
            total_tokens: 1,
          }),
        ],
      }),
      "cachekeeper",
    );

    expect(output.tier).toBe(1);
    expect(cached.tier).toBe(1);
  });
});

describe("computeAchievements — local day boundaries", () => {
  it("buckets a late-UTC bucket into the next local day", () => {
    const [bronze] = thresholdsOf("big_day");
    const hourly = [
      row({ hour_start: "2026-10-01T16:30:00.000Z", total_tokens: bronze }),
    ];

    expect(progress(compute({ hourly }), "big_day").achieved_at.bronze).toBe(
      "2026-10-02",
    );
    expect(
      progress(compute({ hourly, tzContext: UTC }), "big_day").achieved_at
        .bronze,
    ).toBe("2026-10-01");
  });

  it("splits two UTC hours into two local days across midnight", () => {
    const hourly = [
      row({ hour_start: "2026-10-01T15:00:00.000Z", total_tokens: 1000 }), // 23:00
      row({ hour_start: "2026-10-01T17:00:00.000Z", total_tokens: 1000 }), // 01:00 next day
    ];
    const entry = progress(compute({ hourly }), "marathoner");

    expect(progress(compute({ hourly }), "marathoner").value).toBe(2);
    // One bucket per local day, so the best single day stays at 1000 tokens.
    expect(progress(compute({ hourly }), "big_day").value).toBe(1000);
  });

  it("crosses the year boundary in local time", () => {
    const [bronze] = thresholdsOf("big_day");
    const entry = progress(
      compute({
        hourly: [
          row({ hour_start: "2025-12-31T16:30:00.000Z", total_tokens: bronze }),
        ],
      }),
      "big_day",
    );

    expect(entry.achieved_at.bronze).toBe("2026-01-01");
    expect(progress(compute({ hourly: [] }), "veteran").value).toBe(0);
  });
});

describe("computeAchievements — rhythm", () => {
  it("keeps the longest streak across a gap and dates the crossing day", () => {
    const days = [
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
      "2026-10-08",
    ];
    const hourly = days.map((day) =>
      row({ hour_start: `${day}T02:00:00.000Z`, total_tokens: 1000 }),
    );
    const entry = progress(compute({ hourly }), "streak");

    expect(entry.value).toBe(4);
    expect(entry.tier).toBe(1); // bronze 3, silver 7
    expect(entry.achieved_at.bronze).toBe("2026-10-03");
    expect(entry.achieved_at.silver).toBeNull();
  });

  it("breaks a streak on a day with zero tokens and on a missing day", () => {
    const hourly = [
      row({ hour_start: "2026-10-01T02:00:00.000Z", total_tokens: 1000 }),
      row({ hour_start: "2026-10-02T02:00:00.000Z", total_tokens: 1000 }),
      row({ hour_start: "2026-10-03T02:00:00.000Z", total_tokens: 0 }),
      row({ hour_start: "2026-10-04T02:00:00.000Z", total_tokens: 1000 }),
      row({ hour_start: "2026-10-05T02:00:00.000Z", total_tokens: 1000 }),
    ];

    expect(progress(compute({ hourly }), "streak").value).toBe(2);
    expect(progress(compute({ hourly }), "marathoner").value).toBe(4);
  });

  it("counts weekend activity and night buckets on distinct local dates", () => {
    const hourly = [
      row({ hour_start: "2026-10-03T02:00:00.000Z" }), // Saturday 10:00
      row({ hour_start: "2026-10-04T02:00:00.000Z" }), // Sunday 10:00
      row({ hour_start: "2026-10-05T02:00:00.000Z" }), // Monday 10:00
      row({ hour_start: "2026-10-06T17:00:00.000Z" }), // Tuesday 01:00 next day
      row({ hour_start: "2026-10-07T17:30:00.000Z" }), // Wednesday 01:30
      row({ hour_start: "2026-10-07T18:30:00.000Z" }), // Wednesday 02:30, same night
    ];
    const payload = compute({ hourly });

    expect(progress(payload, "weekend_warrior").value).toBe(2);
    expect(progress(payload, "weekend_warrior").achieved_at.bronze).toBeNull();
    expect(progress(payload, "night_owl").value).toBe(2);
    expect(progress(payload, "night_owl").achieved_at.bronze).toBeNull();
  });
});

describe("computeAchievements — distinct counts", () => {
  it("counts models on the day the set grows", () => {
    const models = ["m1", "m2", "m3", "m4", "m5"];
    const hourly = [
      ...models
        .slice(0, 3)
        .map((model) =>
          row({ hour_start: "2026-10-01T02:00:00.000Z", model }),
        ),
      ...models
        .slice(3)
        .map((model) =>
          row({ hour_start: "2026-10-02T02:00:00.000Z", model }),
        ),
    ];
    const payload = compute({ hourly });

    expect(progress(payload, "polyglot").value).toBe(5);
    expect(progress(payload, "polyglot").tier).toBe(1);
    expect(progress(payload, "polyglot").achieved_at.bronze).toBe("2026-10-02");
    expect(progress(payload, "model_symphony").value).toBe(3);
  });

  it("counts distinct sources without folding aliases", () => {
    const hourly = [
      row({ source: "codex", hour_start: "2026-10-01T02:00:00.000Z" }),
      row({ source: "claude-code", hour_start: "2026-10-01T03:00:00.000Z" }),
      row({ source: "codex", hour_start: "2026-10-01T04:00:00.000Z" }),
    ];
    const payload = compute({ hourly });

    expect(progress(payload, "multitool").value).toBe(2);
    expect(progress(payload, "multitool").achieved_at.bronze).toBe(
      "2026-10-01",
    );
  });

  it("keeps revoked devices in both the token total and the fleet count", () => {
    const [bronze, silver] = thresholdsOf("token_titan");
    const payload = compute({
      hourly: [
        row({
          device_id: "device-active",
          total_tokens: Math.floor(bronze / 2),
        }),
        row({
          device_id: "device-revoked",
          total_tokens: bronze - Math.floor(bronze / 2),
        }),
      ],
      devices: [
        {
          id: "device-active",
          created_at: "2026-09-01T00:00:00.000Z",
          revoked_at: null,
        },
        {
          id: "device-revoked",
          created_at: "2026-09-02T00:00:00.000Z",
          revoked_at: "2026-09-10T00:00:00.000Z",
        },
      ],
    });
    const fleet = progress(payload, "fleet");

    expect(progress(payload, "token_titan").tier).toBe(1);
    expect(progress(payload, "token_titan").next_threshold).toBe(silver);
    expect(fleet.value).toBe(2);
    expect(fleet.tier).toBe(1);
    expect(fleet.achieved_at.bronze).toBe("2026-09-02");
  });
});

describe("computeAchievements — sessions", () => {
  const sessions = [
    session({
      session_id: "s1",
      project_key: "alpha",
      started_at: "2026-10-01T02:00:00.000Z",
      ended_at: "2026-10-01T05:00:00.000Z",
      total_tokens: 2_000_000,
    }),
    session({
      session_id: "s2",
      project_key: "beta",
      started_at: "2026-10-02T02:00:00.000Z",
      ended_at: "2026-10-02T02:30:00.000Z",
      total_tokens: 500_000,
    }),
    session({
      session_id: "s3",
      project_key: "",
      started_at: "2026-10-03T02:00:00.000Z",
      ended_at: "2026-10-03T05:00:00.000Z",
      total_tokens: 9_000_000,
    }),
  ];

  it("reads duration, project diversity and project loyalty from sessions", () => {
    const payload = compute({ sessions });

    expect(progress(payload, "marathon_session").value).toBe(3 * 3_600_000);
    expect(progress(payload, "marathon_session").achieved_at.bronze).toBe(
      "2026-10-01",
    );
    expect(progress(payload, "project_hopper").value).toBe(2);
    expect(progress(payload, "project_hopper").achieved_at.bronze).toBeNull();
    expect(progress(payload, "project_devotion").value).toBe(2_000_000);
  });

  it("leaves sessions-sourced achievements at zero without sessions", () => {
    const payload = compute({
      hourly: [row({ total_tokens: thresholdsOf("token_titan")[0] })],
    });

    expect(progress(payload, "marathon_session").value).toBe(0);
    expect(progress(payload, "project_hopper").value).toBe(0);
    expect(progress(payload, "project_devotion").value).toBe(0);
  });
});

describe("computeAchievements — ratios and sync runs", () => {
  it("requires the single-day volume gate for the cache ratio", () => {
    const gate = CACHE_ALCHEMY_MIN_DAY_TOKENS;
    const tiny = compute({
      hourly: [
        row({
          input_tokens: 0,
          cached_input_tokens: 10,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          total_tokens: 10,
        }),
      ],
    });
    // A rate midway between bronze and silver lands on bronze whatever the
    // calibrated thresholds are.
    const [bronze, silver] = thresholdsOf("cache_alchemy");
    const rate = bronze + (silver - bronze) / 2;
    const big = compute({
      hourly: [
        row({
          input_tokens: gate * (1 - rate),
          cached_input_tokens: gate * rate,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          total_tokens: gate,
        }),
      ],
    });

    expect(progress(tiny, "cache_alchemy").tier).toBe(0);
    expect(progress(big, "cache_alchemy").value).toBeCloseTo(rate, 10);
    expect(progress(big, "cache_alchemy").tier).toBe(1);
    expect(progress(big, "cache_alchemy").achieved_at.bronze).toBe(
      "2026-10-01",
    );
  });

  it("counts consecutive local days with a successful sync run", () => {
    const days = [
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
      "2026-10-05",
      "2026-10-06",
      "2026-10-07",
    ];
    const syncRuns = [
      ...days.map((day) => ({
        started_at: `${day}T02:00:00.000Z`,
        result: "ok",
      })),
      { started_at: "2026-10-08T02:00:00.000Z", result: "failed" },
      { started_at: "2026-10-09T02:00:00.000Z", result: "partial" },
    ];
    const entry = progress(compute({ syncRuns }), "sync_diligence");

    expect(entry.value).toBe(7);
    expect(entry.tier).toBe(1);
    expect(entry.achieved_at.bronze).toBe("2026-10-07");
    expect(entry.achieved_at.silver).toBeNull();
  });
});

describe("computeAchievements — injected clock and monotonicity", () => {
  it("derives veteran days and generated_at from the injected now", () => {
    const hourly = [row({ hour_start: "2026-01-01T02:00:00.000Z" })];
    const early = compute({ hourly, now: "2026-02-01T00:00:00.000Z" });
    const later = compute({ hourly, now: "2027-01-02T00:00:00.000Z" });

    expect(progress(later, "veteran").value).toBeGreaterThan(
      progress(early, "veteran").value,
    );
    expect(later.generated_at).toBe("2027-01-02T00:00:00.000Z");
    expect(progress(early, "veteran").achieved_at.bronze).toBe("2026-01-31");
    expect(progress(early, "veteran").achieved_at.silver).toBeNull();
  });

  it("never lowers a tier or moves an achieved date when history is appended", () => {
    const base: Partial<AchievementsInput> = {
      hourly: [
        row({ hour_start: "2026-01-01T02:00:00.000Z", total_tokens: 5_000_000 }),
        row({ hour_start: "2026-01-02T02:00:00.000Z", total_tokens: 5_000_000 }),
        row({
          hour_start: "2026-01-03T02:00:00.000Z",
          total_tokens: 5_000_000,
          cached_input_tokens: 4_000_000,
        }),
      ],
      sessions: [session({ total_tokens: 2_000_000 })],
      syncRuns: [
        { started_at: "2026-01-01T02:00:00.000Z", result: "ok" },
        { started_at: "2026-01-02T02:00:00.000Z", result: "ok" },
      ],
      devices: [
        { id: "device-a", created_at: "2026-01-01T00:00:00.000Z" },
        { id: "device-b", created_at: "2026-01-02T00:00:00.000Z" },
      ],
    };
    const before = compute(base);
    const after = compute({
      ...base,
      hourly: [
        ...(base.hourly ?? []),
        row({ hour_start: "2026-02-01T02:00:00.000Z", total_tokens: 50_000_000 }),
      ],
      sessions: [
        ...(base.sessions ?? []),
        session({ session_id: "s2", project_key: "beta", total_tokens: 1 }),
      ],
      syncRuns: [
        ...(base.syncRuns ?? []),
        { started_at: "2026-01-03T02:00:00.000Z", result: "ok" },
      ],
      devices: [
        ...(base.devices ?? []),
        { id: "device-c", created_at: "2026-01-03T00:00:00.000Z" },
      ],
    });

    for (const achievement of ACHIEVEMENTS) {
      const earlier = progress(before, achievement.id);
      const later = progress(after, achievement.id);

      expect(later.tier).toBeGreaterThanOrEqual(earlier.tier);
      for (const tier of TIERS) {
        const day = earlier.achieved_at[tier.key];

        if (day) expect(later.achieved_at[tier.key]).toBe(day);
      }
    }
  });
});
