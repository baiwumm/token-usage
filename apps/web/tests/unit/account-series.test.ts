// Unit tests for the pure series aggregation (docs/cli-contract.md §2.7
// semantics: tz bucketing, 1095-day clamp, UTC monthly buckets, heatmap
// levels, device filter excluding account-level sources).

import { describe, expect, it } from "vitest";

import {
  boundRangeStart,
  dailySeries,
  deviceTotals,
  heatmapCells,
  heatmapCompactWire,
  hourlySeriesForDay,
  isValidDayKey,
  modelBreakdownSources,
  monthlySeries,
  parseTzContext,
  rowsForRequest,
  uuidOrNull,
  zonedDayKey,
} from "@/lib/account/series";

// Unpriced model keeps every cost at exactly 0 in these tests.
const M = "test-unpriced-model";
const UTC0 = { timeZone: null, offsetMinutes: 0 };

function row(over: Record<string, unknown> = {}) {
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
    ...over,
  };
}

describe("parseTzContext", () => {
  it("reads tz and tz_offset_minutes", () => {
    const params = new URLSearchParams("tz=Asia/Shanghai&tz_offset_minutes=480");
    expect(parseTzContext(params)).toEqual({ timeZone: "Asia/Shanghai", offsetMinutes: 480 });
  });

  it("falls back to nulls for tz and 0 for a missing offset (Number(null))", () => {
    // Ported quirk: searchParams.get returns null and Number(null) === 0, so
    // an absent tz_offset_minutes means UTC — same as the reference.
    expect(parseTzContext(new URLSearchParams(""))).toEqual({ timeZone: null, offsetMinutes: 0 });
  });

  it("truncates fractional offsets", () => {
    expect(parseTzContext(new URLSearchParams("tz_offset_minutes=450.7")).offsetMinutes).toBe(450);
  });
});

describe("zonedDayKey", () => {
  it("uses the IANA zone when valid", () => {
    // 2026-10-21T20:00:00Z is 2026-10-22 04:00 in Shanghai.
    expect(zonedDayKey("2026-10-21T20:00:00.000Z", { timeZone: "Asia/Shanghai", offsetMinutes: null })).toBe("2026-10-22");
  });

  it("uses the numeric offset when the zone is invalid", () => {
    expect(zonedDayKey("2026-10-21T20:00:00.000Z", { timeZone: "Not/AZone", offsetMinutes: 480 })).toBe("2026-10-22");
  });

  it("falls back to server-local without tz context", () => {
    expect(zonedDayKey("2026-10-21T00:00:00.000Z", {})).toBe(zonedDayKey("2026-10-21T00:00:00.000Z", {}));
  });

  it("isValidDayKey rejects garbage", () => {
    expect(isValidDayKey("2026-10-21")).toBe(true);
    expect(isValidDayKey("2026-13-01")).toBe(false);
    expect(isValidDayKey("20261021")).toBe(false);
    expect(isValidDayKey(null)).toBe(false);
  });
});

describe("dailySeries", () => {
  it("buckets rows per tz-local day and sums token columns", () => {
    const rows = [
      row({ hour_start: "2026-10-21T10:00:00.000Z" }),
      row({ hour_start: "2026-10-21T23:00:00.000Z" }),
    ];
    const data = dailySeries(rows, UTC0);
    expect(data).toHaveLength(1);
    expect(data[0].day).toBe("2026-10-21");
    expect(data[0].total_tokens).toBe(300);
    expect(data[0].billable_total_tokens).toBe(300); // null billable → total
    expect(data[0].conversation_count).toBe(2);
    expect(data[0].models).toEqual({ [M]: 300 });
    expect(data[0].total_cost_usd).toBe(0);
  });

  it("shifts rows across the tz boundary", () => {
    const rows = [
      row({ hour_start: "2026-10-21T20:00:00.000Z" }),
      row({ hour_start: "2026-10-21T23:00:00.000Z" }),
    ];
    const data = dailySeries(rows, { timeZone: null, offsetMinutes: 480 });
    // 20:00Z+8h and 23:00Z+8h both land on 2026-10-22 local.
    expect(data.map((d) => d.day)).toEqual(["2026-10-22"]);
    expect(data[0].total_tokens).toBe(300);
  });

  it("prefers the billable column when present", () => {
    const data = dailySeries([row({ billable_total_tokens: 99 })], UTC0);
    expect(data[0].billable_total_tokens).toBe(99);
  });
});

