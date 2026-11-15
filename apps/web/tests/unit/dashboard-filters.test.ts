// Unit tests for the dashboard URL filter contract
// (components/dashboard/filters.ts). The tz sanitization is the risky part:
// an unresolvable ?tz= used to throw inside the range memo and error the
// whole page; it now falls back to the browser zone and the next serialize
// scrubs it from the address bar.

import { describe, expect, it } from "vitest";

import { parseFilters, serializeFilters } from "@/components/dashboard/filters";

describe("parseFilters", () => {
  it("starts at the default window; only tz / device_id persist", () => {
    const filters = parseFilters(
      new URLSearchParams("tz=Asia/Shanghai&device_id=abc"),
    );

    expect(filters.range).toBe("all");
    expect(filters.from).toBe("");
    expect(filters.to).toBe("");
    expect(filters.tz).toBe("Asia/Shanghai");
    expect(filters.deviceId).toBe("abc");
  });

  it("keeps a resolvable IANA zone", () => {
    expect(parseFilters(new URLSearchParams("tz=UTC")).tz).toBe("UTC");
    expect(parseFilters(new URLSearchParams("tz=America/New_York")).tz).toBe(
      "America/New_York",
    );
  });

  it("drops an unresolvable zone instead of throwing later", () => {
    expect(parseFilters(new URLSearchParams("tz=Not/AZone")).tz).toBe("");
    expect(parseFilters(new URLSearchParams("tz=garbage")).tz).toBe("");
  });

  it("keeps an empty tz empty", () => {
    expect(parseFilters(new URLSearchParams()).tz).toBe("");
  });
});

describe("serializeFilters", () => {
  it("round-trips tz and device_id, omitting defaults", () => {
    const filters = parseFilters(
      new URLSearchParams("tz=Asia/Shanghai&device_id=abc"),
    );

    expect(serializeFilters(filters)).toBe(
      "tz=Asia%2FShanghai&device_id=abc",
    );
  });

  it("emits nothing for the default window (scrubs stale bookmarks)", () => {
    expect(serializeFilters(parseFilters(new URLSearchParams()))).toBe("");
    expect(
      serializeFilters(parseFilters(new URLSearchParams("tz=Not/AZone"))),
    ).toBe("");
  });
});
