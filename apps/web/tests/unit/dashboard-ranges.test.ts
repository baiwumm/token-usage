// Unit tests for the dashboard range/timezone math (lib/dashboard/ranges.ts).
// DST correctness is the risky part — Asia/Shanghai (fixed +8) anchors the
// simple cases, America/New_York crosses the 2026 spring-forward boundary.

import { describe, expect, it } from "vitest";

import {
  dayKeyInTz,
  isValidDayKey,
  rangeForPreset,
  startOfDayUtcMs,
  tzOffsetMinutes,
  yearRange,
} from "@/lib/dashboard/ranges";

describe("dayKeyInTz", () => {
  it("formats the zone-local calendar day", () => {
    // 2026-10-24T20:00Z is 2026-10-25 04:00 in Shanghai.
    expect(dayKeyInTz(new Date("2026-10-24T20:00:00Z"), "Asia/Shanghai")).toBe(
      "2026-10-25",
    );
    expect(dayKeyInTz(new Date("2026-10-24T20:00:00Z"), "UTC")).toBe(
      "2026-10-24",
    );
  });
});

describe("tzOffsetMinutes", () => {
  it("reports fixed offsets", () => {
    expect(
      tzOffsetMinutes(new Date("2026-10-24T00:00:00Z"), "Asia/Shanghai"),
    ).toBe(480);
    expect(tzOffsetMinutes(new Date("2026-10-24T00:00:00Z"), "UTC")).toBe(0);
  });

  it("tracks DST in America/New_York", () => {
    expect(
      tzOffsetMinutes(new Date("2026-03-07T12:00:00Z"), "America/New_York"),
    ).toBe(-300); // EST
    expect(
      tzOffsetMinutes(new Date("2026-03-09T12:00:00Z"), "America/New_York"),
    ).toBe(-240); // EDT (2026 spring-forward: Mar 8)
  });
});

describe("startOfDayUtcMs", () => {
  it("lands on local midnight for a fixed-offset zone", () => {
    const ms = startOfDayUtcMs("2026-10-24", "Asia/Shanghai");

    expect(new Date(ms).toISOString()).toBe("2026-10-23T16:00:00.000Z");
  });

  it("survives a DST transition day (US spring-forward 2026-03-08)", () => {
    const ms = startOfDayUtcMs("2026-03-08", "America/New_York");

    // Local midnight EDT == 04:00Z on the transition day itself... the day
    // STARTS at 05:00Z local (EST midnight = 05:00Z, clocks jump to EDT).
    expect(new Date(ms).toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });
});

describe("rangeForPreset", () => {
  it("covers 7 local days ending today, to-bound exclusive", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const range = rangeForPreset("7d", "Asia/Shanghai", now);

    expect(range.toDay).toBe("2026-10-24");
    expect(range.fromDay).toBe("2026-10-18");
    expect(range.fromIso).toBe("2026-10-17T16:00:00.000Z");
    expect(range.toIso).toBe("2026-10-24T16:00:00.000Z");
  });

  it("all reaches back to the sentinel start (server clamps the series)", () => {
    const now = new Date("2026-10-24T10:00:00Z");
    const range = rangeForPreset("all", "UTC", now);

    expect(range.fromDay).toBe("2000-01-01");
    expect(range.toDay).toBe("2026-10-24");
  });
});

describe("isValidDayKey", () => {
  it("accepts only YYYY-MM-DD", () => {
    expect(isValidDayKey("2026-10-24")).toBe(true);
    expect(isValidDayKey("2026-10-2")).toBe(false);
    expect(isValidDayKey("garbage")).toBe(false);
    expect(isValidDayKey(42)).toBe(false);
  });
});

describe("yearRange", () => {
  it("spans the calendar year in UTC", () => {
    const range = yearRange(2026, "UTC");

    expect(range.fromIso).toBe("2026-01-01T00:00:00.000Z");
    expect(range.toIso).toBe("2027-01-01T00:00:00.000Z");
    expect(range.fromDay).toBe("2026-01-01");
    expect(range.toDay).toBe("2026-12-31");
  });

  it("shifts with a fixed-offset zone", () => {
    const range = yearRange(2026, "Asia/Shanghai");

    expect(range.fromIso).toBe("2025-12-31T16:00:00.000Z");
    expect(range.toIso).toBe("2026-12-31T16:00:00.000Z");
  });
});
