// Unit tests for the pure account canonicalization + dashboard payload
// (docs/cli-contract.md §2.7 aggregation semantics and §2.10 payload shape).

import { describe, expect, it } from "vitest";

import {
  buildDashboardPayload,
  buildDeviceList,
  canonicalizeUsage,
  summarizeRows,
} from "@/lib/account/usage";

const M = "test-unpriced-model";
const UTC0 = { timeZone: null, offsetMinutes: 0 };

function hourlyRow(over: Record<string, unknown> = {}) {
  return {
    hour_start: "2026-10-21T00:00:00.000Z",
    source: "codex",
    model: M,
    device_id: "device-a",
    input_tokens: 100,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 50,
    reasoning_output_tokens: 0,
    total_tokens: 150,
    billable_total_tokens: null,
    conversations: 1,
    total_cost_usd: 0,
    updated_at: "2026-10-21T01:00:00.000Z",
    ...over,
  };
}

const SESSION_STATE = {
  source: "trae-cn",
  session_id: "s1",
  model: M,
  bucket_start: "2026-10-21T07:00:00.000Z",
  snapshot_verified_at: "2026-10-21T08:00:00.000Z",
  input_tokens: 300,
  cached_input_tokens: 100,
  cache_creation_input_tokens: 50,
  output_tokens: 150,
  reasoning_output_tokens: 10,
  total_tokens: 600,
};

describe("pickCanonicalRow / dedupeCursorRows", () => {
  it("prefers the cursor row with the largest total_tokens", () => {
    const rows = [
      hourlyRow({ source: "cursor", device_id: "a", total_tokens: 100 }),
      hourlyRow({ source: "cursor", device_id: "b", total_tokens: 900 }),
    ];
    const deduped = canonicalizeUsage(rows, [], null);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].device_id).toBe("b");
  });

  it("breaks cursor total ties by newest updated_at, then smallest device_id", () => {
    const rows = [
      hourlyRow({ source: "cursor", device_id: "b", updated_at: "2026-10-21T02:00:00.000Z" }),
      hourlyRow({ source: "cursor", device_id: "a", updated_at: "2026-10-21T02:00:00.000Z" }),
    ];
    expect(canonicalizeUsage(rows, [], null)[0].device_id).toBe("a");

    const byTime = [
      hourlyRow({ source: "cursor", device_id: "a", updated_at: "2026-10-21T01:00:00.000Z" }),
      hourlyRow({ source: "cursor", device_id: "b", updated_at: "2026-10-21T03:00:00.000Z" }),
    ];
    expect(canonicalizeUsage(byTime, [], null)[0].device_id).toBe("b");
  });

  it("groups cursor rows by hour_start|source|model", () => {
    const rows = [
      hourlyRow({ source: "cursor", hour_start: "2026-10-21T00:00:00.000Z" }),
      hourlyRow({ source: "cursor", hour_start: "2026-10-21T01:00:00.000Z" }),
      hourlyRow({ source: "cursor", model: "other" }),
    ];
    expect(canonicalizeUsage(rows, [], null)).toHaveLength(3);
  });
});

