import type { CliRunOutcome } from "@/hooks/use-monitor";
import type { MonitorSnapshot } from "@/lib/monitor";

import {
  ArrowRotateRight,
  Check,
  CirclePause,
  CirclePlay,
  Copy,
} from "@gravity-ui/icons";
import {
  Alert,
  Button,
  Card,
  Chip,
  Spinner,
  Tooltip,
  Typography,
} from "@heroui/react";

import { PendingButton } from "@/components/pending-button";
import { useCliLatest } from "@/hooks/use-cli-latest";
import { useCopy } from "@/hooks/use-copy";
import { formatBytes, formatDuration, formatTokens } from "@/lib/format-tokens";
import { bareVersion } from "@/lib/version";

interface SyncStatusCardProps {
  snapshot: MonitorSnapshot;
  refreshing: boolean;
  runningCommand: string | null;
  lastOutcome: CliRunOutcome | null;
  onRefresh: () => void;
  onRun: (command: string, args?: string[]) => void;
}

/** True when a run did not complete cleanly (spawn failure or non-zero exit). */
function outcomeFailed(outcome: CliRunOutcome): boolean {
  return (
    !outcome.resolved || (outcome.exitCode !== null && outcome.exitCode !== 0)
  );
}

/**
 * Upload health + the CLI surface. Since D9 (2026-11-11) the four CLI
 * actions live as icon buttons in the window header on ≥640px windows; this
 * card keeps them as the narrow-window fallback, absorbs the version/update
 * probe chip and the run output block from the former 采集操作 card, and
 * still owns the backlog lines, last run summary, error line and the manual
 * refresh control (held visible ≥400 ms by the hook, operator review
 * 2026-11-10).
 */
export function SyncStatusCard({
  snapshot,
  refreshing,
  runningCommand,
  lastOutcome,
  onRefresh,
  onRun,
}: SyncStatusCardProps) {
  const run = snapshot.lastRun;
  const busy = runningCommand !== null;
  // `tokenusage --version` may already carry the `v` (vv0.5.4 on screen).
  const installed =
    snapshot.cli.available && snapshot.cli.version !== null
      ? bareVersion(snapshot.cli.version)
      : null;
  const { state, check } = useCliLatest(installed);
  const { copied, copy } = useCopy();

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
        <div className="flex shrink-0 items-center gap-1.5">
          <Tooltip delay={0}>
            <Button
              aria-label="检查 CLI 是否有新版本"
              className="h-auto! min-h-0! w-auto gap-0 rounded-full p-0!"
              isDisabled={installed === null}
              size="sm"
              variant="ghost"
              onPress={() => void check()}
            >
              <Chip
                color={snapshot.cli.available ? "default" : "danger"}
                size="sm"
                variant="soft"
              >
                {snapshot.cli.available
                  ? `tokenusage-cli${installed ? ` v${installed}` : ""}`
                  : "未检测到 CLI"}
              </Chip>
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              <Tooltip.Arrow />
              <Typography type="body-xs">点击检查 CLI 新版本</Typography>
            </Tooltip.Content>
          </Tooltip>
          {state.kind === "checking" ? (
            <Chip size="sm" variant="soft">
              检查中
            </Chip>
          ) : null}
          {state.kind === "latest" ? (
            <Chip color="success" size="sm" variant="soft">
              最新
            </Chip>
          ) : null}
          {state.kind === "outdated" ? (
            <Chip color="warning" size="sm" variant="soft">
              可更新 v{state.version}
            </Chip>
          ) : null}
          {state.kind === "error" ? (
            <Chip size="sm" variant="soft">
              检查失败
            </Chip>
          ) : null}
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
        </div>
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
        <div className="flex flex-wrap gap-2 pt-1 sm:hidden">
          <PendingButton
            icon={
              <ArrowRotateRight
                aria-hidden="true"
                className="size-4 shrink-0"
              />
            }
            isDisabled={busy || !snapshot.cli.available}
            pending={runningCommand === "sync"}
            onPress={() => onRun("sync", ["--auto"])}
          >
            立即同步
          </PendingButton>
          <PendingButton
            isDisabled={busy || !snapshot.cli.available}
            pending={runningCommand === "doctor"}
            variant="secondary"
            onPress={() => onRun("doctor")}
          >
            Doctor
          </PendingButton>
          <PendingButton
            isDisabled={busy || !snapshot.cli.available}
            pending={runningCommand === "reconcile"}
            variant="secondary"
            onPress={() => onRun("reconcile", ["--days", "7"])}
          >
            对账 7 天
          </PendingButton>
          <PendingButton
            icon={
              snapshot.paused ? (
                <CirclePlay aria-hidden="true" className="size-4 shrink-0" />
              ) : (
                <CirclePause aria-hidden="true" className="size-4 shrink-0" />
              )
            }
            isDisabled={busy || !snapshot.cli.available}
            pending={runningCommand === "pause" || runningCommand === "resume"}
            variant="secondary"
            onPress={() => onRun(snapshot.paused ? "resume" : "pause")}
          >
            {snapshot.paused ? "恢复采集" : "暂停采集"}
          </PendingButton>
        </div>
        {lastOutcome ? (
          outcomeFailed(lastOutcome) ? (
            <Alert status="danger">
              <Alert.Indicator />
              <Alert.Content className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <Alert.Title>
                    {lastOutcome.command} ·{" "}
                    {lastOutcome.resolved
                      ? `exit ${lastOutcome.exitCode ?? "signal"}`
                      : "未能启动 CLI"}
                  </Alert.Title>
                  <Button
                    isIconOnly
                    aria-label={copied ? "已复制" : "复制失败输出"}
                    className="shrink-0"
                    isDisabled={!lastOutcome.outputTail}
                    size="sm"
                    variant="ghost"
                    onPress={() => void copy(lastOutcome.outputTail)}
                  >
                    {copied ? (
                      <Check
                        aria-hidden="true"
                        className="size-4 text-success"
                      />
                    ) : (
                      <Copy aria-hidden="true" className="size-4" />
                    )}
                  </Button>
                </div>
                <Alert.Description className="mt-1 block whitespace-pre-wrap break-all font-mono text-xs">
                  {lastOutcome.outputTail}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ) : (
            <div className="rounded-xl bg-default p-2">
              <Typography className="text-muted" type="body">
                {lastOutcome.command} · exit {lastOutcome.exitCode ?? "signal"}
              </Typography>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-foreground tabular-nums">
                {lastOutcome.outputTail}
              </pre>
            </div>
          )
        ) : null}
      </Card.Content>
    </Card>
  );
}
