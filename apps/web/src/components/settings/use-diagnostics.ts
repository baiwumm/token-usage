"use client";

// Probe runner behind the Settings 实例诊断 card: four checks over this
// instance's contract endpoints (public config without a session, session-
// gated reads with the page's bootstrap token). Each run owns an id so a
// re-run — or an unmount while probes are in flight — can never let an older
// round overwrite the newest rows. Relocated from the former /service-status
// page (2026-11-07 信息架构调整); the session row reflects the page bootstrap
// instead of an independent getSession probe.

import type { DiagnosticsCheckName } from "@/lib/copy/diagnostics";

import { useCallback, useEffect, useRef, useState } from "react";

import {
  initialResults,
  nowMs,
  type CheckDetail,
  type CheckResult,
} from "./diagnostics";

import { browserTimezone } from "@/lib/dashboard/ranges";
import {
  fetchAccountDevices,
  fetchDashboard,
  fetchPublicConfig,
} from "@/lib/dashboard/api";

export function useDiagnostics(accessToken: string | null): {
  running: boolean;
  results: CheckResult[];
  projectUrl: string | null;
  dashboardUrl: string | null;
  rerun: () => void;
} {
  const [running, setRunning] = useState(false);
  // Seeded with every probe as "checking": a re-run repaints in place instead
  // of collapsing the table to a single row and refilling it.
  const [results, setResults] = useState<CheckResult[]>(initialResults);
  const [projectUrl, setProjectUrl] = useState<string | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);
  const runIdRef = useRef(0);
  const cancelledRef = useRef(false);

  const runChecks = useCallback(async () => {
    const runId = ++runIdRef.current;
    const isCurrent = () => runIdRef.current === runId && !cancelledRef.current;

    const settle = (
      name: DiagnosticsCheckName,
      patch: Partial<CheckResult>,
    ) => {
      if (!isCurrent()) return;
      setResults((previous) =>
        previous.map((row) => (row.name === name ? { ...row, ...patch } : row)),
      );
    };

    async function probe(
      name: DiagnosticsCheckName,
      run: () => Promise<CheckDetail | undefined>,
    ) {
      const started = nowMs();

      try {
        const detail = await run();

        settle(name, {
          status: "ok",
          latencyMs: Math.round(nowMs() - started),
          detail,
        });
      } catch (error) {
        settle(name, {
          status: "fail",
          latencyMs: Math.round(nowMs() - started),
          detail: {
            kind: "raw",
            text: error instanceof Error ? error.message : String(error),
          },
        });
      }
    }

    setRunning(true);
    setResults((previous) =>
      previous.map((row) => ({
        ...row,
        status: "checking",
        latencyMs: null,
        detail: undefined,
      })),
    );

    // 1. public-config — the unauthenticated CLI bootstrap endpoint; also the
    //    source of the two instance facts above the table.
    await probe("public-config", async () => {
      const payload = await fetchPublicConfig();

      if (isCurrent()) {
        setProjectUrl(payload.supabase_url ?? null);
        setDashboardUrl(payload.dashboard_url ?? null);
      }

      return undefined;
    });

    // 2. session-gated reads. While the page bootstrap is still resolving
    //    (token null) the rows stay "checking"; the token's arrival re-runs.
    if (!accessToken) {
      if (isCurrent()) setRunning(false);

      return;
    }

    settle("session", { status: "ok" });

    await probe("dashboard", async () => {
      const payload = await fetchDashboard(accessToken, {
        fromIso: new Date(Date.now() - 7 * 86_400_000).toISOString(),
        toIso: new Date(Date.now() + 86_400_000).toISOString(),
        tz: browserTimezone(),
      });

      return { kind: "tokens", value: payload.totals?.total_tokens ?? 0 };
    });

    await probe("account-devices", async () => {
      const to = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 30 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const payload = await fetchAccountDevices(accessToken, {
        from,
        to,
      });

      return { kind: "devices", value: payload.devices?.length ?? 0 };
    });

    if (isCurrent()) setRunning(false);
  }, [accessToken]);

  useEffect(() => {
    cancelledRef.current = false;
    void runChecks();

    return () => {
      cancelledRef.current = true;
    };
  }, [runChecks]);

  return {
    running,
    results,
    projectUrl,
    dashboardUrl,
    rerun: () => {
      void runChecks();
    },
  };
}