describe("canonicalizeUsage", () => {
  it("drops trae-cn hourly rows and replaces them with session aggregates", () => {
    const canonical = canonicalizeUsage(
      [hourlyRow({ source: "trae-cn", total_tokens: 424242 })],
      [SESSION_STATE],
      null,
    );
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatchObject({
      source: "trae-cn",
      total_tokens: 600,
      billable_total_tokens: 600,
      conversations: 1,
      device_id: null,
      hour_start: "2026-10-21T07:00:00.000Z",
    });
  });

  it("dedupes cursor rows across devices", () => {
    const canonical = canonicalizeUsage(
      [
        hourlyRow({ source: "cursor", device_id: "a", total_tokens: 900, updated_at: "2026-10-21T06:00:00.000Z" }),
        hourlyRow({ source: "cursor", device_id: "b", total_tokens: 900, updated_at: "2026-10-21T06:30:00.000Z" }),
      ],
      [],
      null,
    );
    expect(canonical).toHaveLength(1);
    expect(canonical[0].device_id).toBe("b");
  });

  it("machine rows of revoked devices drop out; cursor/trae-cn stay", () => {
    const active = new Set(["device-a"]);
    const canonical = canonicalizeUsage(
      [
        hourlyRow({ device_id: "device-a", source: "codex" }),
        hourlyRow({ device_id: "device-revoked", source: "codex", total_tokens: 11111 }),
        hourlyRow({ source: "cursor", device_id: "device-revoked", total_tokens: 900 }),
      ],
      [SESSION_STATE],
      active,
    );
    const sources = canonical.map((r) => r.source).sort();
    expect(sources).toEqual(["codex", "cursor", "trae-cn"]);
    expect(canonical.find((r) => r.source === "codex")?.total_tokens).toBe(150);
  });
});

describe("summarizeRows", () => {
  it("computes totals, day buckets, models with share, sources and per-device usage", () => {
    const canonical = canonicalizeUsage(
      [
        hourlyRow({ hour_start: "2026-10-21T00:00:00.000Z", source: "codex", total_tokens: 1500, conversations: 1 }),
        hourlyRow({ hour_start: "2026-10-21T02:00:00.000Z", source: "claude-code", total_tokens: 700, conversations: 2 }),
        hourlyRow({ hour_start: "2026-10-22T00:00:00.000Z", source: "codex", total_tokens: 300, conversations: 1 }),
      ],
      [],
      null,
    );
    const { totals, daily, models, sources, devices } = summarizeRows(canonical, UTC0);

    expect(totals).toMatchObject({
      total_tokens: 2500,
      billable_total_tokens: 2500,
      conversations: 4,
      buckets: 3,
      active_days: 2,
      first_hour: "2026-10-21T00:00:00.000Z",
      last_hour: "2026-10-22T00:00:00.000Z",
    });
    expect(daily.map((d) => d.date)).toEqual(["2026-10-21", "2026-10-22"]);
    expect(models.map((m) => m.model)).toEqual([M]);
    expect(models[0].share).toBeCloseTo(1, 10);
    expect(sources.map((s) => s.source)).toEqual(["codex", "claude-code"]);
    expect(devices.get("device-a")?.total_tokens).toBe(2500);
  });

  it("tz-shifts the day buckets", () => {
    const canonical = [hourlyRow({ hour_start: "2026-10-21T20:00:00.000Z" })];
    const { daily } = summarizeRows(canonical, { timeZone: null, offsetMinutes: 480 });
    expect(daily.map((d) => d.date)).toEqual(["2026-10-22"]);
  });
});

describe("buildDeviceList", () => {
  it("puts active devices first, sorts by usage, and derives last_used_at", () => {
    const deviceRows = [
      { id: "d1", device_name: "Revoked", platform: "cli", revoked_at: "2026-03-01T00:00:00.000Z", created_at: "2026-01-01T00:00:00.000Z" },
      { id: "d2", device_name: "Idle", platform: "cli", revoked_at: null, created_at: "2026-01-02T00:00:00.000Z" },
      { id: "d3", device_name: "Busy", platform: "cli", revoked_at: null, created_at: "2026-01-03T00:00:00.000Z" },
    ];
    const tokenRows = [
      { device_id: "d2", last_used_at: null, created_at: "2026-02-01T00:00:00.000Z" },
      { device_id: "d3", last_used_at: "2026-02-01T00:00:00.000Z", created_at: "2026-01-03T00:00:00.000Z" },
    ];
    const usage = new Map([
      ["d3", { device_id: "d3", total_tokens: 500, billable_total_tokens: 500, total_cost_usd: 0, buckets: 2, last_hour: "2026-10-21T02:00:00.000Z" }],
      ["d2", { device_id: "d2", total_tokens: 100, billable_total_tokens: 100, total_cost_usd: 0, buckets: 1, last_hour: "2026-10-20T02:00:00.000Z" }],
    ]);
    const list = buildDeviceList(deviceRows, tokenRows, usage);
    expect(list.map((d) => d.device_id)).toEqual(["d3", "d2", "d1"]);
    expect(list[0].last_used_at).toBe("2026-02-01T00:00:00.000Z"); // token last_used
    expect(list[1].last_used_at).toBe("2026-02-01T00:00:00.000Z"); // falls back to created_at
    expect(list[2].active).toBe(false);
  });
});

