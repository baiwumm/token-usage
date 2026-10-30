"use client";

// Data hook for /achievements: resolves the session, fetches the read-time
// payload once and on demand, and keeps a failed refresh from wiping the grid
// (the seen watermark travels inside the payload).

import type { AchievementsPayload } from "@/lib/achievements/types";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAchievements, isUnauthorized } from "@/lib/achievements/api";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { browserTimezone } from "@/lib/dashboard/ranges";
import { loadable, type Loadable } from "@/lib/loadable";

/** Outcome of one load, so a manual refresh can report success or failure. */
export type RefreshOutcome =
  | { status: "ok" }
  | { status: "error"; message: string | null }
  | { status: "unauthorized" }
  | { status: "skipped" };

export function useAchievements(): {
  state: Loadable<AchievementsPayload>;
  error: string | null;
  refreshing: boolean;
  lastUpdatedAt: number | null;
  refresh: () => Promise<RefreshOutcome>;
} {
  const { accessToken, redirectToLogin } = useSessionBootstrap("/achievements");
  const [state, setState] = useState<Loadable<AchievementsPayload>>(loadable);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  // The day boundaries (tier achieved_at) are cut in the viewer's zone; the
  // server falls back to UTC when the zone is unknown.
  const timezone = browserTimezone();

  // Cookie-authenticated (same origin): the access token only gates the call,
  // it is not sent as a header.
  const load = useCallback(async (): Promise<RefreshOutcome> => {
    const id = requestId.current + 1;

    requestId.current = id;
    setRefreshing(true);
    setError(null);
    setState((previous) =>
      previous.data == null ? { status: "loading", data: null } : previous,
    );

    try {
      const payload = await fetchAchievements({ tz: timezone });

      if (requestId.current !== id) return { status: "skipped" };
      setState({ status: "ready", data: payload });
      setLastUpdatedAt(Date.now());

      return { status: "ok" };
    } catch (cause) {
      if (requestId.current !== id) return { status: "skipped" };
      if (isUnauthorized(cause)) {
        redirectToLogin();

        return { status: "unauthorized" };
      }
      const message = cause instanceof Error ? cause.message : null;

      setError(message ?? "error");
      setState((previous) => ({ status: "error", data: previous.data }));

      return { status: "error", message };
    } finally {
      if (requestId.current === id) setRefreshing(false);
    }
  }, [redirectToLogin, timezone]);

  useEffect(() => {
    if (!accessToken) return;
    void load();
  }, [accessToken, load]);

  const refresh = useCallback(async (): Promise<RefreshOutcome> => {
    if (!accessToken) return { status: "skipped" };

    return load();
  }, [accessToken, load]);

  return { state, error, refreshing, lastUpdatedAt, refresh };
}
