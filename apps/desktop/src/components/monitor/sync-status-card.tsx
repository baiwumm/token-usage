import type { MonitorSnapshot } from "@/lib/monitor";

import { Card, Typography } from "@heroui/react";

import { formatBytes, formatDuration, formatTokens } from "@/lib/format-tokens";

interface SyncStatusCardProps {
  snapshot: MonitorSnapshot;
}

/** Last sync outcome from logs/sync.log plus any error after that run. */
export function SyncStatusCard({ snapshot }: SyncStatusCardProps) {
  const run = snapshot.lastRun;

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>最近同步</Card.Title>
        {run ? (
          <Card.Description>
            {new Date(run.ts).toLocaleString("zh-CN", { hour12: false })}
          </Card.Description>
        ) : (
          <Card.Description>尚无记录</Card.Description>
        )}
      </Card.Header>
      {run || snapshot.lastError ? (
        <Card.Content className="gap-1">
          {run ? (
            <Typography className="text-foreground tabular-nums" type="body">
              上传 {formatTokens(run.tokens)} tokens · {run.buckets} 桶 · 耗时{" "}
              {formatDuration(run.durationMs)}
              {run.pendingBytes > 0
                ? ` · 待传 ${formatBytes(run.pendingBytes)}`
                : " · 队列已清"}
            </Typography>
          ) : null}
          {snapshot.lastError ? (
            <Typography className="text-danger" type="body">
              {new Date(snapshot.lastError.ts).toLocaleString("zh-CN", {
                hour12: false,
              })}
              ：{snapshot.lastError.msg}
            </Typography>
          ) : null}
        </Card.Content>
      ) : null}
    </Card>
  );
}
