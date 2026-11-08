import type { CliRunOutcome } from "@/hooks/use-monitor";
import type { MonitorSnapshot } from "@/lib/monitor";

import { ArrowRotateRight, CirclePause, CirclePlay } from "@gravity-ui/icons";
import { Button, Card, Typography } from "@heroui/react";

interface CliActionsCardProps {
  snapshot: MonitorSnapshot;
  runningCommand: string | null;
  lastOutcome: CliRunOutcome | null;
  onRun: (command: string, args?: string[]) => void;
}

/**
 * CLI action bar: the desktop never reimplements collection logic — every
 * action shells out to `tokenusage` (docs/desktop-plan.md §3 boundary 2).
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
      <div className="flex flex-wrap gap-2">
        <Button
          isDisabled={busy || !snapshot.cli.available}
          isPending={runningCommand === "sync"}
          onPress={() => onRun("sync", ["--auto"])}
        >
          <ArrowRotateRight aria-hidden="true" className="size-4 shrink-0" />
          立即同步
        </Button>
        <Button
          isDisabled={busy || !snapshot.cli.available}
          isPending={runningCommand === "doctor"}
          variant="secondary"
          onPress={() => onRun("doctor")}
        >
          Doctor
        </Button>
        <Button
          isDisabled={busy || !snapshot.cli.available}
          isPending={runningCommand === "reconcile"}
          variant="secondary"
          onPress={() => onRun("reconcile", ["--days", "7"])}
        >
          对账 7 天
        </Button>
        <Button
          isDisabled={busy || !snapshot.cli.available}
          isPending={runningCommand === "pause" || runningCommand === "resume"}
          variant="secondary"
          onPress={() => onRun(snapshot.paused ? "resume" : "pause")}
        >
          {snapshot.paused ? (
            <CirclePlay aria-hidden="true" className="size-4 shrink-0" />
          ) : (
            <CirclePause aria-hidden="true" className="size-4 shrink-0" />
          )}
          {snapshot.paused ? "恢复采集" : "暂停采集"}
        </Button>
      </div>
      {lastOutcome ? (
        <div className="rounded-xl bg-default p-2">
          <Typography className="text-muted" type="body">
            {lastOutcome.command} ·{" "}
            {lastOutcome.resolved
              ? `exit ${lastOutcome.exitCode ?? "signal"}`
              : "未能启动 CLI"}
          </Typography>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-xs text-foreground tabular-nums">
            {lastOutcome.outputTail}
          </pre>
        </div>
      ) : null}
    </Card>
  );
}
