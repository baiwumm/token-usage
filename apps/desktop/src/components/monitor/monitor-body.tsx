import { invoke } from "@tauri-apps/api/core";
import { useCallback } from "react";

import { CliActionsCard } from "@/components/monitor/cli-actions-card";
import { DeviceRow } from "@/components/monitor/device-row";
import { MonitorHeader } from "@/components/monitor/monitor-header";
import {
  MonitorEmptyState,
  MonitorErrorState,
  MonitorSkeleton,
  NoCliState,
} from "@/components/monitor/monitor-states";
import { SourceMixSection } from "@/components/monitor/source-mix-section";
import { SyncStatusCard } from "@/components/monitor/sync-status-card";
import { UsageCards } from "@/components/monitor/usage-cards";
import { useMonitor } from "@/hooks/use-monitor";

const GUIDE_URL = "https://github.com/baiwumm/token-usage#readme";

/**
 * Monitor window orchestration: three-state gate (loading / error / ready),
 * a no-CLI guide, and the usage + sync + actions stack for the normal case.
 */
export function MonitorBody() {
  const {
    phase,
    machineId,
    hostname,
    cli,
    runningCommand,
    lastOutcome,
    refresh,
    runCli,
  } = useMonitor();

  const openGuide = useCallback(() => {
    void invoke("open_in_browser", { url: GUIDE_URL }).catch(() => undefined);
  }, []);

  if (phase.kind === "loading") {
    return <MonitorSkeleton />;
  }
  if (phase.kind === "error") {
    return (
      <MonitorErrorState
        message={phase.message}
        onRetry={() => void refresh()}
      />
    );
  }

  const snapshot = phase.snapshot;
  const hasAnyData = snapshot.week.totalTokens > 0 || snapshot.lastRun !== null;

  if (!cli.available && !hasAnyData) {
    return <NoCliState onOpenGuide={openGuide} />;
  }

  return (
    <main className="flex min-h-screen flex-col gap-4 p-4">
      <MonitorHeader paused={snapshot.paused} />
      {hasAnyData ? (
        <>
          <UsageCards snapshot={snapshot} />
          <SourceMixSection sources={snapshot.week.sources} />
          <SyncStatusCard snapshot={snapshot} />
        </>
      ) : (
        <MonitorEmptyState />
      )}
      <CliActionsCard
        lastOutcome={lastOutcome}
        runningCommand={runningCommand}
        snapshot={snapshot}
        onRun={(command, args) => void runCli(command, args)}
      />
      <DeviceRow
        cliVersion={cli.available ? cli.version : null}
        dashboardUrl={snapshot.dashboardUrl}
        hostname={hostname}
        machineId={machineId}
      />
    </main>
  );
}
