import type { CliRunOutcome } from "@/hooks/use-monitor";
import type { MonitorSnapshot } from "@/lib/monitor";

import { ArrowRotateRight, CirclePause, CirclePlay } from "@gravity-ui/icons";
import { Alert, Button, Card, Chip, Tooltip, Typography } from "@heroui/react";

import { PendingButton } from "@/components/pending-button";
import { useCliLatest } from "@/hooks/use-cli-latest";
import { bareVersion } from "@/lib/version";

interface CliActionsCardProps {
  snapshot: MonitorSnapshot;
  runningCommand: string | null;
  lastOutcome: CliRunOutcome | null;
  onRun: (command: string, args?: string[]) => void;
}

/** True when a run did not complete cleanly (spawn failure or non-zero exit). */
function outcomeFailed(outcome: CliRunOutcome): boolean {
  return (
    !outcome.resolved || (outcome.exitCode !== null && outcome.exitCode !== 0)
  );
}

/**
 * CLI action bar: the desktop never reimplements collection logic — every
 * action shells out to `tokenusage` (docs/desktop-plan.md §3 boundary 2).
 * The clicked button spins (PendingButton), its siblings disable while a run
 * is in flight, and a failed run surfaces as a danger Alert instead of a
 * bare exit-code line.
 *
 * The version chip doubles as the update probe: the registry request fires
 * only on click (§12.1 keeps the desktop offline by default), and its answer
 * appears as a chip beside the version —「最新」when the installed CLI matches
 * npm, the published version when it is behind.
 */
export function CliActionsCard({
  snapshot,
  runningCommand,
  lastOutcome,
  onRun,
}: CliActionsCardProps) {
  const busy = runningCommand !== null;
  // `tokenusage --version` may already carry the `v` (vv0.5.4 on screen).
  const installed =
    snapshot.cli.available && snapshot.cli.version !== null
      ? bareVersion(snapshot.cli.version)
      : null;
  const { state, check } = useCliLatest(installed);

  return (
    <Card className="border-border">
      <Card.Header className="flex-row! items-center justify-between gap-2">
        <Card.Title>采集操作</Card.Title>
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
        </div>
      </Card.Header>
      <Card.Content className="gap-3">
        <div className="flex flex-wrap gap-2">
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
                <Alert.Title>
                  {lastOutcome.command} ·{" "}
                  {lastOutcome.resolved
                    ? `exit ${lastOutcome.exitCode ?? "signal"}`
                    : "未能启动 CLI"}
                </Alert.Title>
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
