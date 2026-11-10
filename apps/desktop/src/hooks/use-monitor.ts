// Polling hook for the monitor: reads the tracker files through the Rust
// bridge every 10 s (and on window focus), composes the snapshot, and pushes
// tray label updates. All files are read-only; the CLI stays the sole writer.
// Individual file failures degrade to null (missing/corrupt tolerated); the
// error phase is reserved for the bridge itself being unusable.

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";

import { formatTokens } from "@/lib/format-tokens";
import {
  buildMonitorSnapshot,
  DEFAULT_DASHBOARD_URL,
  type CliStatus,
  type MonitorSnapshot,
} from "@/lib/monitor";

const REFRESH_MS = 10_000;

interface InstanceConfig {
  baseUrl: string | null;
  dashboardUrl: string | null;
  machineId: string | null;
}

export interface CliRunOutcome {
  command: string;
  resolved: boolean;
  exitCode: number | null;
  outputTail: string;
}

export type MonitorPhase =
  | { kind: "loading" }
  | { kind: "ready"; snapshot: MonitorSnapshot }
  | { kind: "error"; message: string };

async function readTrackerFile(relPath: string): Promise<string | null> {
  try {
    const result = await invoke<string | null>("read_tracker_file", {
      relPath,
    });

    return result ?? null;
  } catch {
    // Missing file, size cap, transient lock — degrade to "no data".
    return null;
  }
}

async function readInstanceConfig(): Promise<InstanceConfig | null> {
  try {
    return await invoke<InstanceConfig>("read_instance_config");
  } catch {
    return null;
  }
}

export function useMonitor() {
  const [phase, setPhase] = useState<MonitorPhase>({ kind: "loading" });
  const [machineId, setMachineId] = useState<string | null>(null);
  const [hostname, setHostname] = useState<string | null>(null);
  const [cli, setCli] = useState<CliStatus>({
    available: false,
    version: null,
  });
  /** True once the first `--version` probe settled — distinguishes "probing"
   * from "confirmed absent" so the pairing gate never flashes the wizard. */
  const [cliResolved, setCliResolved] = useState(false);
  const [runningCommand, setRunningCommand] = useState<string | null>(null);
  const [lastOutcome, setLastOutcome] = useState<CliRunOutcome | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Snapshots embed the CLI status, so the ref is written in the same tick
  // as the probe resolves: a refresh() right after refreshCli() must not
  // compose a snapshot with the previous probe's answer.
  const cliRef = useRef<CliStatus>(cli);

  const refreshCli = useCallback(async () => {
    let info: CliStatus;

    try {
      info = await invoke<CliStatus>("cli_info");
    } catch {
      info = { available: false, version: null };
    }
    cliRef.current = info;
    setCli(info);
    setCliResolved(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [queue, pause, queueState, syncLog, projectRepos, config] =
        await Promise.all([
          readTrackerFile("queue.jsonl"),
          readTrackerFile("pause.flag.json"),
          readTrackerFile("queue.state.json"),
          readTrackerFile("logs/sync.log"),
          readTrackerFile("project.repos.state.json"),
          readInstanceConfig(),
        ]);
      const dashboardUrl =
        config?.dashboardUrl ?? config?.baseUrl ?? DEFAULT_DASHBOARD_URL;
      const snapshot = buildMonitorSnapshot(
        { queue, pause, queueState, syncLog, projectRepos },
        cliRef.current,
        dashboardUrl,
        Date.now(),
      );

      setMachineId(config?.machineId ?? null);
      setPhase({ kind: "ready", snapshot });
      await pushTrayLabels(snapshot);
    } catch (error) {
      setPhase({
        kind: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }, []);

  /** User-initiated refresh: same read path, plus a spinner flag the sync card
   * shows while the poller-triggered calls stay silent. */
  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const runCli = useCallback(
    async (command: string, args: string[] = []) => {
      setRunningCommand(command);
      try {
        const result = await invoke<{
          resolved: boolean;
          exitCode: number | null;
          stdout: string;
          stderr: string;
        }>("run_cli", { args: [command, ...args] });
        const outputTail = [result.stdout, result.stderr]
          .filter(Boolean)
          .join("\n")
          .trimEnd()
          .split(/\r?\n/)
          .slice(-8)
          .join("\n");

        setLastOutcome({
          command,
          resolved: result.resolved,
          exitCode: result.exitCode,
          outputTail: outputTail || (result.exitCode === 0 ? "完成" : "无输出"),
        });
        await refreshCli();
      } catch (error) {
        setLastOutcome({
          command,
          resolved: false,
          exitCode: null,
          outputTail: error instanceof Error ? error.message : String(error),
        });
      } finally {
        setRunningCommand(null);
        await refresh();
      }
    },
    [refresh, refreshCli],
  );

  useEffect(() => {
    void refreshCli();
    void refresh();
    void invoke<{ hostname: string | null }>("tracker_paths")
      .then((paths) => setHostname(paths.hostname))
      .catch(() => setHostname(null));
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    document.addEventListener("visibilitychange", onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh, refreshCli]);

  return {
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
  };
}

async function pushTrayLabels(snapshot: MonitorSnapshot): Promise<void> {
  try {
    await invoke("update_tray", {
      labels: {
        today: `今日 tokens：${formatTokens(snapshot.today.totalTokens)}`,
        status: `采集：${snapshot.paused ? "已暂停" : "正常"}（${formatTokens(snapshot.week.totalTokens)} / 7 天）`,
        pauseAction: snapshot.paused ? "恢复采集" : "暂停采集",
        paused: snapshot.paused,
      },
    });
  } catch {
    // Tray label updates are cosmetic — never block the monitor on them.
  }
}
