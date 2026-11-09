import type { FirstSyncPhase } from "@/hooks/use-pairing";
import type { SyncRunSummary } from "@/lib/sync-log";

import { Alert, Button, Card, Spinner, Typography } from "@heroui/react";

import { StepIcon, type StepState } from "@/components/pairing/step-icon";
import { formatBytes, formatDuration, formatTokens } from "@/lib/format-tokens";

interface SyncStepCardProps {
  /** Pairing approved — the first sync runs only after that. */
  approved: boolean;
  firstSync: FirstSyncPhase;
  onRetry: () => void;
  onFinish: () => void;
}

function stepState(approved: boolean, firstSync: FirstSyncPhase): StepState {
  if (firstSync.kind === "done") return "done";

  return approved ? "active" : "todo";
}

function description(approved: boolean, firstSync: FirstSyncPhase): string {
  if (!approved) {
    return "配对完成后自动同步一次，把本机已有的用量送上云端。";
  }
  switch (firstSync.kind) {
    case "running":
      return "正在首次同步…历史记录较多时可能需要几分钟。";
    case "done":
      return firstSync.run.pendingBytes > 0
        ? `还有 ${formatBytes(firstSync.run.pendingBytes)} 待上传，后台计划任务会继续同步。`
        : "本机队列已全部上传。";
    default:
      return "同步结果见下方。";
  }
}

/** Step 3: first `sync --auto` after approval, summarized from sync.log. */
export function SyncStepCard({
  approved,
  firstSync,
  onRetry,
  onFinish,
}: SyncStepCardProps) {
  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title className="flex items-center gap-2">
          <StepIcon index={3} state={stepState(approved, firstSync)} />
          首次同步
        </Card.Title>
        <Card.Description>{description(approved, firstSync)}</Card.Description>
      </Card.Header>
      {approved ? (
        <>
          <Card.Content>
            <SyncStepContent firstSync={firstSync} />
          </Card.Content>
          <Card.Footer className="flex flex-wrap gap-2">
            {firstSync.kind === "error" || firstSync.kind === "none" ? (
              <Button size="sm" variant="secondary" onPress={onRetry}>
                重试同步
              </Button>
            ) : null}
            <Button
              size="sm"
              variant={firstSync.kind === "done" ? "primary" : "tertiary"}
              onPress={onFinish}
            >
              进入监控台
            </Button>
          </Card.Footer>
        </>
      ) : null}
    </Card>
  );
}

function SyncStepContent({ firstSync }: { firstSync: FirstSyncPhase }) {
  switch (firstSync.kind) {
    case "idle":
    case "running":
      return (
        <Typography
          className="flex items-center gap-1.5"
          color="muted"
          type="body-sm"
        >
          <Spinner aria-hidden="true" color="current" size="sm" />
          tokenusage sync --auto
        </Typography>
      );
    case "done":
      return <SyncStats run={firstSync.run} warning={firstSync.warning} />;
    case "error":
      return (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>首次同步失败</Alert.Title>
            <Alert.Description>{firstSync.message}</Alert.Description>
          </Alert.Content>
        </Alert>
      );
    case "none":
      return (
        <Alert>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>没有新的同步记录</Alert.Title>
            <Alert.Description>
              采集可能已暂停，或另一轮同步正在进行——稍后可在监控台查看。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      );
  }
}

function SyncStats({
  run,
  warning,
}: {
  run: SyncRunSummary;
  warning: string | null;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-3">
        {/* Short labels: these tiles sit inside a card, narrower than the
            monitor's, and a wrapped label would misalign the values. */}
        <StatTile label="tokens" value={formatTokens(run.tokens)} />
        <StatTile label="会话" value={formatTokens(run.sessionsUploaded)} />
        <StatTile label="耗时" value={formatDuration(run.durationMs)} />
      </div>
      {!run.uploaded ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>本次未上传</Alert.Title>
            <Alert.Description>
              CLI 没有读到设备令牌——可在终端运行 tokenusage status 排查。
            </Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
      {warning ? (
        <Alert status="warning">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>上传时出错</Alert.Title>
            <Alert.Description>{warning}</Alert.Description>
          </Alert.Content>
        </Alert>
      ) : null}
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  // Nested inside the step card, so a bordered surface instead of another
  // Card; the label style matches the monitor's UsageCards tiles.
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-border bg-surface p-3">
      <Typography className="truncate text-xs text-muted" type="body-xs">
        {label}
      </Typography>
      <Typography
        className="text-foreground tabular-nums"
        type="h6"
        weight="semibold"
      >
        {value}
      </Typography>
    </div>
  );
}
