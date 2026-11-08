import type { MonitorSnapshot } from "@/lib/monitor";

import { Typography } from "@heroui/react";

import { formatBytes, formatTokens } from "@/lib/format-tokens";

interface UsageCardsProps {
  snapshot: MonitorSnapshot;
}

/** Three single-value tiles: today, rolling 7 days, and queue backlog. */
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
    <div className="rounded-2xl border border-border bg-surface p-3">
      <Typography className="text-muted" type="body">
        {label}
      </Typography>
      <Typography
        className={
          tone === "accent"
            ? "text-accent tabular-nums"
            : "text-foreground tabular-nums"
        }
        type="h6"
        weight="semibold"
      >
        {value}
      </Typography>
      <Typography className="text-muted tabular-nums" type="body">
        {sub}
      </Typography>
    </div>
  );
}
