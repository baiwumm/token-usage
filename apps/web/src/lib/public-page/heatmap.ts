// Pure full-history heatmap projections for /u/<token>
// (docs/badge.md §4.7 / §6.4, docs/ui-spec.md 公开页节).
//
// No IO and no clock reads: the loader owns both. Daily totals come from the
// same canonicalRows / zonedDayKey path as the badge aggregate, so the page
// can never disagree with the SVG on the total it is explaining.

import type {
  PublicDayPoint,
  PublicMonthPoint,
  PublicYearSection,
} from "./types";

/** ~10 years. Older days are summarized by year→month instead of dropped. */
export const MAX_PUBLIC_DAYS = 3650;
const DAY_MS = 86_400_000;
const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeDayTotals(
  input: Iterable<readonly [string, number]>,
): PublicDayPoint[] {
  const byDay = new Map<string, number>();

  for (const [day, raw] of input) {
    if (!DAY_KEY_RE.test(day) || !Number.isFinite(raw) || raw <= 0) continue;
    byDay.set(day, (byDay.get(day) ?? 0) + raw);
  }

  return [...byDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, total]) => ({ day, total }));
}

/**
 * The wire payload is bounded: keep the most recent window as daily cells and
 * hand the older span back as monthly totals (§4.7 10-year ceiling).
 */
export function capDayPoints(days: PublicDayPoint[]): {
  recent: PublicDayPoint[];
  earlier: PublicDayPoint[];
} {
  if (days.length <= MAX_PUBLIC_DAYS) {
    return { recent: days, earlier: [] };
  }

  return {
    recent: days.slice(-MAX_PUBLIC_DAYS),
    earlier: days.slice(0, -MAX_PUBLIC_DAYS),
  };
}

/** Zero-fill holes so the week grid has a cell for every calendar day. */
export function fillZeroDays(days: PublicDayPoint[]): PublicDayPoint[] {
  if (days.length === 0) return [];

  const byDay = new Map(days.map((point) => [point.day, point.total]));
  const start = Date.parse(`${days[0].day}T00:00:00Z`);
  const end = Date.parse(`${days[days.length - 1].day}T00:00:00Z`);

  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return days;
  }

  const out: PublicDayPoint[] = [];

  for (
    let ms = start;
    ms <= end && out.length < MAX_PUBLIC_DAYS;
    ms += DAY_MS
  ) {
    const day = new Date(ms).toISOString().slice(0, 10);

    out.push({ day, total: byDay.get(day) ?? 0 });
  }

  return out;
}

/** Newest year first. Each year carries its own 12 monthly totals. */
export function splitYears(days: PublicDayPoint[]): PublicYearSection[] {
  const byYear = new Map<number, PublicDayPoint[]>();

  for (const point of days) {
    const year = Number(point.day.slice(0, 4));

    if (!Number.isInteger(year)) continue;
    const group = byYear.get(year) ?? [];

    group.push(point);
    byYear.set(year, group);
  }

  return [...byYear.entries()]
    .sort(([a], [b]) => b - a)
    .map(([year, yearDays]) => ({
      year,
      days: yearDays,
      months: monthsForYear(year, yearDays),
    }));
}

function monthsForYear(
  year: number,
  days: PublicDayPoint[],
): PublicMonthPoint[] {
  const totals = new Array<number>(12).fill(0);

  for (const point of days) {
    const index = Number(point.day.slice(5, 7)) - 1;

    if (index >= 0 && index < 12) totals[index] += point.total;
  }

  return totals.map((total, index) => ({
    month: `${year}-${String(index + 1).padStart(2, "0")}`,
    total,
  }));
}

/** p50 / p75 / p90 / p95 of positive days, shared by every year section. */
export function quantileStops(
  days: PublicDayPoint[],
): [number, number, number, number] {
  const positives = days
    .map((point) => point.total)
    .filter((value) => value > 0)
    .sort((a, b) => a - b);

  if (positives.length === 0) return [0, 0, 0, 0];

  const at = (q: number): number =>
    positives[
      Math.min(positives.length - 1, Math.ceil(q * positives.length) - 1)
    ];

  return [at(0.5), at(0.75), at(0.9), at(0.95)];
}

/** 0 = no activity, 1..4 = increasing intensity. */
export function levelFor(
  total: number,
  stops: readonly [number, number, number, number],
): number {
  if (total <= 0) return 0;
  if (total <= stops[0]) return 1;
  if (total <= stops[1]) return 2;
  if (total <= stops[2]) return 3;

  return 4;
}

/** Full-history facts shown as two chips under the metrics strip (§6.2 L2). */
export function longestStreakDays(days: PublicDayPoint[]): number {
  let best = 0;
  let current = 0;
  let previous: string | null = null;

  for (const point of days) {
    const adjacent =
      previous !== null &&
      Date.parse(`${point.day}T00:00:00Z`) -
        Date.parse(`${previous}T00:00:00Z`) ===
        DAY_MS;

    current = point.total > 0 ? (adjacent ? current + 1 : 1) : 0;
    best = Math.max(best, current);
    previous = point.day;
  }

  return best;
}

export function peakDay(
  days: PublicDayPoint[],
): { day: string; tokens: number } | null {
  let peak: { day: string; tokens: number } | null = null;

  for (const point of days) {
    if (!peak || point.total > peak.tokens) {
      peak = { day: point.day, tokens: point.total };
    }
  }

  return peak && peak.tokens > 0 ? peak : null;
}
