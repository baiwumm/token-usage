import { fromDate, parseDateTime, toZoned } from "@internationalized/date";

// Timezone + range math for the dashboard. Pure functions, unit-tested.
//
// The contract endpoints filter on ABSOLUTE timestamps (from/to ISO) and
// bucket days using the tz/tz_offset_minutes params, so "last 7 local days"
// needs the UTC instant of local midnight in the selected IANA zone. Zone
// conversion goes through @internationalized/date (already in the dependency
// budget for the HeroUI date pickers): its per-zone formatter cache and DST
// disambiguation replace the hand-rolled noon-anchor/offset tables, which
// were the classic fragile territory (nonexistent local midnights, the
// hour12 "24:00" quirk). Pure calendar arithmetic (addDays, the "all"
// sentinel) stays on plain UTC math — no zone knowledge involved.

export type RangePreset = "today" | "7d" | "30d" | "90d" | "all";

export type RangeKey = RangePreset | "custom";

/**
 * Range presets. The dashboard, Sessions and Sync runs render these four
 * directly in the shared preset-only `RangePresetToolbar` (2026-11-12); 90d
 * stays in the shared preset math (and `DateRangeFilter`) for any future
 * calendar-based page, but no bar lists it today (the dashboard dropped it on
 * 2026-11-01).
 */
export const RANGE_PRESETS = [
  "all",
  "today",
  "7d",
  "30d",
] as const satisfies readonly RangePreset[];

/** The four quick presets every filter bar shares. */
export type RangePresetChoice = (typeof RANGE_PRESETS)[number];

export const PRESET_DAYS: Record<
  Exclude<RangePreset, "all" | "today">,
  number
> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/**
 * Lower bound for the "all" preset. The contract endpoints clamp series
 * starts server-side (MAX_RANGE_DAYS), so a sentinel far in the past simply
 * yields everything the account has; day-key string compares stay correct.
 */
export const ALL_RANGE_START = "2000-01-01";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/** YYYY-MM-DD for the given instant in the target zone. */
export function dayKeyInTz(date: Date, timeZone: string): string {
  const zoned = fromDate(date, timeZone);

  return `${zoned.year}-${pad2(zoned.month)}-${pad2(zoned.day)}`;
}

/** Minutes EAST of UTC for the zone at the given instant (DST-aware). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  return fromDate(date, timeZone).offset / 60_000;
}

/**
 * UTC millisecond instant of local midnight (00:00) for a day key in the
 * zone. The library owns DST semantics: a midnight swallowed by a spring-
 * forward transition resolves with the standard "compatible" rule instead of
 * the previous noon-anchor + one-refinement guess, and an invalid zone id
 * throws (callers taking user input degrade around it).
 */
export function startOfDayUtcMs(dayKey: string, timeZone: string): number {
  return toZoned(parseDateTime(`${dayKey}T00:00`), timeZone)
    .toDate()
    .getTime();
}

/** Whether the string names a zone Intl can resolve (used to sanitize URL input). */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value });

    return true;
  } catch {
    return false;
  }
}

function addDays(dayKey: string, days: number): string {
  const utc = Date.parse(`${dayKey}T00:00:00Z`) + days * 86_400_000;

  return new Date(utc).toISOString().slice(0, 10);
}

export interface DashboardRange {
  /** Inclusive lower bound, ISO instant (local midnight of the first day). */
  fromIso: string;
  /** Exclusive upper bound, ISO instant (local midnight after the last day). */
  toIso: string;
  /** First and last local day keys (YYYY-MM-DD) of the window. */
  fromDay: string;
  toDay: string;
}

/**
 * Window for a filter-bar selection ending TODAY in the zone. `today` is the
 * single-day window; 7d = today + the six days before it; the `to` bound is
 * the exclusive local midnight after today. "all" reaches back to
 * ALL_RANGE_START (the server clamps the series).
 */
export function rangeForPreset(
  preset: RangePreset,
  timeZone: string,
  now: Date = new Date(),
): DashboardRange {
  const toDay = dayKeyInTz(now, timeZone);
  const fromDay =
    preset === "all"
      ? ALL_RANGE_START
      : preset === "today"
        ? toDay
        : addDays(toDay, -(PRESET_DAYS[preset] - 1));

  return {
    fromIso: new Date(startOfDayUtcMs(fromDay, timeZone)).toISOString(),
    toIso: new Date(startOfDayUtcMs(addDays(toDay, 1), timeZone)).toISOString(),
    fromDay,
    toDay,
  };
}

/** Validate a user-typed day key; returns null instead of throwing. */
export function isValidDayKey(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

/** Custom window from two day keys (from inclusive, to exclusive already?). */
export function rangeFromDayKeys(
  fromDay: string,
  toDayInclusive: string,
  timeZone: string,
): DashboardRange {
  const toDay = addDays(toDayInclusive, 1);

  return {
    fromIso: new Date(startOfDayUtcMs(fromDay, timeZone)).toISOString(),
    toIso: new Date(startOfDayUtcMs(toDay, timeZone)).toISOString(),
    fromDay,
    toDay: toDayInclusive,
  };
}

/** Calendar-year window (Jan 1 .. Dec 31 inclusive) in the zone. */
export function yearRange(year: number, timeZone: string): DashboardRange {
  return rangeFromDayKeys(`${year}-01-01`, `${year}-12-31`, timeZone);
}

/**
 * Window for a filter-bar selection. Custom ranges fall back to the 30-day
 * preset when either day key is invalid or the order is reversed (a
 * shouldn't-happen guard shared by dashboard / Sessions / Sync runs; the
 * dashboard's own default preset lives in its `parseFilters`).
 */
export function rangeForSelection(
  key: RangeKey,
  timeZone: string,
  customFrom?: string | null,
  customTo?: string | null,
  now: Date = new Date(),
): DashboardRange {
  if (
    key === "custom" &&
    isValidDayKey(customFrom) &&
    isValidDayKey(customTo) &&
    customFrom <= customTo
  ) {
    return rangeFromDayKeys(customFrom, customTo, timeZone);
  }

  return rangeForPreset(key === "custom" ? "30d" : key, timeZone, now);
}

/** Curated tz picker entries; the browser zone rides along by default. */
export const TIMEZONE_OPTIONS = [
  "UTC",
  "Asia/Shanghai",
  "Asia/Hong_Kong",
  "Asia/Taipei",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
  "America/Los_Angeles",
] as const;

/** "UTC+08:00" style label for a IANA zone (heatmap footer). */
export function tzLabel(timeZone: string): string {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    }).formatToParts(new Date());
    const name = parts.find((part) => part.type === "timeZoneName")?.value;

    return name && name !== "GMT" ? name.replace("GMT", "UTC") : "UTC+00:00";
  } catch {
    return "UTC";
  }
}

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
