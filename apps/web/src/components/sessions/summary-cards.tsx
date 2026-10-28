"use client";

// Summary row for /sessions (docs/ui-spec.md Sessions): four totals, each card
// carrying its label/icon on first load while only the number is a skeleton.

import type { SessionsCopy } from "@/lib/copy/sessions";
import type { SessionsPayload } from "@/lib/dashboard/api";

import { ChartColumn, Clock, ListUl, Wallet } from "@gravity-ui/icons";
import { Card, Skeleton, Typography } from "@heroui/react";

import { FlowNumber } from "@/components/flow-number";
import { useFormat } from "@/lib/format/format";

export function SummaryCards({
  payload,
  copy,
}: {
  payload: SessionsPayload;
  copy: SessionsCopy;
}) {
  const { formatTokens, formatCost, formatNumber, formatDuration } =
    useFormat();
  const { totals } = payload;
  const cards = [
    {
      key: "sessions",
      label: copy.cards.sessions,
      icon: ListUl,
      value: formatNumber(totals.sessions),
      sub: undefined,
    },
    {
      key: "tokens",
      label: copy.cards.tokens,
      icon: ChartColumn,
      value: formatTokens(totals.total_tokens),
      sub: undefined,
    },
    {
      key: "cost",
      label: copy.cards.cost,
      icon: Wallet,
      value: formatCost(Number(totals.total_cost_usd)),
      sub: undefined,
    },
    {
      key: "duration",
      label: copy.cards.avgDuration,
      icon: Clock,
      value:
        totals.sessions > 0
          ? formatDuration(totals.duration_ms / totals.sessions)
          : copy.cards.emptyValue,
      sub: copy.cards.avgHint,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
// are real, only the numbers are skeletons — the four cards must not flash as
// one grey block before the payload lands.
export function SummaryCardsSkeleton({ copy }: { copy: SessionsCopy }) {
  const cards = [
    { key: "sessions", label: copy.cards.sessions, icon: ListUl },
    { key: "tokens", label: copy.cards.tokens, icon: ChartColumn },
    { key: "cost", label: copy.cards.cost, icon: Wallet },
    {
      key: "duration",
      label: copy.cards.avgDuration,
      icon: Clock,
      sub: copy.cards.avgHint,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className="gap-1">
            <Skeleton className="h-7 w-24 rounded-full" />
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
