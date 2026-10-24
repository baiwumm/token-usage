"use client";

// Service status at /service-status: probe this instance's contract
// endpoints (public + session-authenticated) and show latency. The CLI API
// keeps its own auth semantics — the guard never touches it, and neither do
// these probes go anywhere near Supabase directly.

import { Button, Card, Chip, Table, Typography } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { STATUS_COPY } from "@/lib/copy/status";
import { useLocale } from "@/lib/copy/locale";
import { browserTimezone } from "@/lib/dashboard/ranges";

interface CheckResult {
  name: string;
  target: string;
  status: "ok" | "fail" | "checking";
  latencyMs: number | null;
  detail?: string;
}

const LATENCY_GOOD_MS = 1500;

function nowMs(): number {
  return performance.now();
}

export function StatusClient() {
  const [locale] = useLocale();
  const copy = STATUS_COPY[locale];
  const [running, setRunning] = useState(true);
  const [results, setResults] = useState<CheckResult[]>([]);
  const [projectUrl, setProjectUrl] = useState<string | null>(null);
  const [dashboardUrl, setDashboardUrl] = useState<string | null>(null);

  const runChecks = useCallback(async () => {
    setRunning(true);
    const checks: CheckResult[] = [];

    async function probe(
      name: string,
      target: string,
      run: () => Promise<string | null>,
    ) {
      const started = nowMs();

      try {
        const detail = await run();

        checks.push({
          name,
          target,
          status: "ok",
          latencyMs: Math.round(nowMs() - started),
          detail: detail ?? undefined,
        });
      } catch (error) {
        checks.push({
          name,
          target,
          status: "fail",
          latencyMs: Math.round(nowMs() - started),
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      setResults([...checks]);
    }

    // 1. public-config — the unauthenticated CLI bootstrap endpoint.
    await probe(
      "public-config",
      "/api/functions/token-usage-public-config",
      async () => {
        const response = await fetch(
          "/api/functions/token-usage-public-config",
        );

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const payload = (await response.json()) as {
          supabase_url?: string;
          dashboard_url?: string | null;
        };

        setProjectUrl(payload.supabase_url ?? null);
        setDashboardUrl(payload.dashboard_url ?? null);

        return payload.supabase_url ?? null;
      },
    );

    // 2. session-authenticated dashboard payload (the app's main read path).
    const supabase = authBrowserClient();
    const {
      data: { session },
    } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

    if (session?.access_token) {
      checks.push({
        name: "session",
        target: "-",
        status: "ok",
        latencyMs: 0,
        detail: "JWT",
      });
      setResults([...checks]);
      await probe(
        "dashboard",
        "/api/functions/token-usage-dashboard",
        async () => {
          const tzRange = {
            from: new Date(Date.now() - 7 * 86_400_000).toISOString(),
            to: new Date(Date.now() + 86_400_000).toISOString(),
          };
          const response = await fetch(
            `/api/functions/token-usage-dashboard?from=${encodeURIComponent(tzRange.from)}&to=${encodeURIComponent(tzRange.to)}&tz=${encodeURIComponent(browserTimezone())}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          );

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = (await response.json()) as {
            totals?: { total_tokens?: number };
          };

          return `totals ${payload.totals?.total_tokens ?? 0}`;
        },
      );

      // 3. account-devices (settings page read path).
      await probe(
        "account-devices",
        "/api/functions/token-usage-account-devices",
        async () => {
          const to = new Date().toISOString().slice(0, 10);
          const from = new Date(Date.now() - 30 * 86_400_000)
            .toISOString()
            .slice(0, 10);
          const response = await fetch(
            `/api/functions/token-usage-account-devices?from=${from}&to=${to}`,
            { headers: { Authorization: `Bearer ${session.access_token}` } },
          );

          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const payload = (await response.json()) as {
            devices?: unknown[];
          };

          return `${payload.devices?.length ?? 0} devices`;
        },
      );
    } else {
      checks.push({
        name: "session",
        target: "-",
        status: "fail",
        latencyMs: null,
        detail: "no session",
      });
      setResults([...checks]);
    }

    setRunning(false);
  }, []);

  useEffect(() => {
    void runChecks();
  }, [runChecks]);

  const sessionState = useMemo(
    () =>
      results.find((result) => result.name === "session")?.status ?? "checking",
    [results],
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Typography color="muted" type="body-sm">
            {copy.pageSubtitle}
          </Typography>
        </div>
        <Button
          isDisabled={running}
          size="sm"
          variant="outline"
          onPress={() => void runChecks()}
        >
          {copy.retry}
        </Button>
      </header>

      <Card className="flex flex-col gap-1 p-6">
        {[
          [copy.project, projectUrl],
          [copy.dashboardUrl, dashboardUrl],
        ].map(([label, value]) => (
          <Typography key={label} color="muted" type="body-sm">
            {`${label}: `}
            <span className="text-foreground">
              {value ?? copy.notConfigured}
            </span>
          </Typography>
        ))}
        <Typography color="muted" type="body-sm">
          {`${copy.sessionOk}: `}
          <span className="text-foreground">
            {sessionState === "ok"
              ? copy.sessionOk
              : sessionState === "fail"
                ? copy.sessionMissing
                : copy.checking}
          </span>
        </Typography>
      </Card>

      <Card className="p-6">
        <Card.Content>
          <Table>
            <Table.ScrollContainer>
              <Table.Content aria-label={copy.pageTitle}>
                <Table.Header>
                  <Table.Column isRowHeader>{copy.columnCheck}</Table.Column>
                  <Table.Column>{copy.columnTarget}</Table.Column>
                  <Table.Column>{copy.columnStatus}</Table.Column>
                  <Table.Column>{copy.columnLatency}</Table.Column>
                </Table.Header>
                <Table.Body>
                  {results.map((result) => (
                    <Table.Row key={result.name}>
                      <Table.Cell className="font-medium">
                        {result.name}
                      </Table.Cell>
                      <Table.Cell className="text-foreground/60 text-xs">
                        {result.target}
                      </Table.Cell>
                      <Table.Cell>
                        <Chip
                          color={
                            result.status === "ok"
                              ? "success"
                              : result.status === "fail"
                                ? "danger"
                                : "default"
                          }
                          size="sm"
                          variant="soft"
                        >
                          {result.status === "ok"
                            ? copy.ok
                            : result.status === "fail"
                              ? copy.fail
                              : copy.checking}
                        </Chip>
                      </Table.Cell>
                      <Table.Cell className="tabular-nums">
                        {result.latencyMs != null
                          ? `${result.latencyMs} ms`
                          : "—"}
                        {result.detail && result.status === "fail"
                          ? ` · ${result.detail}`
                          : ""}
                      </Table.Cell>
                    </Table.Row>
                  ))}
                  {results.length === 0 ? (
                    <Table.Row>
                      <Table.Cell>{copy.loading}</Table.Cell>
                      <Table.Cell>—</Table.Cell>
                      <Table.Cell>—</Table.Cell>
                      <Table.Cell>—</Table.Cell>
                    </Table.Row>
                  ) : null}
                </Table.Body>
              </Table.Content>
            </Table.ScrollContainer>
          </Table>
        </Card.Content>
      </Card>

      <Typography color="muted" type="body-xs">
        {`latency > ${LATENCY_GOOD_MS} ms usually means a cold serverless start — run the checks again.`}
      </Typography>
    </main>
  );
}
