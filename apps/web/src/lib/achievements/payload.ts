// Server-side assembly for GET /api/app/achievements: load the account
// snapshot, sessions and sync runs for one user, then run the pure compute.
//
// The session/sync window starts at a fixed instant so the cached window key
// only changes once a day (loadSessionRows / loadSyncRunRows are keyed by the
// exact window). Sessions before 2000-01-01 are not real data for this app.
//
// Auth stays in the route handler; this module takes the resolved user id so
// it is testable against the fake Supabase backend without browser cookies.

import type { AchievementsSnapshot } from "./types";

import { computeAchievements } from "./compute";
import { loadAchievementSeen } from "./seen";

import { parseTzContext, type TzContext } from "@/lib/account/series";
import {
  loadAccountUsage,
  loadSessionRows,
  loadSyncRunRows,
} from "@/lib/api/account-data";
import { jsonResponse } from "@/lib/api/http";

const HISTORY_START = "2000-01-01T00:00:00.000Z";
const DAY_MS = 86_400_000;

// Computing 18 achievements walks the whole account history plus two full
// tables. Several surfaces ask for it within seconds of each other (dashboard
// strip, unlock watcher, /achievements, public page). A short per-user /
// per-zone cache keeps one compute per burst. The seen watermark is never
// cached — it is read fresh on every request and can change via POST.
const SNAPSHOT_TTL_MS = 30_000;

type SnapshotEntry = {
  at: number;
  snapshot?: AchievementsSnapshot;
  inFlight?: Promise<AchievementsSnapshot>;
};
const snapshotCache = new Map<string, SnapshotEntry>();

function cachedSnapshot(
  key: string,
  load: () => Promise<AchievementsSnapshot>,
): Promise<AchievementsSnapshot> {
  const existing = snapshotCache.get(key);
  const now = Date.now();

  if (existing?.inFlight) return existing.inFlight;
  if (existing?.snapshot && now - existing.at < SNAPSHOT_TTL_MS) {
    return Promise.resolve(existing.snapshot);
  }

  const inFlight = load().then(
    (snapshot) => {
      snapshotCache.set(key, { at: Date.now(), snapshot });

      return snapshot;
    },
    (error: unknown) => {
      snapshotCache.delete(key);
      throw error;
    },
  );

  snapshotCache.set(key, { at: now, inFlight });

  return inFlight;
}

/** [fixed history start, next UTC midnight) — stable within a UTC day. */
function sessionWindow(now: Date): { from: string; to: string } {
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return { from: HISTORY_START, to: new Date(dayStart + DAY_MS).toISOString() };
}

/**
 * IO + pure compute, without the HTTP envelope or the seen watermark
 * (docs/badge.md §4.7). The public page reuses this so achievements are
 * computed exactly once, with the same history window as /api/app/achievements.
 */
export async function loadAchievementsSnapshot(
  userId: string,
  tzContext: Partial<TzContext>,
  now: Date = new Date(),
): Promise<AchievementsSnapshot> {
  const { from, to } = sessionWindow(now);
  const [usage, sessions, syncRuns] = await Promise.all([
    loadAccountUsage(userId),
    loadSessionRows(userId, from, to),
    loadSyncRunRows(userId, from, to),
  ]);

  return computeAchievements({
    hourly: usage.hourly,
    sessionStates: usage.sessionStates,
    sessions: sessions.sessions,
    syncRuns: syncRuns.runs,
    devices: usage.deviceRows,
    tzContext,
    now,
  });
}

export async function achievementsPayloadForUser(
  userId: string,
  searchParams: URLSearchParams,
  now: Date = new Date(),
): Promise<Response> {
  const tzContext = parseTzContext(searchParams);
  // Include the UTC day: streak/active-day achievements depend on `now`.
  const cacheKey = `${userId}|${searchParams.toString()}|${now
    .toISOString()
    .slice(0, 10)}`;
  const [snapshot, seenThrough] = await Promise.all([
    cachedSnapshot(cacheKey, () =>
      loadAchievementsSnapshot(userId, tzContext, now),
    ),
    loadAchievementSeen(userId),
  ]);

  return jsonResponse(200, { ...snapshot, seen_through: seenThrough });
}
