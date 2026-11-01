// Unit tests for the dashboard read-side aggregation helpers (aggregate.ts).

import { describe, expect, it } from "vitest";

import { peakDay } from "@/components/dashboard/aggregate";
import type { SeriesPoint } from "@/lib/dashboard/api";

function day(day: string, totalTokens: number): SeriesPoint {
  return {
    day,
    total_tokens: totalTokens,
    billable_total_tokens: totalTokens,
    total_cost_usd: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    reasoning_output_tokens: 0,
    conversation_count: 0,
    credits: 0,
    models: {},
  };
}

describe("peakDay", () => {
  it("returns null for an empty series", () => {
    expect(peakDay([])).toBeNull();
  });

  it("picks the day with the most total tokens", () => {
    const points = [day("2026-10-01", 100), day("2026-10-02", 900), day("2026-10-03", 300)];

    expect(peakDay(points)?.day).toBe("2026-10-02");
  });

  it("keeps the earliest day on ties", () => {
    const points = [day("2026-10-01", 500), day("2026-10-02", 500)];

    expect(peakDay(points)?.day).toBe("2026-10-01");
  });

  it("ignores rows without a day key (monthly/hourly shapes)", () => {
    const monthly = { ...day("", 99_999), day: undefined, month: "2026-10" };

    expect(peakDay([monthly, day("2026-10-02", 10)])?.day).toBe("2026-10-02");
    expect(peakDay([monthly])).toBeNull();
  });
});
