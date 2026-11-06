"use client";

// Four year-total cards for /wrapped (tokens, cost, conversations, active days).
// Achievements live in their own full-width card below (achievements-card.tsx).

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { DashboardPayload } from "@/lib/dashboard/api";

import { Calendar, Comments, Hashtag, Wallet } from "@gravity-ui/icons";

import { SummaryCards as SummaryCardRow } from "@/components/summary-card";
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
    <SummaryCardRow
      cards={stats}
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    />
  );
}
