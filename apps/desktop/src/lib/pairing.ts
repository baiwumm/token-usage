// Pairing domain logic (desktop-plan D3). The only pairing signal the
// desktop consumes is `tokenusage status --json`'s `device_token_set`
// boolean — the device token itself never leaves the CLI data dir
// (desktop-plan §3/§4). The `device-login` child process is managed in Rust;
// this layer reduces its polls into wizard phases for the UI.
//
// The authorize blob's `device_code` never reaches this layer: whoever holds
// it could poll the server for the freshly minted device token after
// approval, so the Rust reader thread whitelists user_code + verification
// URLs and drops the rest.

import {
  isErrorEntry,
  parseSyncLogLine,
  toRunSummary,
  type SyncRunSummary,
} from "@/lib/sync-log";

export const INSTALL_COMMAND = "npm i -g tokenusage-cli";

/** Wizard gate: is this machine already paired to an instance? */
export type PairingGate =
  { kind: "checking" } | { kind: "paired" } | { kind: "unpaired" };

export interface AuthCode {
  userCode: string;
  verificationUri: string;
  /** `/device?user_code=…` deep link, when the CLI returned one. */
  verificationUriComplete: string | null;
  /** Seconds until the pairing code expires (CLI contract: 900). */
  expiresInSec: number | null;
}

export interface DeviceLoginPoll {
  running: boolean;
  exitCode: number | null;
  code: AuthCode | null;
  outputTail: string;
}

export type LoginPhase =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting"; code: AuthCode | null; expiresAtMs: number | null }
  | { kind: "approved" }
  | { kind: "failed"; message: string };

/** `device_token_set` from the CLI's light status JSON; null = unreadable. */
export function parseStatusLight(text: string | null): boolean | null {
  if (text === null) {
    return null;
  }

  try {
    const parsed: unknown = JSON.parse(text);

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return null;
    }

    return (parsed as { device_token_set?: unknown }).device_token_set === true;
  } catch {
    return null;
  }
}

/**
 * Reduce one child poll into the next login phase. Pure — the hook owns IO
 * and side effects, and only polls while `waiting` (before the spawn
 * resolves, the bridge has no child and would answer "idle"). `expiresAtMs`
 * is stamped once, when the code first arrives: re-deriving it on every
 * poll would push the countdown forward.
 */
export function reduceLoginPoll(
  phase: LoginPhase,
  poll: DeviceLoginPoll,
  nowMs: number,
): { phase: LoginPhase; approved: boolean } {
  if (phase.kind !== "waiting") {
    return { phase, approved: false };
  }

  if (poll.running) {
    if (poll.code && phase.code === null) {
      return {
        phase: {
          kind: "waiting",
          code: poll.code,
          expiresAtMs:
            poll.code.expiresInSec === null
              ? null
              : nowMs + poll.code.expiresInSec * 1000,
        },
        approved: false,
      };
    }

    return { phase, approved: false };
  }

  if (poll.exitCode === 0) {
    return { phase: { kind: "approved" }, approved: true };
  }

  return {
    phase: {
      kind: "failed",
      message: describeLoginFailure(poll.outputTail, poll.exitCode),
    },
    approved: false,
  };
}

/** Last meaningful CLI line wins; fall back to a generic exit-code line. */
export function describeLoginFailure(
  tail: string,
  exitCode: number | null,
): string {
  return (
    lastMeaningfulLine(tail) ??
    (exitCode === null
      ? "未能启动 tokenusage device-login"
      : `配对失败（exit ${exitCode}）`)
  );
}

function lastMeaningfulLine(tail: string): string | null {
  const lines = tail
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines.at(-1) ?? null;
}

/** Output box tail: last N lines, like the actions card on the monitor. */
export function tailOf(text: string, max = 8): string {
  return text.split(/\r?\n/).slice(-max).join("\n").trim();
}

/** `mm:ss` until the pairing code expires (floored at 00:00). */
export function formatCountdown(remainingMs: number): string {
  const totalSec = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export type FirstSyncResult =
  | { kind: "done"; run: SyncRunSummary; warning: string | null }
  | { kind: "error"; message: string }
  | { kind: "none" };

/**
 * Attribute sync.log to the wizard's first `sync --auto` run: only lines
 * stamped at/after the run started count, so an older scheduled run is never
 * mistaken for this one. Unlike the monitor's summary, a finished line does
 * NOT hide an earlier error of the same run — `--auto` logs an upload error
 * and still finishes, and the first sync must surface that failure.
 * `none` = exit 0 without a new line (paused, or another sync held the lock
 * — `--auto` exits quietly in both cases).
 */
export function pickFirstSyncResult(
  syncLogText: string | null,
  startedAtMs: number,
  exit: { exitCode: number | null; outputTail: string },
): FirstSyncResult {
  // Same machine clock on both sides; the slack only absorbs ms rounding.
  const since = startedAtMs - 1000;
  let run: SyncRunSummary | null = null;
  let error: string | null = null;

  for (const line of (syncLogText ?? "").split(/\r?\n/)) {
    const entry = parseSyncLogLine(line);

    if (!entry) continue;
    const at = Date.parse(entry.ts);

    if (!Number.isFinite(at) || at < since) continue;
    if (entry.phase === "finished") {
      run = toRunSummary(entry);
    } else if (isErrorEntry(entry)) {
      error = entry.msg;
    }
  }

  if (run) {
    return { kind: "done", run, warning: error };
  }
  if (error) {
    return { kind: "error", message: error };
  }
  if (exit.exitCode !== 0) {
    return {
      kind: "error",
      message:
        lastMeaningfulLine(exit.outputTail) ??
        (exit.exitCode === null
          ? "未能启动 tokenusage sync"
          : `同步失败（exit ${exit.exitCode}）`),
    };
  }

  return { kind: "none" };
}
