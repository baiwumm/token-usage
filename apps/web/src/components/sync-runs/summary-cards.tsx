"use client";

// Summary row for /sync-runs (docs/cli-contract.md §2.12): today's run count and
// the last run timestamp. First load keeps the card shells and skeletons only
// the two text lines, matching /sessions.

import type { SyncRunsCopy } from "@/lib/copy/sync-runs";
import type { SyncRunsPayload } from "@/lib/dashboard/api";

import { Clock, ClockArrowRotateLeft } from "@gravity-ui/icons";
import { Card, Skeleton, Typography } from "@heroui/react";

import { FlowNumber } from "@/components/flow-number";
import { formatMessage } from "@/lib/copy/message";
import { useLocale } from "@/lib/copy/locale";
import { useFormat } from "@/lib/format/format";

export function SummaryCards({
  todayRuns,
  lastRunAt,
  copy,
}: {
  todayRuns: SyncRunsPayload | null;
  lastRunAt: string | null;
  copy: SyncRunsCopy;
}) {
  const { formatDateTime, formatNumber, formatRelativeTime } = useFormat();
  const [locale] = useLocale();
  const emptyRuns = todayRuns?.totals.empty_runs ?? 0;
  const cards = [
    {
      key: "today",
      label: copy.cards.todayRuns,
      icon: ClockArrowRotateLeft,
      value: formatNumber(todayRuns?.totals.runs ?? 0),
      sub:
        todayRuns && emptyRuns > 0
          ? formatMessage(copy.cards.todayEmptyHint, locale, {
              count: emptyRuns,
            })
          : undefined,
    },
    {
      key: "last",
      label: copy.cards.lastRun,
      icon: Clock,
      value: lastRunAt ? formatDateTime(lastRunAt) : copy.cards.emptyValue,
      sub: lastRunAt ? formatRelativeTime(lastRunAt) : undefined,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className="gap-1">
            <Typography className="tabular-nums" type="h4" weight="semibold">
              <FlowNumber text={card.value} />
            </Typography>
            {card.sub ? (
              <Typography color="muted" type="body-xs">
                {card.sub}
              </Typography>
            ) : null}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

// First-load placeholder for the summary row: the card shells (label + icon)
// are real, only the two text lines inside are skeletons — the two cards must
// not flash as one grey block before the payload lands (same rule as
// /sessions). Both lines are placeholder-ed even though the real caption is
// conditional (empty-run hint / relative time), so the row keeps its height
// instead of growing once the payload arrives.
export function SummaryCardsSkeleton({ copy }: { copy: SyncRunsCopy }) {
  const cards = [
    {
      key: "today",
      label: copy.cards.todayRuns,
      icon: ClockArrowRotateLeft,
      value: "w-20",
      caption: "w-20",
    },
    {
      key: "last",
      label: copy.cards.lastRun,
      icon: Clock,
      value: "w-40",
      caption: "w-16",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className="gap-2">
            <Skeleton className={`h-7 ${card.value} rounded-full`} />
            <Skeleton className={`h-3 ${card.caption} rounded-full`} />
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