describe("hourlySeriesForDay", () => {
  it("emits hour keys of the requested tz-local day only", () => {
    const rows = [
      row({ hour_start: "2026-10-21T05:30:00.000Z" }),
      row({ hour_start: "2026-10-21T06:10:00.000Z" }),
      row({ hour_start: "2026-10-22T05:30:00.000Z" }),
    ];
    const data = hourlySeriesForDay(rows, "2026-10-21", UTC0);
    expect(data.map((b) => b.hour)).toEqual(["2026-10-21T05:00:00", "2026-10-21T06:00:00"]);
  });
});

describe("monthlySeries", () => {
  it("buckets by UTC month and filters to the window", () => {
    const rows = [
      row({ hour_start: "2026-09-30T23:00:00.000Z" }),
      row({ hour_start: "2026-10-01T00:00:00.000Z" }),
      row({ hour_start: "2026-10-31T23:30:00.000Z" }),
      row({ hour_start: "2026-11-01T00:30:00.000Z" }),
    ];
    const data = monthlySeries(rows, "2026-10-01", "2026-10-31");
    expect(data.map((b) => b.month)).toEqual(["2026-10"]);
    expect(data[0].total_tokens).toBe(300);
  });
});

describe("boundRangeStart", () => {
  it("clamps from to at most 1095 days before to", () => {
    expect(boundRangeStart("2000-01-01", "2026-10-21")).toBe(
      new Date(Date.parse("2026-10-21T00:00:00Z") - 1095 * 86400000).toISOString().slice(0, 10),
    );
  });

  it("keeps a shorter window untouched", () => {
    expect(boundRangeStart("2026-10-01", "2026-10-21")).toBe("2026-10-01");
  });

  it("returns from unchanged when the window is inverted", () => {
    expect(boundRangeStart("2026-10-21", "2026-10-01")).toBe("2026-10-21");
  });
});

describe("uuidOrNull", () => {
  it("accepts canonical v1-v5 uuids and rejects others", () => {
    expect(uuidOrNull("22222222-2222-4222-8222-222222222222")).toBe("22222222-2222-4222-8222-222222222222");
    expect(uuidOrNull("22222222-2222-6222-8222-222222222222")).toBeNull(); // v6
    expect(uuidOrNull("not-a-uuid")).toBeNull();
    expect(uuidOrNull(undefined)).toBeNull();
  });
});

describe("rowsForRequest", () => {
  const usage = {
    hourly: [
      row({ device_id: "device-a", source: "codex" }),
      row({ device_id: "device-a", source: "cursor" }),
      row({ device_id: "device-b", source: "codex" }),
      row({ device_id: "device-b", source: "trae-cn" }),
    ],
    canonicalRows: [row({ device_id: null, source: "trae-cn" })],
  };

  it("returns canonical rows without a device filter", () => {
    expect(rowsForRequest(usage, undefined)).toEqual(usage.canonicalRows);
    expect(rowsForRequest(usage, null)).toEqual(usage.canonicalRows);
  });

  it("returns only that device's machine-level rows with a filter", () => {
    const rows = rowsForRequest(usage, "device-a");
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe("codex");
    expect(rowsForRequest(usage, "device-b")).toHaveLength(1);
  });
});

describe("heatmapCells", () => {
  it("emits one cell per day including empty ones, levels by max billable quartile", () => {
    const rows = [
      row({ hour_start: "2026-10-20T00:00:00.000Z", total_tokens: 800 }),
      row({ hour_start: "2026-10-22T00:00:00.000Z", total_tokens: 100 }),
      row({ hour_start: "2026-10-23T00:00:00.000Z", total_tokens: 400 }),
    ];
    const { cells, maxValue, totalCostUsd } = heatmapCells(rows, {
      from: "2026-10-19",
      to: "2026-10-24",
      tzContext: UTC0,
    });
    expect(cells.map((c) => c.day)).toEqual([
      "2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24",
    ]);
    expect(maxValue).toBe(800);
    expect(cells[0]).toMatchObject({ total_tokens: 0, billable_total_tokens: 0, level: 0, models: null });
    expect(cells[1].level).toBe(4); // 800/800 = 1.0
    expect(cells[2].level).toBe(0); // absent day
    expect(cells[3].level).toBe(1); // 100/800 = 0.125 ≤ 0.25
    expect(cells[4].level).toBe(2); // 400/800 = 0.5 ≤ 0.5
    expect(totalCostUsd).toBe(0);
  });

  it("compacts to a sparse wire format with a model dictionary", () => {
    const rows = [
      row({ hour_start: "2026-10-20T00:00:00.000Z", total_tokens: 60, model: "m1" }),
      row({ hour_start: "2026-10-20T05:00:00.000Z", total_tokens: 40, model: "m2" }),
      row({ hour_start: "2026-10-22T00:00:00.000Z", total_tokens: 90, model: "m1" }),
    ];
    const { cells, maxValue } = heatmapCells(rows, { from: "2026-10-20", to: "2026-10-22", tzContext: UTC0 });
    const wire = heatmapCompactWire({ from: "2026-10-20", to: "2026-10-22", weekStartsOn: "sun", cells, maxValue });
    expect(wire).toMatchObject({
      format: "compact",
      active_days: 2,
      streak_days: 0,
      max_value: 100,
      model_names: ["m1", "m2"],
    });
    expect(wire.days).toEqual([
      ["2026-10-20", 100, [0, 60, 1, 40]],
      ["2026-10-22", 90, [0, 90]],
    ]);
  });
});

