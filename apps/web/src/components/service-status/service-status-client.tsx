"use client";

// Service status at /service-status: probe this instance's contract
// endpoints (public + session-authenticated) and show latency. The CLI API
// keeps its own auth semantics — the guard never touches it, and neither do
// these probes go anywhere near Supabase directly.

import { ArrowsRotateRight } from "@gravity-ui/icons";
import { Button, Spinner, Typography } from "@heroui/react";
import { useCallback, useEffect, useState } from "react";

import { ChecksTable } from "./checks-table";
import { FactsCard } from "./facts-card";
import {
  initialResults,
  LATENCY_SLOW_MS,
  nowMs,
  type CheckResult,
} from "./checks";

import { authBrowserClient } from "@/lib/auth/browser";
import { STATUS_COPY, type StatusCheckName } from "@/lib/copy/service-status";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone } from "@/lib/dashboard/ranges";
import {
  fetchAccountDevices,
  fetchDashboard,
  fetchPublicConfig,
} from "@/lib/dashboard/api";

export function ServiceStatusClient() {
  const [locale] = useLocale();
  const copy = STATUS_COPY[locale];
  const [running, setRunning] = useState(true);
  // Seeded with every probe as "checking": a re-run repaints in place instead
  // of collapsing the table to a single row and refilling it.
  const [results, setResults] = useState<CheckResult[]>(initialResults);
  const [projectUrl, setProjectUrl] = useState<string | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setRunning(true);
    setProjectUrl(null);
    setDashboardUrl(null);
    setResults(initialResults());

    const settle = (name: StatusCheckName, patch: Partial<CheckResult>) => {
      setResults((previous) =>
        previous.map((row) => (row.name === name ? { ...row, ...patch } : row)),
      );
    };

    async function probe(
      name: StatusCheckName,
      run: () => Promise<CheckResult["detail"]>,
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

    // 1. public-config — the unauthenticated CLI bootstrap endpoint.
    await probe("public-config", async () => {
      const payload = await fetchPublicConfig();

      setProjectUrl(payload.supabase_url ?? null);
      setDashboardUrl(payload.dashboard_url ?? null);

      return undefined;
    });

    // 2. session-authenticated reads: the app's dashboard + settings paths.
    const supabase = authBrowserClient();
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

    if (!session?.access_token) {
      settle("session", { status: "fail", detail: { kind: "no-session" } });
      settle("dashboard", { status: "fail", detail: { kind: "no-session" } });
      settle("account-devices", {
        status: "fail",
        detail: { kind: "no-session" },
      });
      setRunning(false);

      return;
    }

    settle("session", { status: "ok" });

    await probe("dashboard", async () => {
      const payload = await fetchDashboard(session.access_token, {
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
      const payload = await fetchAccountDevices(session.access_token, {
        from,
        to,
      });

      return { kind: "devices", value: payload.devices?.length ?? 0 };
    });

    setRunning(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const sessionState =
    results.find((result) => result.name === "session")?.status ?? "checking";

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Typography color="muted" type="body-sm">
          {copy.pageSubtitle}
        </Typography>
        <Button
          isPending={running}
          size="sm"
          variant="outline"
          onPress={() => void runChecks()}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <ArrowsRotateRight aria-hidden="true" className="size-4" />
              )}
              {copy.retry}
            </>
          )}
        </Button>
      </header>

      <FactsCard
        copy={copy}
        dashboardUrl={dashboardUrl}
        projectUrl={projectUrl}
        sessionState={sessionState}
      />

      <ChecksTable copy={copy} results={results} />

      <Typography color="muted" type="body-xs">
        {formatMessage(copy.latencyHint, locale, { ms: LATENCY_SLOW_MS })}
      </Typography>
    </main>
  );
}
