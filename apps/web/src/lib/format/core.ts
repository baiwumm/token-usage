// Shared number / currency / date formatting. Pure functions only — the
// React provider in format.tsx adds preference state, localStorage and the
// locale from LocaleProvider. Every surface (dashboard, sessions, wrapped,
// settings, share cards) must format through here; no scattered toFixed or
// Intl.NumberFormat calls in components (docs/ui-spec.md 数字、货币与时间格式).

import { intlLocaleFor, type Locale } from "@/lib/copy/locale-config";

export type TokenDisplay = "compact" | "full";
export type TokenUnit = "kmb" | "wan";
export type TokenGrouping = 3 | 4;

export interface FormatPreferences {
  currency: string;
  tokenDisplay: TokenDisplay;
  tokenUnit: TokenUnit;
  tokenGrouping: TokenGrouping;
}

export const DEFAULT_FORMAT_PREFERENCES: FormatPreferences = {
  currency: "USD",
  tokenDisplay: "compact",
  tokenUnit: "kmb",
  tokenGrouping: 3,
};

export const FORMAT_STORAGE_KEYS = {
  currency: "token-usage.currency",
  tokenDisplay: "token-usage.token-format",
  tokenUnit: "token-usage.token-unit",
  tokenGrouping: "token-usage.token-grouping",
} as const;

export const SUPPORTED_CURRENCIES = [
  "USD",
  "EUR",
  "GBP",
  "CNY",
  "JPY",
  "HKD",
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/** Narrow symbol shown next to the code in pickers (USD $, CNY ¥, …). */
export const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  USD: "$",
  EUR: "€",
  GBP: "£",
  CNY: "¥",
  JPY: "¥",
  HKD: "HK$",
};

/**
 * Localized picker label: the currency's display name plus its narrow symbol,
 * e.g. zh "人民币(￥)" / en "US Dollar($)". Falls back to the bare code when
 * the runtime has no CLDR data for the currency.
 */
export function currencyLabel(code: CurrencyCode, locale: "zh" | "en"): string {
  let name: string = code;

  try {
    name =
      new Intl.DisplayNames(locale === "zh" ? ["zh-CN"] : ["en-US"], {
        type: "currency",
      }).of(code) ?? code;
  } catch {
    // No CLDR coverage: keep the code.
  }

  return `${name}(${CURRENCY_SYMBOLS[code]})`;
}

export interface FxSnapshot {
  as_of: string;
  /** Units of the currency per 1 USD (USD itself is always 1). */
  rates: Record<string, number>;
}

// Offline snapshot (docs/rewrite-plan.md §4 / §9): no external FX API, no new
// dependency. Deployers can override with TOKEN_USAGE_FX_RATES.
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

