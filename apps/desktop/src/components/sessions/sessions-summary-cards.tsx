import type { SessionsTotals } from "@/lib/sessions";

import { Card, Typography } from "@heroui/react";

import {
  formatCost,
  formatDuration,
  formatNumber,
  formatTokens,
} from "@/lib/format-tokens";

/**
 * Four totals cards of the sessions view (web SummaryCards 移植): 会话数 /
 * 总 Tokens / 成本 / 平均时长 over the filtered window. First load keeps the
 * real labels while only the numbers are skeletons — the row never flashes
 * as one grey block (ui-spec Sessions).
 */
export function SessionsSummaryCards({
  totals,
  loading,
}: {
  totals: SessionsTotals;
  loading: boolean;
}) {
  const cards = [
    {
      id: "sessions",
      label: "会话数",
      value: formatNumber(totals.sessions),
    },
    {
      id: "tokens",
      label: "总 Tokens",
      value: formatTokens(totals.totalTokens),
    },
    {
      id: "cost",
      label: "成本",
      value: formatCost(totals.totalCostUsd),
    },
    {
      id: "duration",
      label: "平均时长",
      value:
        totals.sessions > 0
          ? formatDuration(totals.durationMs / totals.sessions)
          : "—",
      sub: "每个会话",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.id} className="gap-1 border-border p-3">
          <Card.Header>
            <Card.Title className="flex w-full items-center justify-between gap-2 text-xs font-normal text-muted">
              <span className="truncate">{card.label}</span>
              {card.sub ? (
                <span className="shrink-0 text-muted">{card.sub}</span>
              ) : null}
            </Card.Title>
          </Card.Header>
          <Card.Content className="gap-0.5">
            <Typography
              className="text-foreground tabular-nums"
              type="h6"
              weight="semibold"
            >
              {loading ? (
                <span className="inline-block h-5 w-16 animate-pulse rounded bg-default" />
              ) : (
                card.value
              )}
            </Typography>
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
