import { invoke } from "@tauri-apps/api/core";
import { useCallback, useState } from "react";

import { CliActionsCard } from "@/components/monitor/cli-actions-card";
import { DeviceRow } from "@/components/monitor/device-row";
import { MonitorHeader } from "@/components/monitor/monitor-header";
import {
  MonitorEmptyState,
  MonitorErrorState,
  MonitorSkeleton,
} from "@/components/monitor/monitor-states";
import { SourceMixCard } from "@/components/monitor/source-mix-card";
import { SettingsDialog } from "@/components/monitor/settings-dialog";
import { SyncStatusCard } from "@/components/monitor/sync-status-card";
import { TrayNote } from "@/components/monitor/tray-note";
import { UnpairedNote } from "@/components/monitor/unpaired-note";
import { UsageCards } from "@/components/monitor/usage-cards";
import { PairingBody } from "@/components/pairing/pairing-body";
import { useDesktopNotifications } from "@/hooks/use-notifications";
import { useMonitor } from "@/hooks/use-monitor";
import { useMonitorToasts } from "@/hooks/use-monitor-toasts";
import { usePairing } from "@/hooks/use-pairing";
import { usePreferences } from "@/hooks/use-preferences";
import { useTheme } from "@/hooks/use-theme";
import { useTrayAvailable } from "@/hooks/use-tray";

const GUIDE_URL = "https://github.com/baiwumm/token-usage#readme";

/**
 * Window orchestration: loading / error gates, the pairing gate (an unpaired
 * machine gets the first-run wizard, skippable for the session), then the
 * usage + sync + actions stack for the normal case.
 */
export function MonitorBody() {
  const {
    phase,
    machineId,
    hostname,
    cli,
    cliResolved,
    runningCommand,
    lastOutcome,
    refresh,
    refreshCli,
    runCli,
  } = useMonitor();

  useMonitorToasts({ cli, cliResolved, lastOutcome });
  const trayAvailable = useTrayAvailable();
  const { prefs, update, setAutostart } = usePreferences();
  const [settingsOpen, setSettingsOpen] = useState(false);

  useTheme(prefs.theme);
  useDesktopNotifications({
    prefs,
    snapshot: phase.kind === "ready" ? phase.snapshot : null,
  });

  const pairing = usePairing({
    cliAvailable: cli.available,
    cliResolved,
    onDataChanged: refresh,
  });
  // Session-only: an unpaired machine meets the wizard again next launch.
  const [skipped, setSkipped] = useState(false);
  const [probing, setProbing] = useState(false);

  const openGuide = useCallback(() => {
    void invoke("open_in_browser", { url: GUIDE_URL }).catch(() => undefined);
  }, []);

  const recheckCli = useCallback(async () => {
    setProbing(true);
    try {
      await refreshCli();
      // The actions card reads the snapshot's CLI status — rebuild it now
      // instead of leaving it stale until the next 10 s poll.
      await refresh();
    } finally {
      setProbing(false);
    }
  }, [refresh, refreshCli]);

  if (phase.kind === "error") {
    return (
      <MonitorErrorState
        message={phase.message}
        onRetry={() => void refresh()}
      />
    );
  }
  if (phase.kind === "loading" || pairing.gate.kind === "checking") {
    return <MonitorSkeleton />;
  }

  const snapshot = phase.snapshot;

  const settingsDialog = (
    <SettingsDialog
      open={settingsOpen}
      prefs={prefs}
      onChange={update}
      onOpenChange={setSettingsOpen}
      onToggleAutostart={setAutostart}
    />
  );

  if (pairing.gate.kind === "unpaired" && !skipped) {
    return (
      <>
        <PairingBody
          checking={probing || pairing.rechecking}
          cli={cli}
          firstSync={pairing.firstSync}
          login={pairing.login}
          paused={snapshot.paused}
          rechecking={pairing.rechecking}
          theme={prefs.theme}
          onCancelLogin={() => void pairing.cancelLogin()}
          onChangeTheme={(mode) => update({ theme: mode })}
          onFinish={pairing.finishPairing}
          onOpenGuide={openGuide}
          onOpenSettings={() => setSettingsOpen(true)}
          onRecheckCli={() => void recheckCli()}
          onRecheckPairing={() => void pairing.recheckGate()}
          onReopenBrowser={pairing.reopenBrowser}
          onRetrySync={() => void pairing.runFirstSync()}
          onSkip={() => setSkipped(true)}
          onStartLogin={() => void pairing.startLogin()}
        />
        {settingsDialog}
      </>
    );
  }

  const hasAnyData = snapshot.week.totalTokens > 0 || snapshot.lastRun !== null;

  return (
    <>
      <main className="flex min-h-screen flex-col gap-4 p-4">
        <MonitorHeader
          paused={snapshot.paused}
          theme={prefs.theme}
          onChangeTheme={(mode) => update({ theme: mode })}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {trayAvailable === false ? <TrayNote /> : null}
        {pairing.gate.kind === "unpaired" ? (
          <UnpairedNote onPair={() => setSkipped(false)} />
        ) : null}
        {hasAnyData ? (
          <>
            <UsageCards snapshot={snapshot} />
            <SourceMixCard sources={snapshot.week.sources} />
            <SyncStatusCard snapshot={snapshot} />
          </>
        ) : (
          <MonitorEmptyState cliAvailable={cli.available} />
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
      {settingsDialog}
    </>
  );
}
