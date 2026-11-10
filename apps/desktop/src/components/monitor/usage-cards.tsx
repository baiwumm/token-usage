import type { MonitorSnapshot } from "@/lib/monitor";

import { Card, Typography } from "@heroui/react";

import { formatTokens } from "@/lib/format-tokens";

interface UsageCardsProps {
  snapshot: MonitorSnapshot;
}

/**
 * Two single-value tiles: today and rolling 7 days. Same anatomy as the web's
 * SummaryCards (label in Card.Header, value + caption in Card.Content); the
 * queue backlog moved into the sync card because it describes upload health,
 * not usage (desktop-plan §12.3).
 */
export function UsageCards({ snapshot }: UsageCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <UsageTile
        label="今日 tokens"
        sub={`${formatTokens(snapshot.today.conversations)} 会话`}
        value={formatTokens(snapshot.today.totalTokens)}
      />
      <UsageTile
        label="近 7 天"
        sub={`${formatTokens(snapshot.week.conversations)} 会话`}
        value={formatTokens(snapshot.week.totalTokens)}
      />
    </div>
  );
}

function UsageTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <Card className="gap-1 border-border p-3">
      <Card.Header>
        <Card.Title className="truncate text-xs font-normal text-muted">
          {label}
        </Card.Title>
      </Card.Header>
      <Card.Content className="gap-0.5">
        <Typography
          className="text-foreground tabular-nums"
          type="h6"
          weight="semibold"
        >
          {value}
        </Typography>
        <Typography className="truncate text-muted tabular-nums" type="body-xs">
          {sub}
        </Typography>
      </Card.Content>
    </Card>
  );
}