export function isSupportedCurrency(value: unknown): value is CurrencyCode {
  return (
    typeof value === "string" &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}

export function sanitizePreferences(
  input: Partial<Record<keyof FormatPreferences, unknown>>,
): FormatPreferences {
  const currency = isSupportedCurrency(input.currency)
    ? input.currency
    : DEFAULT_FORMAT_PREFERENCES.currency;
  const tokenDisplay =
    input.tokenDisplay === "full" || input.tokenDisplay === "compact"
      ? input.tokenDisplay
      : DEFAULT_FORMAT_PREFERENCES.tokenDisplay;
  const tokenUnit =
    input.tokenUnit === "wan" || input.tokenUnit === "kmb"
      ? input.tokenUnit
      : DEFAULT_FORMAT_PREFERENCES.tokenUnit;
  const tokenGrouping = input.tokenGrouping === 4 ? 4 : 3;

  return { currency, tokenDisplay, tokenUnit, tokenGrouping };
}

/** Merge a TOKEN_USAGE_FX_RATES JSON override over the built-in snapshot. */
export function parseFxSnapshot(
  raw: string | null | undefined,
): FxSnapshot | null {
  if (!raw?.trim()) return null;

  let parsed: unknown;

  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;
  const rawRates =
    record.rates && typeof record.rates === "object"
      ? (record.rates as Record<string, unknown>)
      : null;

  if (!rawRates) return null;

  const rates: Record<string, number> = { ...BUILT_IN_FX.rates, USD: 1 };

  for (const code of SUPPORTED_CURRENCIES) {
    const value = Number(rawRates[code]);

    if (Number.isFinite(value) && value > 0) rates[code] = value;
  }
  const asOf =
    typeof record.as_of === "string" && /^\d{4}-\d{2}-\d{2}$/.test(record.as_of)
      ? record.as_of
      : BUILT_IN_FX.as_of;

  return { as_of: asOf, rates };
}

function localeTag(locale: Locale): string {
  return intlLocaleFor(locale);
}

function numeric(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

function groupSeparator(locale: Locale): string {
  const parts = new Intl.NumberFormat(localeTag(locale), {
    useGrouping: true,
  }).formatToParts(12_345);

  return parts.find((part) => part.type === "group")?.value ?? ",";
}

/** Group an integer every 3 or 4 digits using the locale separator. */
export function groupDigits(
  value: number,
  locale: Locale,
  grouping: 3 | 4 = 3,
): string {
  const sign = value < 0 ? "-" : "";
  const digits = String(Math.trunc(Math.abs(value)));
  const groups: string[] = [];

  for (let end = digits.length; end > 0; end -= grouping) {
    groups.unshift(digits.slice(Math.max(0, end - grouping), end));
  }

  return `${sign}${groups.join(groupSeparator(locale))}`;
}

function scaledNumber(value: number, locale: Locale): string {
  return new Intl.NumberFormat(localeTag(locale), {
    maximumFractionDigits: 1,
    minimumFractionDigits: 0,
  }).format(value);
}

function compactKmb(value: number, locale: Locale): string {
  const abs = Math.abs(value);

  if (abs < 1_000) return groupDigits(value, locale, 3);

  const units: Array<{ size: number; suffix: string }> = [
    { size: 1e12, suffix: "T" },
    { size: 1e9, suffix: "B" },
    { size: 1e6, suffix: "M" },
    { size: 1e3, suffix: "K" },
  ];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];

    if (abs < unit.size) continue;
    let scaled = value / unit.size;
    let rounded = Math.round(scaled * 10) / 10;

    // 999.95K rounds to 1000.0K → promote to the next unit (1M).
    if (Math.abs(rounded) >= 1000 && index > 0) {
      const next = units[index - 1];

      scaled = value / next.size;
      rounded = Math.round(scaled * 10) / 10;

      return `${scaledNumber(rounded, locale)}${next.suffix}`;
    }

    return `${scaledNumber(rounded, locale)}${unit.suffix}`;
  }

  return groupDigits(value, locale, 3);
}

function compactWan(value: number, locale: Locale): string {
  const abs = Math.abs(value);

  if (abs < 1e4) return groupDigits(value, locale, 3);

  const units: Array<{ size: number; suffix: string }> = [
    { size: 1e12, suffix: "万亿" },
    { size: 1e8, suffix: "亿" },
    { size: 1e4, suffix: "万" },
  ];

  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];

    if (abs < unit.size) continue;
    let scaled = value / unit.size;
    let rounded = Math.round(scaled * 10) / 10;

    if (Math.abs(rounded) >= 1e4 && index > 0) {
      const next = units[index - 1];

      scaled = value / next.size;
      rounded = Math.round(scaled * 10) / 10;

      return `${scaledNumber(rounded, locale)}${next.suffix}`;
    }

    return `${scaledNumber(rounded, locale)}${unit.suffix}`;
  }

  return groupDigits(value, locale, 3);
}

/** Preference-aware token count. `null`/invalid render as an em dash. */
export function formatTokens(
  value: unknown,
  preferences: FormatPreferences,
  locale: Locale,
): string {
  const parsed = numeric(value);

  if (parsed == null) return "—";
  if (preferences.tokenDisplay === "full") {
    return groupDigits(parsed, locale, preferences.tokenGrouping);
  }

  return preferences.tokenUnit === "wan"
    ? compactWan(parsed, locale)
    : compactKmb(parsed, locale);
}

/**
 * Token count for detail surfaces (tables, tooltips, modals). Historically
 * always full digits; now follows the Token 显示 preference like everywhere
 * else — compact renders K/M/B or 万/亿, full keeps every digit grouped.
 */
export function formatTokensExact(
  value: unknown,
  preferences: FormatPreferences,
  locale: Locale,
): string {
  return formatTokens(value, preferences, locale);
}

