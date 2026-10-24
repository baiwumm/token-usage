// Timezone + range math for the dashboard. Pure functions, unit-tested.
//
// The contract endpoints filter on ABSOLUTE timestamps (from/to ISO) and
// bucket days using the tz/tz_offset_minutes params, so "last 7 local days"
// needs the UTC instant of local midnight in the selected IANA zone. Intl is
// the only tz source (date-fns alone cannot convert zones; date-fns-tz is not
// in the dependency budget).

export type RangePreset = "7d" | "30d" | "90d" | "12m";

export const RANGE_PRESETS: RangePreset[] = ["7d", "30d", "90d", "12m"];

export const PRESET_DAYS: Record<RangePreset, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  "12m": 365,
};

/** YYYY-MM-DD for the given instant in the target zone. */
export function dayKeyInTz(date: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Minutes EAST of UTC for the zone at the given instant (DST-aware). */
export function tzOffsetMinutes(date: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);
  const get = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );

  return Math.round((asUtc - date.getTime()) / 60_000);
}

/**
 * UTC millisecond instant of local midnight (00:00) for a day key in the
 * zone. Noon-anchored first guess keeps the offset lookup clear of DST
 * boundaries; one refinement pass handles the residual.
 */
export function startOfDayUtcMs(dayKey: string, timeZone: string): number {
  const noon = Date.parse(`${dayKey}T12:00:00Z`);
  const guess = tzOffsetMinutes(new Date(noon), timeZone);
  const instant = Date.parse(`${dayKey}T00:00:00Z`) - guess * 60_000;
  const refined = tzOffsetMinutes(new Date(instant), timeZone);

  return Date.parse(`${dayKey}T00:00:00Z`) - refined * 60_000;
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
 * Window for a preset ending TODAY in the zone. 7d = today + the six days
 * before it; the `to` bound is the exclusive local midnight after today.
 */
export function rangeForPreset(
  preset: RangePreset,
  timeZone: string,
  now: Date = new Date(),
): DashboardRange {
  const days = PRESET_DAYS[preset];
  const toDay = dayKeyInTz(now, timeZone);
  const fromDay = addDays(toDay, -(days - 1));

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

export function browserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}
