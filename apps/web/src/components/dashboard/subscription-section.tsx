"use client";

// Subscription balances card (docs/cli-contract.md §2.13/§2.14): the latest
// per-source snapshot the device reported. Display-only — balances are never
// merged into tokens or cost. Hidden entirely while no snapshot exists.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { SubscriptionSnapshot } from "@/lib/dashboard/api";

import { Card, Chip, Typography } from "@heroui/react";

import { PanelOverlay } from "./panel-overlay";

import { FlowNumber } from "@/components/flow-number";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { useFormat } from "@/lib/format/format";

export function SubscriptionSection({
  copy,
  subscriptions,
  refreshing,
}: {
  copy: DashboardCopy;
  subscriptions: SubscriptionSnapshot[];
  refreshing: boolean;
}) {
  const { formatCredits, formatDateTime, formatPercent } = useFormat();

  if (subscriptions.length === 0) return null;

  return (
    <Card className="relative p-6">
      <PanelOverlay active={refreshing} />
      <Card.Header>
        <Card.Title>{copy.subscription.title}</Card.Title>
        <Card.Description>{copy.subscription.hint}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-5">
        {subscriptions.map((snapshot) => (
          <div key={snapshot.source} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <SourceIcon label={snapshot.source} size={14} />
              <span className="truncate text-sm font-medium">
                {sourceDisplayLabel(snapshot.source)}
              </span>
              {snapshot.plan ? (
                <Chip size="sm" variant="soft">
                  {snapshot.plan}
                </Chip>
              ) : null}
              <span className="text-muted ml-auto text-xs">
                {formatDateTime(snapshot.captured_at)}
              </span>
            </div>

            {snapshot.pools.map((pool, index) => {
              const used = pool.used ?? 0;
              const total = pool.total ?? 0;
              const percent =
                total > 0 ? Math.min(100, Math.round((used / total) * 100)) : 0;

              return (
                <div
                  key={`pool-${index}`}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <span className="text-muted min-w-0 truncate text-xs">
                    {pool.name ?? "—"}
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="bg-default hidden h-1.5 w-32 overflow-hidden rounded-full sm:block">
                      <span
                        className="bg-accent block h-full rounded-full"
                        style={{ width: `${percent}%` }}
                      />
                    </span>
                    <span className="tabular-nums">
                      <FlowNumber text={formatCredits(used)} />
                      {" / "}
                      {formatCredits(total)}{" "}
                      <span className="text-foreground/60 text-xs">
                        {pool.unit ?? ""}
                      </span>
                    </span>
                  </span>
                </div>
              );
            })}

            {snapshot.windows.map((window, index) => (
              <div
                key={`window-${index}`}
                className="flex items-center justify-between gap-3 text-sm"
              >
                <span className="text-muted min-w-0 truncate text-xs">
                  {window.label ?? "—"}
                </span>
                <span className="tabular-nums">
                  {window.percent != null
                    ? formatPercent(window.percent / 100)
                    : "—"}
                  {window.resets_at
                    ? ` · ${formatDateTime(window.resets_at)}`
                    : ""}
                </span>
              </div>
            ))}

            {snapshot.pools.length === 0 && snapshot.windows.length === 0 ? (
              <Typography color="muted" type="body-sm">
                —
              </Typography>
            ) : null}
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
