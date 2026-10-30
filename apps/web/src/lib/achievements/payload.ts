// Server-side assembly for GET /api/app/achievements: load the account
// snapshot, sessions and sync runs for one user, then run the pure compute.
//
// The session/sync window starts at a fixed instant so the cached window key
// only changes once a day (loadSessionRows / loadSyncRunRows are keyed by the
// exact window). Sessions before 2000-01-01 are not real data for this app.
//
// Auth stays in the route handler; this module takes the resolved user id so
// it is testable against the fake Supabase backend without browser cookies.

import { computeAchievements } from "./compute";
import { loadAchievementSeen } from "./seen";

import { parseTzContext } from "@/lib/account/series";
import {
  loadAccountUsage,
  loadSessionRows,
  loadSyncRunRows,
} from "@/lib/api/account-data";
import { jsonResponse } from "@/lib/api/http";

const HISTORY_START = "2000-01-01T00:00:00.000Z";
const DAY_MS = 86_400_000;

/** [fixed history start, next UTC midnight) — stable within a UTC day. */
function sessionWindow(now: Date): { from: string; to: string } {
  const dayStart = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return { from: HISTORY_START, to: new Date(dayStart + DAY_MS).toISOString() };
}

export async function achievementsPayloadForUser(
  userId: string,
  searchParams: URLSearchParams,
  now: Date = new Date(),
): Promise<Response> {
  const tzContext = parseTzContext(searchParams);
  const { from, to } = sessionWindow(now);
  const [usage, sessions, syncRuns, seenThrough] = await Promise.all([
    loadAccountUsage(userId),
    loadSessionRows(userId, from, to),
    loadSyncRunRows(userId, from, to),
    loadAchievementSeen(userId),
  ]);

  return jsonResponse(200, {
    ...computeAchievements({
      hourly: usage.hourly,
      sessionStates: usage.sessionStates,
      sessions: sessions.sessions,
      syncRuns: syncRuns.runs,
      devices: usage.deviceRows,
      tzContext,
      now,
    }),
    seen_through: seenThrough,
  });
}
