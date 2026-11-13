import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ShareCardDialog } from "@/components/share-card-dialog";
import { DeviceRow } from "@/components/monitor/device-row";
import { HeatmapSection } from "@/components/monitor/heatmap-section";
import {
  MonitorHeader,
  type MonitorView,
} from "@/components/monitor/monitor-header";
import {
  MonitorEmptyState,
  MonitorErrorState,
  MonitorSkeleton,
} from "@/components/monitor/monitor-states";
import { ProjectReposCard } from "@/components/monitor/project-repos-card";
import { SourceMixCard } from "@/components/monitor/source-mix-card";
import { SettingsDialog } from "@/components/monitor/settings-dialog";
import { SyncStatusCard } from "@/components/monitor/sync-status-card";
import { TopModelsCard } from "@/components/monitor/top-models-card";
import { TrendCard } from "@/components/monitor/trend-card";
import { TrayNote } from "@/components/monitor/tray-note";
import { UnpairedNote } from "@/components/monitor/unpaired-note";
import { UsageCards } from "@/components/monitor/usage-cards";
import { PairingBody } from "@/components/pairing/pairing-body";
import { SessionsBody } from "@/components/sessions/sessions-body";
import { useDesktopNotifications } from "@/hooks/use-notifications";
import { useMonitor } from "@/hooks/use-monitor";
import { useMonitorToasts } from "@/hooks/use-monitor-toasts";
import { usePairing } from "@/hooks/use-pairing";
import { usePreferences } from "@/hooks/use-preferences";
import { useTheme } from "@/hooks/use-theme";
import { useTrayAvailable } from "@/hooks/use-tray";
import { useUpdater } from "@/hooks/use-updater";
import { webUrl, README_URL, REPO_URL } from "@/lib/links";
import { buildShareInput } from "@/lib/share-input";
import { periodLabel } from "@/lib/preferences";
import { periodStartMs } from "@/lib/monitor";

/** Rust forwards the tray's 今日 / 7D / 30D / 总计 choice on this event. */
const TRAY_PERIOD_EVENT = "tray-period";

/**
 * Window orchestration: loading / error gates, the pairing gate (an unpaired
 * machine gets the first-run wizard, skippable for the session), then the
 * usage stack for the normal case. Card order mirrors the web dashboard
 * (D10): stat cards → heatmap → trend → Top models + sources (two columns on
 * wide windows) → projects → recent sessions → collection health.
 */