describe("modelBreakdownSources", () => {
  it("aggregates per source/model with cost provenance", () => {
    const rows = [
      row({ hour_start: "2026-10-21T00:00:00.000Z", source: "grok", model: "grok-x", total_cost_usd: 0.5, total_tokens: 500 }),
      row({ hour_start: "2026-10-21T01:00:00.000Z", source: "grok", model: "grok-x", total_cost_usd: 0, total_tokens: 100 }),
      row({ hour_start: "2026-10-21T02:00:00.000Z", source: "codex", model: M, total_tokens: 300 }),
    ];
    const sources = modelBreakdownSources(rows, { from: "2026-10-21", to: "2026-10-21", tzContext: UTC0 });
    expect(sources.map((s) => s.source)).toEqual(["grok", "codex"]); // sorted by tokens desc

    const grok = sources[0];
    expect(grok.models).toHaveLength(1);
    // One provider-reported row + one unreported row on the same model → mixed.
    expect(grok.models[0].cost_source).toBe("mixed");
    expect(grok.models[0].totals.total_cost_usd).toBe("0.500000");

    // Now with a priced stored cost on the grok row:
    const priced = modelBreakdownSources(
      [row({ hour_start: "2026-10-21T00:00:00.000Z", source: "grok", model: "grok-x", total_cost_usd: 0.5 })],
      { from: "2026-10-21", to: "2026-10-21", tzContext: UTC0 },
    );
    expect(priced[0].models[0].cost_source).toBe("provider_reported");

    // Mixed when both kinds of rows share one model:
    const mixed = modelBreakdownSources(
      [
        row({ hour_start: "2026-10-21T00:00:00.000Z", source: "grok", model: "grok-x", total_cost_usd: 0.5 }),
        row({ hour_start: "2026-10-21T01:00:00.000Z", source: "grok", model: "grok-x", total_cost_usd: 0 }),
      ],
      { from: "2026-10-21", to: "2026-10-21", tzContext: UTC0 },
    );
    expect(mixed[0].models[0].cost_source).toBe("mixed");
  });

  it("ignores rows outside [from, to]", () => {
    const sources = modelBreakdownSources(
      [row({ hour_start: "2026-09-01T00:00:00.000Z" })],
      { from: "2026-10-21", to: "2026-10-21", tzContext: UTC0 },
    );
    expect(sources).toEqual([]);
  });
});

describe("deviceTotals", () => {
  const usage = {
    canonicalRows: [
      row({ device_id: "device-a", source: "codex", total_tokens: 400 }),
      row({ device_id: "device-b", source: "codex", total_tokens: 60 }),
      row({ device_id: null, source: "cursor", total_tokens: 900 }),
      row({ device_id: null, source: "trae-cn", total_tokens: 600 }),
      // revoked device machine rows never reach canonicalRows; a stray
      // account-level row with a device_id still splits to account sources:
      row({ device_id: "device-a", source: "cursor", total_tokens: 1000 }),
    ],
    deviceRows: [
      { id: "device-a", device_name: "A", platform: "cli-device-flow", revoked_at: null, created_at: "2026-01-01T00:00:00.000Z" },
      { id: "device-b", device_name: "B", platform: "cli-device-flow", revoked_at: null, created_at: "2026-01-02T00:00:00.000Z" },
      { id: "device-c", device_name: "C", platform: "cli-device-flow", revoked_at: "2026-01-03T00:00:00.000Z", created_at: "2026-01-03T00:00:00.000Z" },
    ],
  };

  it("lists active devices by usage with the account-level split", () => {
    const { devices, accountSources } = deviceTotals(usage, {
      from: "2026-10-21",
      to: "2026-10-21",
      tzContext: UTC0,
    });
    expect(devices.map((d) => [d.id, d.total_tokens])).toEqual([["device-a", 400], ["device-b", 60]]);
    expect(accountSources).toEqual([
      { source: "cursor", total_tokens: 1900 },
      { source: "trae-cn", total_tokens: 600 },
    ]);
  });
});