export function formatNumber(
  value: unknown,
  locale: Locale,
  grouping: 3 | 4 = 3,
): string {
  const parsed = numeric(value);

  return parsed == null ? "—" : groupDigits(parsed, locale, grouping);
}

export function formatPercent(ratio: unknown, locale: Locale): string {
  const parsed = numeric(ratio);

  if (parsed == null) return "—";

  return new Intl.NumberFormat(localeTag(locale), {
    style: "percent",
    maximumFractionDigits: 1,
  }).format(parsed);
}

/** USD → display currency. Storage stays USD; only the presentation changes. */
export function convertCost(
  valueUsd: unknown,
  preferences: FormatPreferences,
  fx: FxSnapshot,
): number | null {
  const parsed = numeric(valueUsd);

  if (parsed == null) return null;
  const rate = fx.rates[preferences.currency] ?? 1;

  return parsed * rate;
}

export function formatCost(
  valueUsd: unknown,
  preferences: FormatPreferences,
  locale: Locale,
  fx: FxSnapshot = BUILT_IN_FX,
): string {
  const converted = convertCost(valueUsd, preferences, fx);

  if (converted == null) return "—";

  const formatter = new Intl.NumberFormat(localeTag(locale), {
    style: "currency",
    currency: preferences.currency,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const abs = Math.abs(converted);

  if (abs === 0) return formatter.format(0);
  if (abs < 0.01) {
    const tiny = formatter.format(0.01);

    return converted < 0 ? `-<${tiny}` : `<${tiny}`;
  }

  return formatter.format(converted);
}

export function formatFxRate(
  currency: string,
  fx: FxSnapshot,
  locale: Locale,
): string {
  const rate = fx.rates[currency] ?? 1;
  const formatted = new Intl.NumberFormat(localeTag(locale), {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4,
  }).format(rate);

  return `1 USD = ${formatted} ${currency}`;
}

export function formatDuration(valueMs: unknown, locale: Locale): string {
  const parsed = numeric(valueMs);

  if (parsed == null || parsed < 0) return "—";

  const totalSeconds = Math.floor(parsed / 1000);

  if (totalSeconds < 60) {
    return locale === "zh" ? `${totalSeconds} 秒` : `${totalSeconds}s`;
  }
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes < 60) {
    if (locale === "zh")
      return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;

    return seconds ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;

  if (hours < 24) {
    if (locale === "zh")
      return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;

    return restMinutes ? `${hours}h ${restMinutes}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;

  if (locale === "zh")
    return restHours ? `${days} 天 ${restHours} 小时` : `${days} 天`;

  return restHours ? `${days}d ${restHours}h` : `${days}d`;
}

export function formatDate(
  value: string | Date | null | undefined,
  locale: Locale,
  options: Intl.DateTimeFormatOptions = { dateStyle: "medium" },
): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat(localeTag(locale), options).format(date);
}

export function formatDateTime(
  value: string | Date | null | undefined,
  locale: Locale,
): string {
  return formatDate(value, locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/** Localized "3 minutes ago" for detail views (docs/ui-spec.md Sessions). */
export function formatRelativeTime(
  value: string | Date | null | undefined,
  locale: Locale,
  now: Date = new Date(),
): string {
  if (value == null || value === "") return "—";
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  const diffSeconds = Math.round((date.getTime() - now.getTime()) / 1000);
  const abs = Math.abs(diffSeconds);
  const formatter = new Intl.RelativeTimeFormat(localeTag(locale), {
    numeric: "auto",
  });

  if (abs < 60) return formatter.format(diffSeconds, "second");
  if (abs < 3600)
    return formatter.format(Math.round(diffSeconds / 60), "minute");
  if (abs < 86_400)
    return formatter.format(Math.round(diffSeconds / 3600), "hour");
  if (abs < 86_400 * 30)
    return formatter.format(Math.round(diffSeconds / 86_400), "day");
  if (abs < 86_400 * 365)
    return formatter.format(Math.round(diffSeconds / (86_400 * 30)), "month");

  return formatter.format(Math.round(diffSeconds / (86_400 * 365)), "year");
}

export function formatMonth(monthKey: string, locale: Locale): string {
  const date = new Date(`${monthKey}-01T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return monthKey;

  return new Intl.DateTimeFormat(localeTag(locale), {
    year: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}
