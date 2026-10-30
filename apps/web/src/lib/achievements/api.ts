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
