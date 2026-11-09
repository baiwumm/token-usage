import type { MonitorSnapshot } from "@/lib/monitor";

import { Card, Typography, cn } from "@heroui/react";

import { formatBytes, formatTokens } from "@/lib/format-tokens";

interface UsageCardsProps {
  snapshot: MonitorSnapshot;
}

/**
 * Three single-value tiles: today, rolling 7 days, and queue backlog. Same
 * anatomy as the web's SummaryCards (label in Card.Header, value + caption in
 * Card.Content); labels stay text-xs so they hold one line at 400 px and the
 * three values line up.
 */
export function UsageCards({ snapshot }: UsageCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
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
      <UsageTile
        label="待上传"
        sub={`队列 ${formatBytes(snapshot.queueBytes)}`}
        tone={snapshot.pendingBytes > 0 ? "accent" : "default"}
        value={formatBytes(snapshot.pendingBytes)}
      />
    </div>
  );
}

function UsageTile({
  label,
  value,
  sub,
  tone = "default",
}: {
  label: string;
  value: string;
  sub: string;
  tone?: "default" | "accent";
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
          className={cn(
            "tabular-nums",
            tone === "accent" ? "text-accent" : "text-foreground",
          )}
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
