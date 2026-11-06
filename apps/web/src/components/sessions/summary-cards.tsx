"use client";

// Summary row for /sessions (docs/ui-spec.md Sessions): four totals, each card
// carrying its label/icon on first load while only the number is a skeleton.

import type { SessionsCopy } from "@/lib/copy/sessions";
import type { SessionsPayload } from "@/lib/dashboard/api";

import { ChartColumn, Clock, ListUl, Wallet } from "@gravity-ui/icons";

import {
  SummaryCards as SummaryCardRow,
  SummaryCardsSkeleton as SummaryCardRowSkeleton,
} from "@/components/summary-card";
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
    <SummaryCardRow
      cards={cards}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
      contentClassName="gap-1"
    />
  );
}

// First-load placeholder for the summary row: the card shells (label + icon)
// are real, only the numbers are skeletons — the four cards must not flash as
// one grey block before the payload lands.
export function SummaryCardsSkeleton({ copy }: { copy: SessionsCopy }) {
  const cards = [
    {
      key: "sessions",
      label: copy.cards.sessions,
      icon: ListUl,
      valueWidth: "w-24",
    },
    {
      key: "tokens",
      label: copy.cards.tokens,
      icon: ChartColumn,
      valueWidth: "w-24",
    },
    {
      key: "cost",
      label: copy.cards.cost,
      icon: Wallet,
      valueWidth: "w-24",
    },
    {
      key: "duration",
      label: copy.cards.avgDuration,
      icon: Clock,
      sub: copy.cards.avgHint,
      valueWidth: "w-24",
    },
  ];

  return (
    <SummaryCardRowSkeleton
      cards={cards}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
      contentClassName="gap-1"
    />
  );
}
