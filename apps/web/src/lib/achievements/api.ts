// Browser client for GET /api/app/achievements — cookie-authenticated, same
// shape as the sync-runs client in lib/dashboard/api.ts (no bearer header;
// same-origin cookies ride along). 401 means the page must send the browser
// to the login flow.

import type { AchievementsPayload } from "./types";

export class AchievementsApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AchievementsApiError";
    this.status = status;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof AchievementsApiError && error.status === 401;
}

export type FetchAchievementsParams = {
  tz?: string | null;
  offsetMinutes?: number | null;
  signal?: AbortSignal;
};

export async function fetchAchievements({
  tz = null,
  offsetMinutes = null,
  signal,
}: FetchAchievementsParams = {}): Promise<AchievementsPayload> {
  const query = new URLSearchParams();

  if (tz) query.set("tz", tz);
  if (offsetMinutes != null && Number.isFinite(offsetMinutes)) {
    query.set("tz_offset_minutes", String(Math.trunc(offsetMinutes)));
  }
  const search = query.toString();
  const response = await fetch(
    `/api/app/achievements${search ? `?${search}` : ""}`,
    signal ? { signal } : undefined,
  );

  if (response.status === 401) {
    throw new AchievementsApiError("unauthorized", 401);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw new AchievementsApiError(
      payload.error || `HTTP ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as AchievementsPayload;
}

/**
 * Record how far the account has seen the achievements. Best effort: the
 * marker is decoration, so a failed write (or a deployment where the
 * migration has not run yet) resolves to null and the caller moves on.
 */
export async function markAchievementsSeen(
  day: string,
): Promise<string | null> {
  try {
    const response = await fetch("/api/app/achievements", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ seen_through: day }),
    });

    if (!response.ok) return null;
    const payload = (await response.json()) as { seen_through?: unknown };

    // The shared payload carries the old seen-water mark; drop the cache so
    // the next read reflects the write.
    invalidateAchievementsShared();

    return typeof payload.seen_through === "string"
      ? payload.seen_through
      : day;
  } catch {
    return null;
  }
}

// Concurrent callers on one screen (the unlock watcher and the dashboard
// strip) must not run the whole-history compute twice. The watcher starts
// 1.2s after mount, by which time the dashboard request has usually settled —
// an in-flight-only dedupe therefore missed it entirely (docs/ui-spec.md
// § achievements: "share the same in-flight request"). A short settled-promise
// TTL closes that gap without keeping unlock/seen state stale for long.
const SHARED_TTL_MS = 15_000;
const inFlight = new Map<string, Promise<AchievementsPayload>>();
const settled = new Map<string, { at: number; payload: AchievementsPayload }>();

/** Forget cached payloads after a seen-water mark write or a forced refresh. */
export function invalidateAchievementsShared(): void {
  settled.clear();
}

export function fetchAchievementsShared({
  tz = null,
  offsetMinutes = null,
}: Pick<
  FetchAchievementsParams,
  "tz" | "offsetMinutes"
> = {}): Promise<AchievementsPayload> {
  const key = `${tz ?? ""}|${offsetMinutes ?? ""}`;
  const existing = inFlight.get(key);

  if (existing) return existing;

  const recent = settled.get(key);

  if (recent && Date.now() - recent.at < SHARED_TTL_MS) {
    return Promise.resolve(recent.payload);
  }
  settled.delete(key);

  const request: Promise<AchievementsPayload> = fetchAchievements({
    tz,
    offsetMinutes,
  }).then(
    (payload) => {
      settled.set(key, { at: Date.now(), payload });

      return payload;
    },
    (error: unknown) => {
      settled.delete(key);
      throw error;
    },
  );

  inFlight.set(key, request);
  // Both handlers are supplied so a failed request never leaves an
  // unhandled rejection behind from the cleanup chain.
  void request.then(
    () => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    },
    () => {
      if (inFlight.get(key) === request) inFlight.delete(key);
    },
  );

  return request;
}