export function MonitorBody() {
  // Preferences come first: the monitor needs the active period for the tray
  // line, and the header filter writes the same field.
  const { prefs, update, setAutostart } = usePreferences();
  // Any display-format change must repaint the tray usage line and the share
  // card — both are computed outside the render that changed the preference.
  const formatKey = `${prefs.currency}|${prefs.tokenDisplay}|${prefs.tokenUnit}|${prefs.tokenGrouping}`;
  const {
    phase,
    machineId,
    hostname,
    cli,
    cliResolved,
    runningCommand,
    lastOutcome,
    refreshing,
    projectProfiles,
    refresh,
    refreshCli,
    refreshNow,
    runCli,
  } = useMonitor(prefs.period, formatKey);

  useMonitorToasts({ cli, cliResolved, lastOutcome });
  const trayAvailable = useTrayAvailable();

  // Tray period switch (desktop-plan §12.14): pick 今日 / 7D / 30D / 总计 from
  // the tray menu and the header filter + tray usage line follow.
  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    void listen<string>(TRAY_PERIOD_EVENT, (event) => {
      const next = event.payload;

      if (
        next === "today" ||
        next === "7d" ||
        next === "30d" ||
        next === "all"
      ) {
        update({ period: next });
      }
    }).then((stop) => {
      if (disposed) stop();
      else unlisten = stop;
    });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [update]);
  const updater = useUpdater();
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Top-level view switch (D11): the usage stack ⇄ the sessions list.
  const [view, setView] = useState<MonitorView>("monitor");
  const [shareOpen, setShareOpen] = useState(false);

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
      // The sync card reads the snapshot's CLI status — rebuild it now
      // instead of leaving it stale until the next 10 s poll.
      await refresh();
    } finally {
      setProbing(false);
    }
  }, [refresh, refreshCli]);

  // Share-card input follows the header period (D11); null until a snapshot
  // exists / when the active window is empty (the header button disables).
  // Hook order: above the phase early-returns below. Depending on the whole
  // prefs object repaints the share card whenever a display format changes —
  // its numbers come from the formatter singleton, not from props.
  const shareInput = useMemo(
    () =>
      phase.kind === "ready"
        ? buildShareInput({
            hostname,
            period: prefs.period,
            snapshot: phase.snapshot,
          })
        : null,
    [hostname, phase, prefs],
  );

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
  const activeWindow =
    period === "today"
      ? snapshot.today
      : period === "7d"
        ? snapshot.week
        : period === "30d"
          ? snapshot.month
          : snapshot.all;
  const trend = snapshot.trend[period];
  // The cost dialog's daily-cost area chart reads the same trend fold.
  const dailyCost = trend.daily.map((point) => ({
    label: point.key.slice(5),
    cost: point.costUsd,
  }));
  // The CLI config falls back to the public instance; only a paired machine
  // gets deep links (an unpaired one must not point at someone else's host).
  const pairedUrl =
    pairing.gate.kind === "paired" ? snapshot.dashboardUrl : null;
  const projectsUrl = webUrl(pairedUrl, "projects");
  const mixPanelsVisible = prefs.showSources || prefs.showModels;

  const settingsDialog = (
    <SettingsDialog
      open={settingsOpen}
      prefs={prefs}
      updater={updater}
      onChange={update}
      onCheckUpdate={() => void updater.checkForUpdates(true)}
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
      <main className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-4 p-4">
        <MonitorHeader
          cliAvailable={cli.available}
          dashboardUrl={pairedUrl}
          paused={snapshot.paused}
          period={period}
          runningCommand={runningCommand}
          shareAvailable={shareInput !== null}
          theme={prefs.theme}
          view={view}
          onChangeTheme={(mode) => update({ theme: mode })}
          onOpenRepo={() => openUrl(REPO_URL)}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenShare={() => setShareOpen(true)}
          onPeriodChange={(next) => update({ period: next })}
          onRun={(command, args) => void runCli(command, args)}
          onToggleView={setView}
        />
        {view === "sessions" ? (
          <SessionsBody deviceName={hostname ?? "本机"} onOpenUrl={openUrl} />
        ) : (
          <>
            {trayAvailable === false ? <TrayNote /> : null}
            {pairing.gate.kind === "unpaired" ? (
              <UnpairedNote onPair={() => setSkipped(false)} />
            ) : null}
            {hasAnyData ? (
              <>
                <UsageCards period={period} snapshot={snapshot} />
                {prefs.showHeatmap ? (
                  <HeatmapSection
                    nowMs={snapshot.updatedAt}
                    payload={snapshot.heatmap}
                    period={period}
                  />
                ) : null}
                {prefs.showTrend ? <TrendCard trend={trend} /> : null}
                {mixPanelsVisible ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {prefs.showModels ? (
                      <TopModelsCard
                        dailyCost={dailyCost}
                        models={activeWindow.models}
                        sources={activeWindow.sources}
                      />
                    ) : null}
                    {prefs.showSources ? (
                      <SourceMixCard sources={activeWindow.sources} />
                    ) : null}
                  </div>
                ) : null}
                {prefs.showProjects ? (
                  <ProjectReposCard
                    attributedTokens={activeWindow.attributedTokens}
                    nowMs={snapshot.updatedAt}
                    periodLabel={periodLabel(period)}
                    profiles={projectProfiles}
                    projects={activeWindow.projects}
                    projectsUrl={projectsUrl}
                    rows={snapshot.rows}
                    totalTokens={activeWindow.totalTokens}
                    windowStartMs={periodStartMs(period, snapshot.updatedAt)}
                    onOpenUrl={openUrl}
                  />
                ) : null}
                <SyncStatusCard
                  lastOutcome={lastOutcome}
                  refreshing={refreshing}
                  runningCommand={runningCommand}
                  snapshot={snapshot}
                  onRefresh={() => void refreshNow()}
                  onRun={(command, args) => void runCli(command, args)}
                />
              </>
            ) : (
              <MonitorEmptyState cliAvailable={cli.available} />
            )}
          </>
        )}
        <DeviceRow hostname={hostname} machineId={machineId} />
      </main>
      {settingsDialog}
      <ShareCardDialog
        input={shareInput}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
