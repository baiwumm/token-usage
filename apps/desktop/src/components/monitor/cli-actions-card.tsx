import type { CliRunOutcome } from "@/hooks/use-monitor";
import type { MonitorSnapshot } from "@/lib/monitor";

import { ArrowRotateRight, CirclePause, CirclePlay } from "@gravity-ui/icons";
import { Alert, Card, Typography } from "@heroui/react";

import { PendingButton } from "@/components/pending-button";

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
 */
export function CliActionsCard({
  snapshot,
  runningCommand,
  lastOutcome,
  onRun,
}: CliActionsCardProps) {
  const busy = runningCommand !== null;

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>采集操作</Card.Title>
        <Card.Description>
          {snapshot.cli.available
            ? `tokenusage-cli${snapshot.cli.version ? ` ${snapshot.cli.version}` : ""}`
            : "未检测到 tokenusage-cli"}
        </Card.Description>
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
