"use client";

// Service status at /service-status: probe this instance's contract
// endpoints (public + session-authenticated) and show latency. The CLI API
// keeps its own auth semantics — the guard never touches it, and neither do
// these probes go anywhere near Supabase directly.

import {
  ArrowsRotateRight,
  ChartLine,
  Database,
  Display,
  Globe,
  Link,
  ShieldCheck,
} from "@gravity-ui/icons";
import { Button, Card, Chip, Spinner, Table, Typography } from "@heroui/react";
import {
  useCallback,
  useEffect,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { STATUS_COPY, type StatusCheckName } from "@/lib/copy/status";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone } from "@/lib/dashboard/ranges";
import {
  fetchAccountDevices,
  fetchDashboard,
  fetchPublicConfig,
} from "@/lib/dashboard/api";
import { useFormat } from "@/lib/format/format";

type CheckStatus = "ok" | "fail" | "checking";

// Probes hand their findings back as data, not as sentences, so every row
// follows the active locale; "raw" only carries error text raised by fetch.
type CheckDetail =
  | { kind: "tokens"; value: number }
  | { kind: "devices"; value: number }
  | { kind: "no-session" }
  | { kind: "raw"; text: string };

interface CheckResult {
  name: StatusCheckName;
  target: string;
  status: CheckStatus;
  latencyMs: number | null;
  detail?: CheckDetail;
}

const CHECK_NAMES: StatusCheckName[] = [
  "public-config",
  "session",
  "dashboard",
  "account-devices",
];

const CHECK_TARGETS: Record<StatusCheckName, string> = {
  "public-config": "/api/functions/token-usage-public-config",
  session: "supabase.auth.getSession",
  dashboard: "/api/functions/token-usage-dashboard",
  "account-devices": "/api/functions/token-usage-account-devices",
};

const CHECK_ICONS: Record<
  StatusCheckName,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
  "public-config": Globe,
  session: ShieldCheck,
  dashboard: ChartLine,
  "account-devices": Display,
};

/** Past this a warm endpoint is unlikely — the hint below suggests a re-run. */
const LATENCY_SLOW_MS = 1500;
const LATENCY_FAST_MS = 300;

function nowMs(): number {
  return performance.now();
}

function latencyTone(ms: number): string {
  if (ms > LATENCY_SLOW_MS) return "text-warning";
  if (ms <= LATENCY_FAST_MS) return "text-success";

  return "";
}

function initialResults(): CheckResult[] {
  return CHECK_NAMES.map((name) => ({
    name,
    target: CHECK_TARGETS[name],
    status: "checking",
    latencyMs: null,
  }));
}

export function ServiceStatusClient() {
  const [locale] = useLocale();
  const copy = STATUS_COPY[locale];
  const { formatNumber } = useFormat();
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

  const detailText = (detail: CheckDetail): string => {
    switch (detail.kind) {
      case "tokens":
        return formatMessage(copy.detail.tokens, locale, {
          count: formatNumber(detail.value),
        });
      case "devices":
        return formatMessage(copy.detail.devices, locale, {
          count: formatNumber(detail.value),
        });
      case "no-session":
        return copy.sessionMissing;
      case "raw":
        return detail.text;
    }
  };

  const facts = [
    {
      key: "project",
      icon: Database,
      label: copy.project,
      value: projectUrl ?? copy.notConfigured,
      tone: "",
    },
    {
      key: "dashboard",
      icon: Link,
      label: copy.dashboardUrl,
      value: dashboardUrl ?? copy.notConfigured,
      tone: "",
    },
    {
      key: "session",
      icon: ShieldCheck,
      label: copy.sessionLabel,
      value:
        sessionState === "ok"
          ? copy.sessionOk
          : sessionState === "fail"
            ? copy.sessionMissing
            : copy.checking,
      tone:
        sessionState === "ok"
          ? "text-success"
          : sessionState === "fail"
            ? "text-danger"
            : "text-muted",
    },
  ];

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

      <Card className="p-6">
        <Card.Content className="gap-3">
          {facts.map((fact) => (
            <div key={fact.key} className="flex items-center gap-3">
              <fact.icon
                aria-hidden="true"
                className="text-accent/70 size-4 shrink-0"
              />
              <Typography
                className="w-36 shrink-0"
                color="muted"
                type="body-sm"
              >
                {fact.label}
              </Typography>
              <Typography
                className={`min-w-0 flex-1 break-all ${fact.tone}`.trim()}
                type="body-sm"
              >
                {fact.value}
              </Typography>
            </div>
          ))}
        </Card.Content>
      </Card>

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
              {results.map((result) => {
                const Icon = CHECK_ICONS[result.name];

                return (
                  <Table.Row key={result.name}>
                    <Table.Cell>
                      <span className="flex items-center gap-2">
                        <Icon
                          aria-hidden="true"
                          className="text-muted size-4 shrink-0"
                        />
                        <span className="flex min-w-0 flex-col">
                          <span className="font-medium">
                            {copy.checks[result.name]}
                          </span>
                          {result.detail ? (
                            <span
                              className={
                                result.status === "fail"
                                  ? "text-danger/80 text-xs break-words"
                                  : "text-muted text-xs"
                              }
                            >
                              {detailText(result.detail)}
                            </span>
                          ) : null}
                        </span>
                      </span>
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
                      {result.latencyMs != null ? (
                        <span className={latencyTone(result.latencyMs)}>
                          {`${result.latencyMs} ms`}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Table.Cell>
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <Typography color="muted" type="body-xs">
        {formatMessage(copy.latencyHint, locale, { ms: LATENCY_SLOW_MS })}
      </Typography>
    </main>
  );
}
