"use client";

// The instance-facts card at the top of /service-status: project URL, dashboard
// URL and the session status, each as a label/value row.

import type { CheckStatus } from "./checks";
import type { StatusCopy } from "@/lib/copy/status";

import { Database, Link, ShieldCheck } from "@gravity-ui/icons";
import { Card, Typography } from "@heroui/react";

export function FactsCard({
  projectUrl,
  dashboardUrl,
  sessionState,
  copy,
}: {
  projectUrl: string | null;
  dashboardUrl: string | null;
  sessionState: CheckStatus;
  copy: StatusCopy;
}) {
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
    <Card className="p-6">
      <Card.Content className="gap-3">
        {facts.map((fact) => (
          <div key={fact.key} className="flex items-center gap-3">
            <fact.icon
              aria-hidden="true"
              className="text-accent/70 size-4 shrink-0"
            />
            <Typography className="w-36 shrink-0" color="muted" type="body-sm">
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
  );
}
