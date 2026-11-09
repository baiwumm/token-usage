// Composition layer for the monitor snapshot: turns raw local-file texts
// (read by the Rust layer, never written) into the numbers the UI and the
// tray show. Pure and synchronous — the polling hook only does IO.

import {
  SEVEN_DAY_MS,
  aggregateQueue,
  localDayStartMs,
  type UsageWindow,
} from "@/lib/queue-lines";
import {
  summarizeSyncLog,
  syncFailureStreak,
  type SyncRunSummary,
} from "@/lib/sync-log";

export interface TrackerFileTexts {
  /** queue.jsonl — missing file reads as null (fresh install / no CLI). */
  queue: string | null;
  /** pause.flag.json — `{paused: true, at}` when collection is paused. */
  pause: string | null;
  /** queue.state.json — `{offset, updatedAt}` upload cursor. */
  queueState: string | null;
  /** logs/sync.log — rolling JSONL written by `tokenusage sync`. */
  syncLog: string | null;
}

export interface CliStatus {
  available: boolean;
  version: string | null;
}

export interface MonitorSnapshot {
  today: UsageWindow;
  week: UsageWindow;
  /** Bytes of queue.jsonl the CLI hasn't uploaded yet (size - offset). */
  pendingBytes: number;
  /** Total size of queue.jsonl in bytes (proxy for queue growth). */
  queueBytes: number;
  paused: boolean;
  pausedAt: string | null;
  lastRun: SyncRunSummary | null;
  lastError: { ts: string; msg: string } | null;
  /** Consecutive failed sync runs (D4 failure alert threshold). */
  failureStreak: number;
  /** Message of the newest error in the current failing streak. */
  failureMessage: string | null;
  /** Paired instance dashboard URL (from CLI config, read-only). */
  dashboardUrl: string | null;
  cli: CliStatus;
}

export const DEFAULT_DASHBOARD_URL = "https://token-usage.baiwumm.com";

export function buildMonitorSnapshot(
  files: TrackerFileTexts,
  cli: CliStatus,
  dashboardUrl: string | null,
  nowMs: number = Date.now(),
): MonitorSnapshot {
  const queueText = files.queue ?? "";
  const today = aggregateQueue(queueText, localDayStartMs(nowMs), nowMs);
  const week = aggregateQueue(queueText, nowMs - SEVEN_DAY_MS, nowMs);

  const { pendingBytes, queueBytes } = queueSizes(
    files.queue,
    files.queueState,
  );
  const pause = parsePauseFlag(files.pause);
  const { lastRun, lastError } = summarizeSyncLog(files.syncLog ?? "");
  const failure = syncFailureStreak(files.syncLog ?? "");

  return {
    today,
    week,
    pendingBytes,
    queueBytes,
    paused: pause.paused,
    pausedAt: pause.at,
    lastRun,
    lastError,
    failureStreak: failure.streak,
    failureMessage: failure.message,
    dashboardUrl,
    cli,
  };
}

function queueSizes(
  queueText: string | null,
  stateText: string | null,
): { pendingBytes: number; queueBytes: number } {
  // Byte sizes, not char counts: offset in queue.state.json is a byte
  // cursor. ASCII-heavy JSONL makes char≈byte, but compute honestly.
  const encoder = new TextEncoder();
  const queueBytes = queueText === null ? 0 : encoder.encode(queueText).length;
  let offset = 0;

  if (stateText !== null) {
    try {
      const parsed: unknown = JSON.parse(stateText);

      if (
        parsed !== null &&
        typeof parsed === "object" &&
        typeof (parsed as { offset?: unknown }).offset === "number"
      ) {
        offset = (parsed as { offset: number }).offset;
      }
    } catch {
      // Corrupt state → treat as fully uploaded rather than alarming.
      offset = queueBytes;
    }
  }

  return { pendingBytes: Math.max(0, queueBytes - offset), queueBytes };
}

function parsePauseFlag(text: string | null): {
  paused: boolean;
  at: string | null;
} {
  if (text === null) return { paused: false, at: null };
  try {
    const parsed: unknown = JSON.parse(text);

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      (parsed as { paused?: unknown }).paused === true
    ) {
      const at = (parsed as { at?: unknown }).at;

      return {
        paused: true,
        at: typeof at === "string" ? at : null,
      };
    }

    return { paused: false, at: null };
  } catch {
    // Corrupt flag must never silently stop collection — CLI semantics.
    return { paused: false, at: null };
  }
}
