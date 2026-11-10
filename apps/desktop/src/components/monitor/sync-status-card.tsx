import type { MonitorSnapshot } from "@/lib/monitor";

import { ArrowRotateRight } from "@gravity-ui/icons";
import { Button, Card, Spinner, Typography } from "@heroui/react";

import { formatBytes, formatDuration, formatTokens } from "@/lib/format-tokens";

interface SyncStatusCardProps {
  snapshot: MonitorSnapshot;
  refreshing: boolean;
  onRefresh: () => void;
}

/**
 * Upload health: last sync outcome, any error after it, and the queue backlog
 * (moved here from the usage tiles). The header carries the snapshot's
 * "updated at" stamp plus the manual refresh control; the poller keeps it
 * fresh every 10 s otherwise. The button swaps in a Spinner while the read is
 * in flight (the hook also holds it visible for a beat — a local refresh
 * finishes faster than the eye can catch, operator review 2026-11-10).
 */
export function SyncStatusCard({
  snapshot,
  refreshing,
  onRefresh,
}: SyncStatusCardProps) {
  const run = snapshot.lastRun;

  return (
    <Card className="border-border">
      <Card.Header className="flex-row! items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Card.Title>采集与同步</Card.Title>
          <Card.Description>
            更新于{" "}
            {new Date(snapshot.updatedAt).toLocaleTimeString("zh-CN", {
              hour12: false,
            })}
          </Card.Description>
        </div>
        <Button
          isIconOnly
          aria-label="刷新数据"
          className="shrink-0"
          isDisabled={refreshing}
          size="sm"
          variant="ghost"
          onPress={onRefresh}
        >
          {refreshing ? (
            <Spinner aria-hidden="true" color="current" size="sm" />
          ) : (
            <ArrowRotateRight aria-hidden="true" className="size-4" />
          )}
        </Button>
      </Card.Header>
      <Card.Content className="gap-1">
        <Typography className="text-foreground tabular-nums" type="body">
          {snapshot.pendingBytes > 0
            ? `待上传 ${formatBytes(snapshot.pendingBytes)}`
            : "队列已清"}
          {` · 队列 ${formatBytes(snapshot.queueBytes)}`}
        </Typography>
        {run ? (
          <Typography className="text-foreground tabular-nums" type="body">
            上传 {formatTokens(run.tokens)} tokens · {run.buckets} 桶 · 耗时{" "}
            {formatDuration(run.durationMs)}
          </Typography>
        ) : (
          <Typography className="text-muted" type="body">
            尚无同步记录
          </Typography>
        )}
        {snapshot.lastError ? (
          <Typography className="text-danger" type="body">
            {new Date(snapshot.lastError.ts).toLocaleString("zh-CN", {
              hour12: false,
            })}
            ：{snapshot.lastError.msg}
          </Typography>
        ) : null}
      </Card.Content>
    </Card>
  );
}
