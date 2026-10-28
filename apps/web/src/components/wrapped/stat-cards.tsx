"use client";

// Four year-total cards for /wrapped (tokens, cost, conversations, active days).

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { DashboardPayload } from "@/lib/dashboard/api";

import { Calendar, Comments, Hashtag, Wallet } from "@gravity-ui/icons";
import { Card, Typography } from "@heroui/react";

import { useFormat } from "@/lib/format/format";

export function StatCards({
  copy,
  totals,
}: {
  copy: WrappedCopy;
  totals: DashboardPayload["totals"];
}) {
  const { formatTokens, formatCost, formatNumber } = useFormat();
  const stats = [
    {
      key: "tokens",
      label: copy.cards.totalTokens,
      value: formatTokens(totals.total_tokens),
      icon: Hashtag,
    },
    {
      key: "cost",
      label: copy.cards.cost,
      value: formatCost(totals.total_cost_usd),
      icon: Wallet,
    },
    {
      key: "conversations",
      label: copy.cards.conversations,
      value: formatNumber(totals.conversations),
      icon: Comments,
    },
    {
      key: "activeDays",
      label: copy.cards.activeDays,
      value: formatNumber(totals.active_days),
      icon: Calendar,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {stats.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content>
            <Typography className="tabular-nums" type="h4" weight="semibold">
              {card.value}
            </Typography>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
