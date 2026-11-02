// Fixed-default badge number formatting (docs/badge.md §4.5), shared by the
// SVG renderer and the /u page.

import { describe, expect, it } from "vitest";

import {
  formatBadgeCost,
  formatBadgeCount,
  formatBadgeShare,
  formatBadgeTokens,
} from "@/lib/badge/format";

describe("badge number formatting (docs/badge.md §4.5)", () => {
  it("compacts tokens to KMB with up to two decimals", () => {
    expect(formatBadgeTokens(0)).toBe("0");
    expect(formatBadgeTokens(999)).toBe("999");
    expect(formatBadgeTokens(1500)).toBe("1.5K");
    expect(formatBadgeTokens(209_500_000)).toBe("209.5M");
    expect(formatBadgeTokens(18_480_200_000)).toBe("18.48B");
    expect(formatBadgeTokens(2_000_000)).toBe("2M");
  });

  it("promotes a rounding overflow to the next unit up", () => {
    expect(formatBadgeTokens(999_999)).toBe("1M");
    expect(formatBadgeTokens(999_995_000)).toBe("1B");
  });

  it("formats dollars with cents under $10k and whole dollars from $10k", () => {
    expect(formatBadgeCost(0)).toBe("$0.00");
    expect(formatBadgeCost(1318.4)).toBe("$1,318.40");
    expect(formatBadgeCost(111_721.2075)).toBe("$111,721");
  });

  it("never prints NaN for broken inputs", () => {
    expect(formatBadgeTokens(Number.NaN)).toBe("0");
    expect(formatBadgeCost(Number.POSITIVE_INFINITY)).toBe("$0.00");
    expect(formatBadgeShare(Number.NaN)).toBe("0%");
    expect(formatBadgeCount(-3)).toBe("0");
  });

  it("clamps shares into 0–100%", () => {
    expect(formatBadgeShare(1)).toBe("100%");
    expect(formatBadgeShare(0.684)).toBe("68%");
    expect(formatBadgeShare(1.7)).toBe("100%");
  });
});