describe("buildDashboardPayload", () => {
  const usage = () => {
    const hourly = [
      hourlyRow({ hour_start: "2026-10-21T00:00:00.000Z", total_tokens: 1500 }),
      hourlyRow({ hour_start: "2026-10-22T00:00:00.000Z", total_tokens: 300 }),
      hourlyRow({ hour_start: "2026-10-23T00:00:00.000Z", total_tokens: 900, source: "cursor", updated_at: "2026-10-23T01:00:00.000Z" }),
    ];
    const canonicalRows = canonicalizeUsage(hourly, [], new Set(["device-a"]));
    return {
      canonicalRows,
      deviceRows: [
        { id: "device-a", device_name: "A", platform: "cli", revoked_at: null, created_at: "2026-01-01T00:00:00.000Z" },
        { id: "device-z", device_name: "Z", platform: "cli", revoked_at: "2026-01-05T00:00:00.000Z", created_at: "2026-01-02T00:00:00.000Z" },
      ],
      tokenRows: [],
    };
  };

  it("filters [from, to) exclusively and reports both ranges", () => {
    const payload = buildDashboardPayload({
      user: null,
      usage: usage(),
      from: "2026-10-22T00:00:00.000Z",
      to: "2026-10-23T00:00:00.000Z",
      timeZone: null,
      offsetMinutes: 0,
      rangeKey: "custom",
    });
    expect(payload.totals.total_tokens).toBe(300);
    expect(payload.all_time.total_tokens).toBe(2700);
    expect(payload.range).toMatchObject({ key: "custom", from: "2026-10-22T00:00:00.000Z", to: "2026-10-23T00:00:00.000Z", timezone: null, offset_minutes: 0 });
  });

  it("caps models at 24 and separates shared account sources", () => {
    const hourly = Array.from({ length: 30 }, (_, i) =>
      hourlyRow({ hour_start: "2026-10-21T00:00:00.000Z", model: `model-${i}`, total_tokens: 1000 - i }),
    );
    const payload = buildDashboardPayload({
      user: { id: "u", email: "e@x.test" },
      usage: { canonicalRows: canonicalizeUsage(hourly, [], null), deviceRows: [], tokenRows: [] },
      from: null,
      to: null,
      timeZone: null,
      offsetMinutes: null,
      rangeKey: "7d",
    });
    expect(payload.models).toHaveLength(24);
    expect(payload.user).toEqual({ id: "u", email: "e@x.test" });
    expect(payload.shared_account_sources.sources).toEqual([]);
  });

  it("collects shared account sources from the selected range", () => {
    const payload = buildDashboardPayload({
      user: null,
      usage: usage(),
      from: null,
      to: null,
      timeZone: null,
      offsetMinutes: 0,
      rangeKey: "custom",
    });
    expect(payload.shared_account_sources.sources.map((s) => s.source)).toEqual(["cursor"]);
    expect(payload.shared_account_sources.total_tokens).toBe(900);
  });

  it("keeps generated_at an ISO string", () => {
    const payload = buildDashboardPayload({
      user: null,
      usage: { canonicalRows: [], deviceRows: [], tokenRows: [] },
      from: null,
      to: null,
      timeZone: null,
      offsetMinutes: null,
      rangeKey: "custom",
    });
    expect(Number.isFinite(Date.parse(payload.generated_at))).toBe(true);
    expect(payload.totals.buckets).toBe(0);
    expect(payload.devices).toEqual([]);
  });
});
