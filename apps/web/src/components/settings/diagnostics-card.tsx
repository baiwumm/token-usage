"use client";

// 实例诊断 card (Settings · 设备分区): the instance facts (Supabase project,
// pairing callback) plus the four contract-endpoint probes with latency.
// Relocated from the former /service-status page (2026-11-07 信息架构调整):
// the standalone nav page re-proved what reaching it already proved, while
// the diagnostic job itself belongs where deployment questions live.

import { ArrowsRotateRight, Database, Link } from "@gravity-ui/icons";
import { Button, Card, Spinner, Typography } from "@heroui/react";

import { LATENCY_SLOW_MS } from "./diagnostics";
import { DiagnosticsTable } from "./diagnostics-table";
import { useDiagnostics } from "./use-diagnostics";

import { DIAGNOSTICS_COPY } from "@/lib/copy/diagnostics";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";

export function DiagnosticsCard({
  accessToken,
}: {
  accessToken: string | null;
}) {
  const [locale] = useLocale();
  const copy = DIAGNOSTICS_COPY[locale];
  const { running, results, projectUrl, dashboardUrl, rerun } =
    useDiagnostics(accessToken);

  // Two static instance facts above the table; the session lives in the table
  // itself (its row) rather than repeating here.
  const facts = [
    {
      key: "project",
      icon: Database,
      label: copy.project,
      value: projectUrl ?? copy.notConfigured,
    },
    {
      key: "callback",
      icon: Link,
      label: copy.dashboardUrl,
      value: dashboardUrl ?? copy.notConfigured,
    },
  ];

  return (
    <Card>
      <Card.Header>
        <Card.Title>{copy.cardTitle}</Card.Title>
        <Card.Description>{copy.cardHint}</Card.Description>
      </Card.Header>
      <Card.Content className="gap-4">
        {facts.map((fact) => (
          <div key={fact.key} className="flex items-center gap-3">
            <fact.icon
              aria-hidden="true"
              className="text-accent/70 size-4 shrink-0"
            />
            <Typography className="w-36 shrink-0" color="muted" type="body-sm">
              {fact.label}
            </Typography>
            <Typography className="min-w-0 flex-1 break-all" type="body-sm">
              {fact.value}
            </Typography>
          </div>
        ))}

        <DiagnosticsTable copy={copy} results={results} />
      </Card.Content>
      <Card.Footer className="flex flex-wrap items-center justify-between gap-3">
        <Typography color="muted" type="body-xs">
          {formatMessage(copy.latencyHint, locale, { ms: LATENCY_SLOW_MS })}
        </Typography>
        <Button isPending={running} size="sm" variant="outline" onPress={rerun}>
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
      </Card.Footer>
    </Card>
  );
}
