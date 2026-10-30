// Pure projections over the achievements payload: which unlocks are still
// "new" for this account, which ones landed most recently (dashboard strip),
// and which are closest to their next tier. Client-safe (no server imports).

import type { AchievementProgress } from "./types";

import { progressRatioForNext, TIERS } from "./catalog";

type DatedRow = { row: AchievementProgress; day: string };

/** Latest tier day across the five dates (ISO days sort lexicographically). */
export function latestAchievedDay(
  achieved: Record<string, string | null>,
): string | null {
  let latest: string | null = null;

  for (const day of Object.values(achieved)) {
    if (day && (latest === null || day > latest)) latest = day;
  }

  return latest;
}

/** Latest unlock across every achievement, or null when nothing is unlocked. */
export function maxAchievedDay(
  rows: readonly AchievementProgress[],
): string | null {
  let latest: string | null = null;

  for (const row of rows) {
    const day = latestAchievedDay(row.achieved_at);

    if (day && (latest === null || day > latest)) latest = day;
  }

  return latest;
}

function dated(rows: readonly AchievementProgress[]): DatedRow[] {
  const result: DatedRow[] = [];

  for (const row of rows) {
    const day = latestAchievedDay(row.achieved_at);

    if (day !== null) result.push({ row, day });
  }

  // Sort is stable, so equal days keep catalog order.
  return result.sort((a, b) => b.day.localeCompare(a.day));
}

/** Unlocked rows, newest unlock first. */
export function recentUnlocks(
  rows: readonly AchievementProgress[],
  limit: number,
): AchievementProgress[] {
  return dated(rows)
    .slice(0, limit)
    .map((entry) => entry.row);
}

/**
 * Rows with an unlock after the seen watermark, newest first. A null watermark
 * is the first visit: nothing is "new" (the caller records a baseline instead
 * of surfacing the whole back catalogue).
 */
export function unlocksSince(
  rows: readonly AchievementProgress[],
  seenThrough: string | null,
): AchievementProgress[] {
  if (seenThrough === null) return [];

  return dated(rows)
    .filter((entry) => entry.day > seenThrough)
    .map((entry) => entry.row);
}

/**
 * Rows closest to their next tier, by share of that tier's threshold. Locked
 * rows with no progress are skipped — a fresh account has nothing to show.
 */
export function nearestUnlocks(
  rows: readonly AchievementProgress[],
  limit: number,
): AchievementProgress[] {
  return rows
    .filter(
      (row) =>
        row.tier < TIERS.length && row.next_threshold !== null && row.value > 0,
    )
    .sort((a, b) => {
      const difference =
        progressRatioForNext(b.value, b.next_threshold) -
        progressRatioForNext(a.value, a.next_threshold);

      return difference !== 0 ? difference : a.id.localeCompare(b.id);
    })
    .slice(0, limit);
}

export function countUnlocked(rows: readonly AchievementProgress[]): number {
  return rows.filter((row) => latestAchievedDay(row.achieved_at) !== null)
    .length;
}

/** `YYYY-MM-DD` that also names a real calendar day. */
export function isDayKey(value: unknown): value is string {
  if (typeof value !== "string") return false;

  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}
