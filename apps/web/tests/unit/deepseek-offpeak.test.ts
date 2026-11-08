// Locks DeepSeek's time-of-use schedule (docs: `deepseek_v4_pricing_note` in
// src/lib/pricing/curated-overrides.json — operator-verified 2026-08-21).
// Peak = 01:00–04:00 and 06:00–10:00 UTC; everything else (including the
// midday gap and the whole Beijing weekend since 2026-08-23) bills at half
// price. If a test here fails after a pricing-snapshot rebuild, the schedule
// table was edited — re-verify against DeepSeek's official pricing page
// before accepting the change.

import { describe, expect, it } from "vitest";

import {
  DEEPSEEK_PEAK_HOURS_UTC,
  isDeepSeekOffPeak,
  isDeepSeekPeakHourUtc,
} from "@/lib/pricing";

// 2026-08-26 is a Wednesday (Beijing and UTC agree mid-week).
const WEDNESDAY = "2026-08-26";
// 2026-08-29 is a Saturday in Beijing (16:00Z Friday 08-28 → 16:00Z Sunday).
const BEIJING_SATURDAY = "2026-08-29";

function row(day: string, hour: number) {
  return { hour_start: `${day}T${String(hour).padStart(2, "0")}:00:00.000Z` };
}

describe("DeepSeek off-peak schedule", () => {
  it("keeps the two peak blocks as data", () => {
    expect(DEEPSEEK_PEAK_HOURS_UTC).toEqual([
      [1, 4],
      [6, 10],
    ]);
  });

  it("bills peak hours inside the two UTC blocks", () => {
    for (const hour of [1, 2, 3, 6, 7, 8, 9]) {
      expect(isDeepSeekPeakHourUtc(hour), `hour ${hour}`).toBe(true);
      expect(isDeepSeekOffPeak(row(WEDNESDAY, hour)), `hour ${hour}`).toBe(
        false,
      );
    }
  });

  it("bills the midday gap and the late evening as off-peak", () => {
    for (const hour of [0, 4, 5, 10, 12, 14, 18, 23]) {
      expect(isDeepSeekPeakHourUtc(hour), `hour ${hour}`).toBe(false);
      expect(isDeepSeekOffPeak(row(WEDNESDAY, hour)), `hour ${hour}`).toBe(
        true,
      );
    }
  });

  it("bills whole Beijing weekends off-peak since 2026-08-23, peak hours included", () => {
    expect(isDeepSeekOffPeak(row(BEIJING_SATURDAY, 2))).toBe(true);
    expect(isDeepSeekOffPeak(row(BEIJING_SATURDAY, 7))).toBe(true);
  });

  it("keeps pre-2026-08-23 weekends on the hour-of-day schedule", () => {
    // 2026-08-21 is a Friday whose 02:00 UTC is still a Beijing workday.
    expect(isDeepSeekOffPeak(row("2026-08-21", 2))).toBe(false);
    expect(isDeepSeekOffPeak(row("2026-08-21", 5))).toBe(true);
  });

  it("honors an explicit pricing_tier override before the clock rules", () => {
    expect(isDeepSeekOffPeak({ pricing_tier: "off_peak" })).toBe(true);
    expect(isDeepSeekOffPeak({ pricing_tier: "peak" })).toBe(false);
    // An unparseable hour_start degrades to peak pricing, never a silent 50%.
    expect(isDeepSeekOffPeak({ hour_start: "garbage" })).toBe(false);
  });
});
