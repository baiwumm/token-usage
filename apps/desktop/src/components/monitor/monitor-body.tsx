import { invoke } from "@tauri-apps/api/core";
import { Typography } from "@heroui/react";
import { useCallback, useState } from "react";

import { CliActionsCard } from "@/components/monitor/cli-actions-card";
import { DeviceRow } from "@/components/monitor/device-row";
import { HeatmapSection } from "@/components/monitor/heatmap-section";
import { ModelMixCard } from "@/components/monitor/model-mix-card";
import { MonitorHeader } from "@/components/monitor/monitor-header";
import {
  MonitorEmptyState,
  MonitorErrorState,
  MonitorSkeleton,
} from "@/components/monitor/monitor-states";
import { PeriodFilter } from "@/components/monitor/period-filter";
import { ProjectReposCard } from "@/components/monitor/project-repos-card";
import { RecentSessionsCard } from "@/components/monitor/recent-sessions-card";
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
import { useUpdater } from "@/hooks/use-updater";
import { webUrl, README_URL, REPO_URL } from "@/lib/links";

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
    refreshing,
    refresh,
    refreshCli,
    refreshNow,
    runCli,
  } = useMonitor();

  useMonitorToasts({ cli, cliResolved, lastOutcome });
  const trayAvailable = useTrayAvailable();
  const { prefs, update, setAutostart } = usePreferences();
  const updater = useUpdater();
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
    void invoke("open_in_browser", { url: README_URL }).catch(() => undefined);
  }, []);

  const openUrl = useCallback((url: string) => {
    void invoke("open_in_browser", { url }).catch(() => undefined);
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
  const period = prefs.period;
  const activeWindow = period === "today" ? snapshot.today : snapshot.week;
  // The CLI config falls back to the public instance; only a paired machine
  // gets deep links (an unpaired one must not point at someone else's host).
  const pairedUrl =
    pairing.gate.kind === "paired" ? snapshot.dashboardUrl : null;
  const projectsUrl = webUrl(pairedUrl, "projects");
  const mixCardsVisible =
    prefs.showSources || prefs.showModels || prefs.showProjects;

  const settingsDialog = (
    <SettingsDialog
      dashboardUrl={pairedUrl}
      open={settingsOpen}
      prefs={prefs}
      updater={updater}
      onChange={update}
      onCheckUpdate={() => void updater.checkForUpdates(true)}
      onOpenChange={setSettingsOpen}
      onOpenUrl={openUrl}
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
          onOpenRepo={() => openUrl(REPO_URL)}
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
          onOpenRepo={() => openUrl(REPO_URL)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        {trayAvailable === false ? <TrayNote /> : null}
        {pairing.gate.kind === "unpaired" ? (
          <UnpairedNote onPair={() => setSkipped(false)} />
        ) : null}
        {hasAnyData ? (
          <>
            <UsageCards snapshot={snapshot} />
            {prefs.showHeatmap ? (
              <HeatmapSection
                days={snapshot.heatmap.days}
                maxTokens={snapshot.heatmap.maxTokens}
                totalTokens={snapshot.heatmap.totalTokens}
              />
            ) : null}
            {mixCardsVisible ? (
              <div className="flex items-center justify-between gap-3">
                <Typography className="text-muted" type="body-xs">
                  用量构成
                </Typography>
                <PeriodFilter
                  period={period}
                  onChange={(next) => update({ period: next })}
                />
              </div>
            ) : null}
            {prefs.showSources ? (
              <SourceMixCard sources={activeWindow.sources} />
            ) : null}
            {prefs.showModels ? (
              <ModelMixCard models={activeWindow.models} />
            ) : null}
            {prefs.showProjects ? (
              <ProjectReposCard
                attributedTokens={activeWindow.attributedTokens}
                projects={activeWindow.projects}
                projectsUrl={projectsUrl}
                totalTokens={activeWindow.totalTokens}
                onOpenUrl={openUrl}
              />
            ) : null}
            {prefs.showRecentSessions ? (
              <RecentSessionsCard
                nowMs={snapshot.updatedAt}
                sessions={snapshot.recentSessions}
              />
            ) : null}
            <SyncStatusCard
              refreshing={refreshing}
              snapshot={snapshot}
              onRefresh={() => void refreshNow()}
            />
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
        <DeviceRow hostname={hostname} machineId={machineId} />
      </main>
      {settingsDialog}
    </>
  );
}
