"use client";

// Data hook for /achievements: resolves the session, fetches the read-time
// payload once and on demand, keeps a failed refresh from wiping the grid, and
// hands the signed-in user id to the page (the new-badge marker is per user).

import type { AchievementsPayload } from "@/lib/achievements/types";

import { useCallback, useEffect, useRef, useState } from "react";

import { fetchAchievements, isUnauthorized } from "@/lib/achievements/api";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { browserTimezone } from "@/lib/dashboard/ranges";
import { loadable, type Loadable } from "@/lib/loadable";

export function useAchievements(): {
  state: Loadable<AchievementsPayload>;
  error: string | null;
  refreshing: boolean;
  lastUpdatedAt: number | null;
  userId: string | null;
  refresh: () => void;
} {
  const { accessToken, redirectToLogin, userId } =
    useSessionBootstrap("/achievements");
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
  const load = useCallback(async () => {
    const id = requestId.current + 1;

    requestId.current = id;
    setRefreshing(true);
    setError(null);
    setState((previous) =>
      previous.data == null ? { status: "loading", data: null } : previous,
    );

    try {
      const payload = await fetchAchievements({ tz: timezone });

      if (requestId.current !== id) return;
      setState({ status: "ready", data: payload });
      setLastUpdatedAt(Date.now());
    } catch (cause) {
      if (requestId.current !== id) return;
      if (isUnauthorized(cause)) {
        redirectToLogin();

        return;
      }
      setError(cause instanceof Error ? cause.message : "error");
      setState((previous) => ({ status: "error", data: previous.data }));
    } finally {
      if (requestId.current === id) setRefreshing(false);
    }
  }, [redirectToLogin, timezone]);

  useEffect(() => {
    if (!accessToken) return;
    void load();
  }, [accessToken, load]);

  const refresh = useCallback(() => {
    if (accessToken) void load();
  }, [accessToken, load]);

  return { state, error, refreshing, lastUpdatedAt, userId, refresh };
}
