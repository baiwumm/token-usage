import { describe, expect, it } from "vitest";

import {
  BUILT_IN_FX,
  DEFAULT_DISPLAY_FORMAT,
  currencyLabel,
  formatCostWith,
  formatFxRate,
  formatNumberWith,
  formatTokensWith,
  groupDigits,
  sanitizeDisplayFormat,
  type CurrencyCode,
  type DisplayFormat,
} from "@/lib/display-format";

const withFormat = (over: Partial<DisplayFormat> = {}): DisplayFormat => ({
  ...DEFAULT_DISPLAY_FORMAT,
  ...over,
});

describe("groupDigits", () => {
  it("groups by three or four digits and keeps the sign", () => {
    expect(groupDigits(1_234_567, 3)).toBe("1,234,567");
    expect(groupDigits(1_234_567, 4)).toBe("123,4567");
    expect(groupDigits(-1234, 3)).toBe("-1,234");
    expect(groupDigits(0, 4)).toBe("0");
  });
});

describe("formatTokensWith", () => {
  it("uses 万/亿 or K/M/B in compact mode", () => {
    expect(formatTokensWith(12_345, withFormat())).toBe("1.2万");
    expect(formatTokensWith(12_345, withFormat({ tokenUnit: "kmb" }))).toBe(
      "12.3K",
    );
    expect(formatTokensWith(123_456_789, withFormat())).toBe("1.2亿");
  });

  it("uses full digits with the chosen grouping", () => {
    expect(
      formatTokensWith(1_234_567, withFormat({ tokenDisplay: "full" })),
    ).toBe("1,234,567");
    expect(
      formatTokensWith(
        1_234_567,
        withFormat({ tokenDisplay: "full", tokenGrouping: 4 }),
      ),
    ).toBe("123,4567");
  });

  it("never renders NaN", () => {
    expect(formatTokensWith(Number.NaN, withFormat())).toBe("—");
  });
});

describe("formatNumberWith", () => {
  it("follows the grouping preference", () => {
    expect(formatNumberWith(5477, withFormat())).toBe("5,477");
    expect(formatNumberWith(5477, withFormat({ tokenGrouping: 4 }))).toBe(
      "5477",
    );
  });
});

describe("formatCostWith", () => {
  it("keeps USD narrow symbols and two decimals", () => {
    expect(formatCostWith(11.98, withFormat())).toBe("$11.98");
    expect(formatCostWith(0, withFormat())).toBe("$0.00");
    expect(formatCostWith(0.001, withFormat())).toBe("<$0.01");
  });

  it("converts through the built-in FX snapshot for other currencies", () => {
    expect(formatCostWith(10, withFormat({ currency: "CNY" }))).toBe("¥66.85");
    expect(formatCostWith(10, withFormat({ currency: "EUR" }))).toBe("€9.20");
  });
});

describe("sanitizeDisplayFormat", () => {
  it("keeps valid values and falls back for junk", () => {
    expect(
      sanitizeDisplayFormat({
        currency: "JPY",
        tokenDisplay: "full",
        tokenUnit: "kmb",
        tokenGrouping: 4,
      }),
    ).toEqual({
      currency: "JPY",
      tokenDisplay: "full",
      tokenUnit: "kmb",
      tokenGrouping: 4,
    });
    expect(
      sanitizeDisplayFormat({
        currency: "BTC",
        tokenDisplay: "huge",
        tokenUnit: "dozen",
        tokenGrouping: 9,
      }),
    ).toEqual(DEFAULT_DISPLAY_FORMAT);
  });
});

describe("currency labels and FX", () => {
  it("names currencies with their narrow symbol", () => {
    expect(currencyLabel("CNY" as CurrencyCode)).toContain("¥");
    expect(currencyLabel("USD" as CurrencyCode)).toContain("$");
  });

  it("shows the reference rate from the vendored snapshot", () => {
    expect(formatFxRate("CNY")).toContain("6.6849");
    expect(BUILT_IN_FX.rates.USD).toBe(1);
  });
});
