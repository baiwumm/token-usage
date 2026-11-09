// Parser for the CLI's rolling sync log (packages/cli writes
// `<trackerDir>/logs/sync.log` as JSONL: one `{ts, msg, ...fields}` object
// per line, ~1 MiB per generation plus one `.1` backup). The desktop monitor
// reads it read-only to surface the last scheduled/auto sync outcome — this
// is the first slice of the D2 data face (docs/desktop-plan.md §4).
//
// Structured lines come from `autoLog` in packages/cli/src/commands/sync.js:
// finished runs carry `phase: "finished"` with parsed_files / buckets /
// inserted / skipped / tokens / sessions_uploaded / sessions_skipped /
// pending_bytes / duration_ms / uploaded; upload failures carry an `error`
// string field (phases "upload", "session-upload", …).

export interface SyncLogEntry {
  ts: string;
  msg: string;
  [field: string]: unknown;
}

export interface SyncRunSummary {
  ts: string;
  parsedFiles: number;
  buckets: number;
  inserted: number;
  skipped: number;
  tokens: number;
  sessionsUploaded: number;
  sessionsSkipped: number;
  pendingBytes: number;
  durationMs: number;
  uploaded: boolean;
}

export interface SyncLogStatus {
  /** Latest `phase: "finished"` run, or null when the log has none. */
  lastRun: SyncRunSummary | null;
  /**
   * Latest error line after lastRun (the log is chronological, so a newer
   * finished run resets it), or null. Surfaces failures like upload errors
   * between scheduled runs without waiting for the next finish line.
   */
  lastError: { ts: string; msg: string } | null;
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function toRunSummary(entry: SyncLogEntry): SyncRunSummary {
  return {
    ts: entry.ts,
    parsedFiles: asNumber(entry.parsed_files),
    buckets: asNumber(entry.buckets),
    inserted: asNumber(entry.inserted),
    skipped: asNumber(entry.skipped),
    tokens: asNumber(entry.tokens),
    sessionsUploaded: asNumber(entry.sessions_uploaded),
    sessionsSkipped: asNumber(entry.sessions_skipped),
    pendingBytes: asNumber(entry.pending_bytes),
    durationMs: asNumber(entry.duration_ms),
    uploaded: entry.uploaded === true,
  };
}

export function isErrorEntry(entry: SyncLogEntry): boolean {
  return typeof entry.error === "string";
}

export function parseSyncLogLine(line: string): SyncLogEntry | null {
  const trimmed = line.trim();

  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (
      parsed !== null &&
      typeof parsed === "object" &&
      typeof (parsed as { ts?: unknown }).ts === "string" &&
      typeof (parsed as { msg?: unknown }).msg === "string"
    ) {
      return parsed as SyncLogEntry;
    }

    return null;
  } catch {
    // Torn tail write or foreign content — the log stays best-effort.
    return null;
  }
}

export interface SyncFailureStreak {
  /** Consecutive failed runs, newest last; 0 when the latest run succeeded. */
  streak: number;
  /** Message of the most recent error line contributing to the streak. */
  message: string | null;
}

/**
 * How many runs in a row failed, for the D4 failure alert.
 *
 * A run is delimited by its `phase:"finished"` line: an error anywhere
 * between two finished lines (or after the last one) marks that run failed.
 * Upload errors still end with a finished line, so counting bare trailing
 * errors would never see them; trailing errors past the last finished line
 * are counted as the in-flight run so a hang shows up too.
 */
export function syncFailureStreak(text: string): SyncFailureStreak {
  let streak = 0;
  let message: string | null = null;
  let runFailed = false;

  for (const line of text.split(/\r?\n/)) {
    const entry = parseSyncLogLine(line);

    if (!entry) continue;

    if (entry.phase === "finished") {
      streak = runFailed ? streak + 1 : 0;
      runFailed = false;
    } else if (isErrorEntry(entry)) {
      runFailed = true;
      message = entry.msg;
    }
  }

  return { streak: runFailed ? streak + 1 : streak, message };
}

export function summarizeSyncLog(text: string): SyncLogStatus {
  let lastRun: SyncRunSummary | null = null;
  let lastError: { ts: string; msg: string } | null = null;

  for (const line of text.split(/\r?\n/)) {
    const entry = parseSyncLogLine(line);

    if (!entry) continue;

    if (entry.phase === "finished") {
      lastRun = toRunSummary(entry);
      // A run that finished supersedes whatever failed before it.
      lastError = null;
    } else if (isErrorEntry(entry)) {
      lastError = { ts: entry.ts, msg: entry.msg };
    }
  }

  return { lastRun, lastError };
}
