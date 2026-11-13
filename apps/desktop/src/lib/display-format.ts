// Number / currency rules shared with the web dashboard, trimmed to the four
// preferences the desktop exposes. The desktop keeps its own localStorage copy
// (desktop-plan §9: no cross-app preference sync) but formats identically, so
// the same window reads the same numbers on both surfaces. Ported from
// apps/web/src/lib/format/core.ts — pure functions, no React, no new deps.

export type CurrencyCode = "USD" | "EUR" | "GBP" | "CNY" | "JPY" | "HKD";
export type TokenDisplay = "compact" | "full";
export type TokenUnit = "kmb" | "wan";
export type TokenGrouping = 3 | 4;

export interface DisplayFormat {
  currency: CurrencyCode;
  tokenDisplay: TokenDisplay;
  tokenUnit: TokenUnit;
  tokenGrouping: TokenGrouping;
}

export const SUPPORTED_CURRENCIES: readonly CurrencyCode[] = [
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "JPY",
  "HKD",
];

export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  JPY: "¥",
  HKD: "HK$",
};

export interface FxSnapshot {
  as_of: string;
  /** Units of the currency per 1 USD. */
  rates: Record<string, number>;
}

// Offline snapshot. The desktop makes no FX network request (§3 zero-network
// boundary), so this vendored table is the only conversion source.
export const BUILT_IN_FX: FxSnapshot = {
  as_of: "2026-10-25",
  rates: {
    USD: 1,
    EUR: 0.92,
    GBP: 0.79,
    CNY: 6.6849,
    JPY: 149.5,
    HKD: 7.8,
  },
};

/**
 * The desktop shipped with a compact 万/亿 look (narrow 340–400 px window),
 * so that stays the default; switching to 完整 reproduces the web's full
 * digits. Web's own default is `full` — the preferences are deliberately
 * independent, not synced.
 */
export const DEFAULT_DISPLAY_FORMAT: DisplayFormat = {
  currency: "USD",
  tokenDisplay: "compact",
  tokenUnit: "wan",
  tokenGrouping: 3,
};

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    SUPPORTED_CURRENCIES.includes(value as CurrencyCode)
  );
}

export function sanitizeDisplayFormat(
  input: Partial<Record<keyof DisplayFormat, unknown>>,
): DisplayFormat {
  return {
    currency: isSupportedCurrency(input.currency)
      ? input.currency
      : DEFAULT_DISPLAY_FORMAT.currency,
    tokenDisplay:
      input.tokenDisplay === "full" || input.tokenDisplay === "compact"
        ? input.tokenDisplay
        : DEFAULT_DISPLAY_FORMAT.tokenDisplay,
    tokenUnit:
      input.tokenUnit === "kmb" || input.tokenUnit === "wan"
        ? input.tokenUnit
        : DEFAULT_DISPLAY_FORMAT.tokenUnit,
    tokenGrouping: input.tokenGrouping === 4 ? 4 : 3,
  };
}

/** "人民币(￥)" — Intl CLDR name plus the narrow symbol. */
export function currencyLabel(code: CurrencyCode): string {
  let name: string = code;

  try {
    name =
      new Intl.DisplayNames(["zh-CN"], { type: "currency" }).of(code) ?? code;
  } catch {
    // No CLDR coverage — keep the bare code.
  }

  return `${name}(${CURRENCY_SYMBOLS[code]})`;
}

export function formatFxRate(currency: CurrencyCode): string {
  const rate = BUILT_IN_FX.rates[currency] ?? 1;
  const formatted = new Intl.NumberFormat("zh-CN", {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rate);

  return `1 USD = ${formatted} ${currency}`;
}

/** Group an integer every 3 or 4 digits (zh-CN separator). */
export function groupDigits(
  value: number,
  grouping: TokenGrouping = 3,
): string {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.trunc(Math.abs(value)));
  const groups: string[] = [];

  for (let end = digits.length; end > 0; end -= grouping) {
    groups.unshift(digits.slice(Math.max(0, end - grouping), end));
  }

  return `${sign}${groups.join(",")}`;
}

const scaledFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

function compactKmb(value: number): string {
  const abs = Math.abs(value);

  if (abs < 1_000) return groupDigits(value, 3);

  const units = [
    { size: 1e12, suffix: "T" },
    { size: 1e9, suffix: "B" },
    { size: 1e6, suffix: "M" },
    { size: 1e3, suffix: "K" },
  ];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];

    if (abs < unit.size) continue;
    let rounded = Math.round((value / unit.size) * 10) / 10;

    // 999.95K rounds to 1000.0K → promote to the next unit (1M).
    if (Math.abs(rounded) >= 1000 && index > 0) {
      const next = units[index - 1];

      rounded = Math.round((value / next.size) * 10) / 10;

      return `${scaledFormatter.format(rounded)}${next.suffix}`;
    }

    return `${scaledFormatter.format(rounded)}${unit.suffix}`;
  }

  return groupDigits(value, 3);
}

function compactWan(value: number): string {
  const abs = Math.abs(value);

  if (abs < 1e4) return groupDigits(value, 3);

  const units = [
    { size: 1e12, suffix: "万亿" },
    { size: 1e8, suffix: "亿" },
    { size: 1e4, suffix: "万" },
  ];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];

    if (abs < unit.size) continue;
    let rounded = Math.round((value / unit.size) * 10) / 10;

    if (Math.abs(rounded) >= 1e4 && index > 0) {
      const next = units[index - 1];

      rounded = Math.round((value / next.size) * 10) / 10;

      return `${scaledFormatter.format(rounded)}${next.suffix}`;
    }

    return `${scaledFormatter.format(rounded)}${unit.suffix}`;
  }

  return groupDigits(value, 3);
}

export function formatTokensWith(value: number, format: DisplayFormat): string {
  if (!Number.isFinite(value)) return "—";
  if (format.tokenDisplay === "full") {
    return groupDigits(value, format.tokenGrouping);
  }

  return format.tokenUnit === "wan" ? compactWan(value) : compactKmb(value);
}

export function formatNumberWith(value: number, format: DisplayFormat): string {
  return Number.isFinite(value)
    ? groupDigits(value, format.tokenGrouping)
    : "—";
}

const costFormatters = new Map<CurrencyCode, Intl.NumberFormat>();

function costFormatter(currency: CurrencyCode): Intl.NumberFormat {
  const hit = costFormatters.get(currency);

  if (hit) return hit;

  const formatter = new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  costFormatters.set(currency, formatter);

  return formatter;
}

/** USD → display currency. Storage stays USD; only the presentation changes. */
export function convertCost(valueUsd: number, format: DisplayFormat): number {
  return valueUsd * (BUILT_IN_FX.rates[format.currency] ?? 1);
}

export function formatCostWith(
  valueUsd: number,
  format: DisplayFormat,
): string {
  if (!Number.isFinite(valueUsd)) return "—";

  const converted = convertCost(valueUsd, format);
  const formatter = costFormatter(format.currency);
  const abs = Math.abs(converted);

  if (abs === 0) return formatter.format(0);
  if (abs < 0.01) {
    const tiny = formatter.format(0.01);

    return converted < 0 ? `-<${tiny}` : `<${tiny}`;
  }

  return formatter.format(converted);
}
