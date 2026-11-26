const os = require("node:os");
const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");
const cp = require("node:child_process");
const { functionUrlFor, fetchFunctionResponse } = require("../lib/function-url");
const { ensurePricingOverlay } = require("../lib/pricing");
const { cloudUsageResetBlocksUpload, finishCloudDeviceUsageReset } = require("../lib/cloud-usage-reset");
const { KIMI_MODEL_REPAIR_KEY, repairKimiModelAttribution } = require("../lib/kimi-model-repair");
const { backupExistingFile } = require("../lib/queue-backup");
const {
  GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY,
  repairGrokQueueFromSessionSnapshots,
} = require("../repairs/grok");
const { repairMimoClaudeMislabel } = require("../repairs/mimo");
const {
  CURSOR_UNKNOWN_MIGRATION_KEY,
  ROLLOUT_CUMULATIVE_DELTA_MIGRATION_KEY,
  migrateCursorUnknownBuckets,
  migrateRolloutCumulativeDeltaBuckets,
} = require("../repairs/legacy-migrations");
const {
  CODEBUDDY_LOG_JSONL_REPAIR_KEY,
  repairCodebuddyLogJsonlOverlap,
} = require("../repairs/codebuddy");
const {
  WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY,
  repairWorkbuddyContextUsage,
} = require("../repairs/workbuddy");
const {
  INGEST_SLUG,
  MAX_INGEST_BUCKETS,
  UPLOAD_BUDGET_MS,
  drainQueueToCloud,
  readQueueBatch,
} = require("../lib/queue-drain");
const {
  reincludeClaudeMemObserverFiles,
  repairClaudeQueueFromGroundTruth,
} = require("../repairs/claude");
const {
  repairDroidDuplicateSessionInflation,
} = require("../repairs/droid");
const {
  repairCodexForkReplayInflation,
  repairCodexInterleavedUsageInflation,
  repairCodexRescanInflation,
} = require("../repairs/codex");
const {
  ZCODE_PRUNE_WINDOW_RESTORE_KEY,
  resolveZcodeRebuildFloorMs,
  zcodeRowTotals,
  buildZcodeRestorationRow,
  repairZcodeNativeUsageMigration,
  repairZcodeInclusiveTokenMigration,
  repairZcodePruneWindowRestore,
} = require("../repairs/zcode");
const { readSqliteJsonRows } = require("../lib/sqlite-reader");
const { buildLauncherPrelude, resolveLauncher, launcherCommand } = require("../lib/runtime-launch");
const { ensureRuntimeCopyFresh } = require("../lib/runtime-refresh");
const { cliEntryPath } = require("../lib/scheduled-task");

const { resolveInstallPaths, resolveZcodeNativeDbPath, resolveMimoNativeDbPath, ensureFlatCursor } = require("../lib/install-resolver");
const { multiInstallParse, mergeBothFileSources } = require("../lib/multi-install-parser");
const { resolveDumateDbPaths, parseDumateIncremental } = require("../lib/dumate");
const wsl = require("../lib/wsl-probe");
const {
  ensureDir,
  readJson,
  writeJson,
  chmod600IfPossible,
  openLock,
  inspectLock,
  updateJsonLocked,
  safeStatSize,
} = require("../lib/fs");
const { physicalJsonlRecords } = require("../lib/jsonl-lines");
const { countRecordOnlyFiles, formatRecordOnlyWarning } = require("../lib/codex-usage-record");
const {
  listRolloutFiles,
  listRolloutFilesDeep,
  readCodexRolloutSnapshot,
  codexSessionIdFromPath,
  filterColdCodexRolloutFiles,
  listClaudeProjectFiles,
  listGeminiSessionFiles,
  listOpencodeMessageFiles,
  readOpencodeDbMessages,
  readOpencodeDbMessagesIncremental,
  readMimoDbMessages,
  readZcodeDbMessages,
  hasZcodeNativeUsageSchema,
  resolveQoderDbPaths,
  resolveQoderCnDbPaths,
  readQoderDbMessages,
  resolveQoderProjectsDir,
  resolveQoderCnProjectsDir,
  listQoderNewSessionFiles,
  parseQoderNewIncremental,
  resolveKiroDbPath,
  resolveKiroJsonlPath,
  resolveKiroBasePath,
  resolveHermesPath,
  resolveCopilotOtelPaths,
  normalizeCopilotDbPath,
  uniqueCopilotDbPaths,
  coalesceCopilotDbStatesByIdentity,
  resolveCopilotSessionStorePaths,
  getCopilotSqliteFingerprint,
  resolveCopilotAppDbPaths,
  parseRolloutIncremental,
  parseClaudeIncremental,
  parseGeminiIncremental,
  parseOpencodeIncremental,
  parseOpencodeDbIncremental,
  parseQoderDbIncremental,
  parseOpenclawIncremental,
  resolveOpenclawSessionFiles,
  resolveOpenclawHome,
  openclawCursorKey,
  resolveClaudeScienceDbPaths,
  readClaudeScienceFrames,
  parseClaudeScienceIncremental,
  parseCursorApiIncremental,
  parseKiroIncremental,
  parseHermesIncremental,
  gooseInstallOwnsCursor,
  zedInstallOwnsCursor,
  hermesInstallOwnsCursor,
  kiroInstallOwnsCursor,
  kiroCliInstallOwnsCursor,
  copilotOtelCursorHasLegacyCliUsage,
  pruneCopilotUsageClaims,
  parseCopilotIncremental,
  parseCopilotSessionStoreIncremental,
  parseCopilotAppDbIncremental,
  resolveKimiWireFiles,
  parseKimiIncremental,
  resolveKimiCodeWireFiles,
  parseKimiCodeIncremental,
  resolveOmpSessionFiles,
  resolveOmpSubagentFiles,
  parseOmpIncremental,
  resolveOmoSessionFiles,
  resolveOmoSubagentFiles,
  parseOmoIncremental,
  omoAgentDirCollidesWithOmp,
  resolvePiSessionFiles,
  parsePiIncremental,
  piAgentDirCollidesWithOmp,
  resolvePrimeAgentSessionFiles,
  parsePrimeAgentIncremental,
  resolveMinimaxCodeSessionFiles,
  parseMinimaxCodeIncremental,
  resolveCraftSessionFiles,
  parseCraftIncremental,
  resolveReasonixTelemetryFiles,
  parseReasonixIncremental,
  resolveMuseSessionFiles,
  parseMuseIncremental,
  resolveGrokBuildSessions,
  parseGrokBuildIncremental,
  resolveAntigravityDbPath,
  listAntigravityTranscriptsWithStatus,
  parseAntigravityIncremental,
  resolveCodebuddyProjectFiles,
  codebuddyJsonlHasUsage,
  parseCodebuddyIncremental,
  resolveWorkbuddyProjectFiles,
  parseWorkbuddyIncremental,
  resolveKiroCliSessionFiles,
  resolveKiroCliDbPath,
  parseKiroCliIncremental,
  resolveKilocodeTaskFiles,
  parseKilocodeIncremental,
  resolveRoocodeTaskFiles,
  parseRoocodeIncremental,
  resolveClineSessionFilesWithStatus,
  parseClineIncremental,
  resolveZedDbPath,
  parseZedIncremental,
  resolveLmstudioLogFiles,
  parseLmstudioIncremental,
  resolveUnslothDbPath,
  parseUnslothIncremental,
  resolveAnythingllmDbPath,
  parseAnythingllmIncremental,
  resolveDevinDbPath,
  parseDevinIncremental,
  resolveGooseDbPath,
  parseGooseIncremental,
  listDroidSettingsFiles,
  parseDroidIncremental,
  droidSessionIdFromPath,
  resolveDroidModel,
  resolveDshSessionFiles,
  parseDshIncremental,
  resolveCommandCodeSessionFiles,
  parseCommandCodeIncremental,
  parseTraeCnApiIncremental,
  parseTraeIncremental,
  bucketKey,
  toUtcHalfHourStart,
  totalsKey,
  claudeMessageDedupKey,
  coerceEpochMs,
  hasZcodeCursorState,
  resolveZcodeInstallPaths,
} = require("../lib/rollout");
const { computeClaudeGroundTruthBuckets } = require("../lib/claude-categorizer");
const { createProgress, renderBar, formatNumber, formatBytes, formatDuration, formatDeviceLine } = require("../lib/progress");
const { buildDeviceIdentity } = require("../lib/device-identity");
const {
  DEFAULTS: AUTO_UPLOAD_DEFAULTS,
  normalizeState: normalizeUploadState,
  decideAutoUpload,
  recordUploadFailure,
  recordUploadSuccess,
  parseRetryAfterMs,
} = require("../lib/upload-throttle");
const { compactPendingQueue, iterateQueueLines, sessionSnapshotMs } = require("../lib/upload-queue");
const { sanitizeBucketForUpload } = require("../lib/ingest-sanitize");
const { normalizeQueueRow } = require("../lib/queue-row-normalize");
const { UsageError, unknownOptionError } = require("../lib/cli-errors");
const AUTO_UPLOAD_CONFIG = {
  intervalMs: 15 * 60_000,
  batchSize: 200,
  maxBatchesSmall: 5,
  maxBatchesLarge: 100,
};
const {
  isCursorInstalled,
  extractCursorSessionToken,
  fetchCursorUsageCsv,
  fetchCursorUsageCsvWithFallback,
  parseCursorCsv,
} = require("../lib/cursor-config");
const { purgeProjectUsage } = require("../lib/project-usage-purge");
const {
  fetchTraeCnUsageWithAuth,
  resolveTraeCnStoragePath,
  isTraeCnUsageEnabled,
} = require("../lib/trae-cn-config");
const {
  fetchFreebuffUsageWithAuth,
  isFreebuffUsageEnabled,
} = require("../lib/freebuff-config");
const { parseFreebuffUsageSummary, isFreebuffConfigured } = require("../lib/freebuff-usage");
const { resolveTraeDbPaths } = require("../lib/trae-db");
const {
  isCodexSessionCursorPath,
  isCursorStoreRetry,
  openCursorStore,
} = require("../lib/cursor-store");
const { resolveTrackerPaths } = require("../lib/tracker-paths");
const { readCloudSyncEnabled } = require("../lib/cloud-sync-prefs");
const { isCollectionPaused, isRunReportEnabled } = require("../lib/collection-pause");
const { createSyncRunTelemetry, resolveSyncTrigger } = require("../lib/sync-report");
const {
  appendUniqueDirs,
  extraScanRootPaths,
  hasAnyScanChild,
  resolveEnvRoot,
  resolveScanRoots,
  scanRootDirState,
} = require("../lib/scan-roots");
const { resolveRuntimeConfig, isLegacyInsforgeBaseUrl } = require("../lib/runtime-config");
const { extractTokenCount } = require("../lib/codex-rollout-parser");
const {
  consumeUsageDelta,
  createUsageDeltaState,
} = require("../lib/codex-token-usage");

const CLAUDE_MEM_OBSERVER_REINCLUDE_KEY = "claudeMemObserverReinclude_2026_05_v3";
const CLAUDE_MEM_OBSERVER_PATH_SEGMENT = "--claude-mem-observer-sessions";
// v1 had a cursor-format bug (wrote plain integer instead of {inode, offset,
// updatedAt}), which made parseClaudeIncremental reread every jsonl from
// byte 0 on the next sync and double everything. v2 fixed the format.
// v3 fixes two latent issues caught by adversarial review:
//   (a) v2 wrote `cursors.hourly.groupQueued[claude|<hour>]` for every
//       repaired bucket. enqueueTouchedBuckets uses presence of that key
//       as the legacy-group marker, so any later sync that touched a
//       claude hour (even just a user-message conv-count++) would re-emit
//       the entire hour as one aggregate row under model=DEFAULT_MODEL,
//       causing a different inflation path. v3 leaves groupQueued alone.
//   (b) v2 only repaired the main queue.jsonl. project.queue.jsonl still
//       carried historical claude-mem observer rows (project_key=
//       "claude-mem/observer-sessions") and the project totals on the
//       Project Usage panel stayed inflated. v3 drops every claude /
//       claude-mem row from project.queue.jsonl too, and resets the
//       matching cursors.projectHourly + project.queue.state offset.
// v4 fixes the dedup short-circuit (issue #64): v3's ground-truth scan
// itself used `if (msgId && reqId)` to build the dedup key, which silently
// disabled dedup for any provider whose jsonl entries lack `requestId`
// (DeepSeek/Kimi/Mimo/MiniMax anthropic-compatible endpoints, plus Claude
// Code's sub-agent / thinking transport paths). The repaired ground truth
// was therefore inflated by 1.6–3.7x on those providers — v3 left it that
// way.
// v6 was bumped in 0.26.3 to re-run the repair with the zero-usage dedup fix
// applied. SHIPPING 0.26.3 caused catastrophic data loss on every upgrader
// whose ~/.claude session jsonls had been pruned by Claude Code's own
// cleanup: the repair does atomic-drop + rescan, so any hour_start no longer
// represented in the on-disk logs is silently removed from queue.jsonl. On
// the reporter's machine this wiped 2.17B claude tokens (-1.27B opus-4-7,
// -474M opus-4-6, -376M sonnet-4-5, -48M haiku, -6M sonnet-4-6). The
// upload-offset reset also propagated the damage to the cloud.
// 0.26.4 HALTS back at v4 so the buggy atomic-rewrite path stops auto-firing
// on existing installs. The dedup fixes in parseClaudeFile /
// categorizeSessionFile / computeClaudeGroundTruthBuckets are KEPT — they are
// correct in isolation, and any future repair will produce the right answer
// for whatever data is actually on disk. A targeted, log-gap-safe mimo
// migration will ship later under its own key.
const CLAUDE_GROUND_TRUTH_REPAIR_KEY = "claudeGroundTruthRepair_2026_05_v4";
// One-time full re-upload: the cloud ingest dropped `conversation_count` to 0
// from 2026-04-18 until the 2026-06-10 field-mapping fix (it read
// `b.conversations`; queue rows carry `conversation_count`). Historical cloud
// rows can only be repaired from each user's local queue.jsonl — resetting the
// upload offset replays the full queue and the ingest's whole-row upsert
// overwrites every historical bucket with the correct conversation counts
// (token columns replay to the same final values: last emission per key wins,
// exactly how the cloud rows were built the first time).
const CLOUD_CONVERSATIONS_BACKFILL_KEY = "cloudConversationsBackfill_2026_06";
// One-time repair (#187): until the codexHashes event-dedup landed, a Codex
// session file rewritten with a new inode (Codex-Manager atomically rewrites
// sessions/ files to patch the provider on every account switch) was re-scanned
// from offset 0 and its tokens re-added to the persistent hourly buckets. This
// rebuilds the codex buckets from disk (event-deduped), atomically drops the
// inflated codex rows from queue.jsonl, and resets the upload offset so the
// corrected values overwrite the cloud. GUARDED: skips if any codex session
// file that previously contributed is no longer on disk (deleted, or moved to
// ~/.codex/archived_sessions/ which sync does not scan) — clearing its bucket
// would lose that history (ref the v6 ground-truth-repair data-loss incident).
const CODEX_RESCAN_DEDUP_REPAIR_KEY = "codexRescanDedupRepair_2026_06";
// One-time repair (#169 follow-up): forked Codex rollouts replay the parent
// session's token history into the child file, and until the same-day burst
// detector landed in rollout.js the parser counted those replayed rows as live
// usage (PR #169's date guard only caught cross-day forks). Cursors sit at EOF
// on every already-parsed file, so the forward fix alone never corrects the
// inflated history. This re-runs the exact #187 guarded rebuild under a new key
// — the rebuild re-parses every codex file with the CURRENT (fork-aware)
// parser, so replay rows are excluded — and inherits all its safety properties
// (unreproducible-session skip, atomic throwaway rebuild, queue strip, upload
// offset reset for the cloud overwrite). Pre-gated: installs with no forked
// rollout on disk carry no fork phantom and mark done without the rebuild.
const CODEX_FORK_REPLAY_REPAIR_KEY = "codexForkReplayRepair_2026_07";
// One-time repair for Codex rollouts that contain token counters from multiple
// interleaved SessionState instances. Older parsers subtracted each cumulative
// total from the most recently observed total, even when it belonged to another
// state, which could turn an ordinary turn into a multi-billion-token delta.
// v2 removes the unreliable multi_agent_version pre-gate and validates every
// contributing rollout before committing the rebuild. The new key is required
// so installs that finalized the original migration on a false negative retry.
const CODEX_USAGE_LINEAGE_REPAIR_KEY = "codexUsageLineageRepair_2026_07_v2";
const LEGACY_BASE_URL_MIGRATION_NOTE = "reset_after_legacy_baseurl_migration_2026_07";
// Keep the one escalated desktop refresh bounded; explicit full syncs can retry
// the same migration without this ceiling when the history needs a deeper scan.
const CODEX_BACKGROUND_LINEAGE_SCAN_MAX_BYTES = 1024 * 1024;
const DROID_DUP_SESSION_REPAIR_KEY = "droidDupSessionInflationRepair_2026_06";
const CODEX_COLD_SCAN_AUDIT_INTERVAL_MS = 24 * 60 * 60 * 1000;
const NOTIFY_LOCK_WAIT_MS = 130_000;
const NOTIFY_LOCK_POLL_MS = 5_000;
// Local API sync requests have a 120-second child-process budget. Reserve at
// least 30 seconds for parsing, persistence, and the response after contention.
const PRIORITY_LOCK_WAIT_MS = 90_000;
const PRIORITY_LOCK_POLL_MS = 250;
const CODEX_COLD_SCAN_AUDIT_MAX_SYNCS = 288;
// 0.57.0 mis-attributed mimocode's mirrored Claude/claude-mem history to
// source=mimo (read the whole DB instead of only providerID=mimo rows). This
// one-time repair purges all source=mimo data from the local queues + cursor
// state so the next sync (providerID-filtered reader) rebuilds it correctly.
const DSH_LEGACY_SOURCE_MIGRATION_KEY = "deepseekHarnessSourceMigration_2026_08";

// #828: ZCode CLI prunes model_usage/turn_usage to ~30 days. The wipe+rescan
// repairs above destroyed pre-window history for late upgraders (and anyone
// whose prune line advanced before the one-shot key fired). This follow-up
// restores pre-window peaks from queue.jsonl.bak.* when the live ledger is
// lower, and the wipe helpers below now preserve hours older than the live
// rebuild floor so a future re-key cannot repeat the loss.
const AUTO_SYNC_SOURCE_ALIASES = new Map([
  // The integration is labelled AStudio everywhere in the CLI; `acode` is only
  // the collector id, so both spellings must reach the same scanner.
  ["astudio", "acode"],
  ["code", "every-code"],
  ["commandcode", "command-code"],
  ["deepseek", "dsh"],
  ["everycode", "every-code"],
  ["kilo", "kilo-cli"],
  ["kilo-code", "kilocode"],
  ["kimi_code", "kimi-code"],
  ["roo-code", "roocode"],
]);
const AUTO_SYNC_SOURCES = new Set([
  "acode",
  "antigravity",
  "anythingllm",
  "claude",
  "claude-science",
  "cline",
  "codebuddy",
  "codex",
  "command-code",
  "copilot",
  "craft",
  "cursor",
  "devin",
  "droid",
  "dumate",
  "dsh",
  "every-code",
  "freebuff",
  "gemini",
  "goose",
  "grok",
  "hermes",
  "kilo-cli",
  "kilocode",
  "kiro",
  "kimi",
  "kimi-code",
  "lmstudio",
  "mimo",
  "minimax-code",
  "muse",
  "omo",
  "omp",
  "opencode",
  "openclaw",
  "pi",
  // The parser existed but the id was missing here, so normalizeSyncSource()
  // rejected `--source prime-agent` and every auto/background run skipped the
  // source entirely.
  "prime-agent",
  "qoder",
  "qoder-cn",
  "reasonix",
  "roocode",
  "trae-cn",
  "trae",
  "unsloth",
  "workbuddy",
  "workbuddy-ai",
  "zcode",
  "zed",
]);
const BACKGROUND_AUTO_SYNC_SOURCES = new Set([
  // Keep unscoped native 5-minute syncs bounded to dated local session trees.
  "acode",
  "codex",
  "every-code",
  "muse",
  "reasonix",
]);

function warnProviderParseFailure(label, err, opts) {
  if (opts?.auto) return;
  process.stderr.write(`${label} sync: ${err && err.message ? err.message : err}\n`);
}

function mergeParseResult(total, next) {
  return {
    recordsProcessed: total.recordsProcessed + next.recordsProcessed,
    eventsAggregated: total.eventsAggregated + next.eventsAggregated,
    bucketsQueued: total.bucketsQueued + next.bucketsQueued,
  };
}

function copilotAppBaselineTotal(baseline) {
  return (
    Math.max(0, Number(baseline?.input) || 0) +
    Math.max(0, Number(baseline?.output) || 0) +
    Math.max(0, Number(baseline?.cached) || 0) +
    Math.max(0, Number(baseline?.reasoning) || 0)
  );
}

function mergeCopilotAppDbStates(primary = {}, alias = {}) {
  const primaryUpdatedAt = Date.parse(primary?.updatedAt || "") || 0;
  const aliasUpdatedAt = Date.parse(alias?.updatedAt || "") || 0;
  const newer = aliasUpdatedAt > primaryUpdatedAt ? alias : primary;
  const sessionTotals = {};
  for (const state of [primary, alias]) {
    for (const [sessionId, baseline] of Object.entries(
      state?.sessionTotals || {},
    )) {
      const current = sessionTotals[sessionId];
      const baselineTotal = copilotAppBaselineTotal(baseline);
      const currentTotal = copilotAppBaselineTotal(current);
      const baselineUpdatedAt = Date.parse(baseline?.updatedAt || "") || 0;
      const currentUpdatedAt = Date.parse(current?.updatedAt || "") || 0;
      if (
        !current ||
        baselineTotal > currentTotal ||
        (baselineTotal === currentTotal &&
          baselineUpdatedAt > currentUpdatedAt)
      ) {
        sessionTotals[sessionId] = baseline;
      }
    }
  }
  return { ...primary, ...newer, sessionTotals };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Auto/scheduled runs are otherwise silent, which leaves --watch consoles and
// any visible task window blank. Log one concise line per phase only when the
// run owns a real terminal; piped hook consumers (stdio ignored) stay quiet.
// Auto-flavored runs ALSO append to the rolling <trackerDir>/logs/sync.log
// (0.2.0): the scheduled task registration no longer depends on a `>>`
// redirect, and TTY-less runs keep a durable trail. The file is JSONL
// (`{ts,msg,...fields}` one per line) so a support request can be diffed, grepped
// by field or fed to a log viewer; the TTY line stays human-readable. Rotation
// keeps one 1 MiB generation (sync.log.1) plus the live file.
const AUTO_LOG_MAX_BYTES = 1_048_576;
let autoLogSinkPath = null;

function setAutoLogSink(filePath) {
  autoLogSinkPath = filePath;
}

function autoLog(message, fields = null) {
  const stamp = new Date().toISOString();
  if (process.stdout.isTTY) {
    process.stdout.write(`[${stamp.replace("T", " ").slice(0, 19)}] ${message}\n`);
  }
  if (autoLogSinkPath) {
    try {
      try {
        const stat = fssync.statSync(autoLogSinkPath);
        if (stat.size > AUTO_LOG_MAX_BYTES) {
          fssync.renameSync(autoLogSinkPath, `${autoLogSinkPath}.1`);
        }
      } catch { /* no live file yet */ }
      fssync.mkdirSync(path.dirname(autoLogSinkPath), { recursive: true });
      const record = { ts: stamp, msg: message, ...(fields || {}) };
      fssync.appendFileSync(autoLogSinkPath, `${JSON.stringify(record)}\n`);
    } catch { /* logging must never break a sync */ }
  }
}

async function acquireSyncLock(
  lockPath,
  opts,
  {
    notifyWaitMs = NOTIFY_LOCK_WAIT_MS,
    notifyPollMs = NOTIFY_LOCK_POLL_MS,
    priorityWaitMs = PRIORITY_LOCK_WAIT_MS,
    priorityPollMs = PRIORITY_LOCK_POLL_MS,
  } = {},
) {
  const waitsForPriority = Boolean(opts.waitForLock || opts.drain || opts.publishAccount);
  let lock = await openLock(lockPath, {
    quietIfLocked: opts.auto || waitsForPriority,
  });
  if (lock) return lock;

  if (waitsForPriority) {
    const deadline = Date.now() + Math.max(0, priorityWaitMs);
    while (!lock && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await sleep(Math.min(Math.max(1, priorityPollMs), remaining));
      lock = await openLock(lockPath, { quietIfLocked: true });
    }
    if (!lock) {
      const error = new Error(
        "SYNC_BUSY: another sync is still running; no refresh was performed",
      );
      error.code = "SYNC_BUSY";
      throw error;
    }
    return lock;
  }

  if (!opts.fromNotify || notifyWaitMs <= 0) return null;

  // One low-frequency waiter coalesces every notify that lands behind an
  // active native/background sync. This avoids both losing the final Codex
  // turn and spawning a fleet of idle retry processes during a long scan.
  const waiter = await openLock(`${lockPath}.notify-wait`, {
    quietIfLocked: true,
  });
  if (!waiter) return null;

  try {
    const deadline = Date.now() + notifyWaitMs;
    while (!lock && Date.now() < deadline) {
      const remaining = deadline - Date.now();
      await sleep(Math.min(Math.max(1, notifyPollMs), remaining));
      lock = await openLock(lockPath, { quietIfLocked: true });
    }
    return lock;
  } finally {
    await waiter.release();
  }
}

const SYNC_SKIP_MARKER = "sync.skip.json";

// A skipped sync used to exit 0 with no output whatsoever, so lock debris left
// by a killed run stalled every parse for a day with no visible signal and
// nothing for `tokenusage status` to report (issue #431). Leave a queryable
// marker that separates ordinary contention (`lock_busy`) from a lease whose
// owner is gone (`lock_debris`, the state that needs attention).
async function recordSyncSkip(trackerDir, lockPath) {
  const holder = await inspectLock(lockPath);
  const reason = holder.exists && holder.pid && !holder.alive ? "lock_debris" : "lock_busy";
  const detail = !holder.exists
    ? "sync lock could not be acquired"
    : holder.pid
      ? `sync lock held by pid ${holder.pid} (${holder.alive ? "running" : "not running"})`
      : "sync lock has no owner record";
  await writeJson(path.join(trackerDir, SYNC_SKIP_MARKER), {
    reason,
    detail,
    at: new Date().toISOString(),
    lockPath,
  });
  return `Sync skipped: ${reason} — ${detail}\n`;
}

async function clearSyncSkip(trackerDir) {
  try {
    await fs.unlink(path.join(trackerDir, SYNC_SKIP_MARKER));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

/**
 * The human summary of one sync run.
 *
 * Pure on purpose: the summary is what ends up pasted into runbooks and issue
 * trackers, so it has to state WHICH machine ran, how much was uploaded (in
 * tokens, not just rows), how many sessions moved, what is still pending and
 * how long it took. Extracted from cmdSync so it can be unit-tested.
 */
function buildSyncSummaryLines({
  deviceIdentity = null,
  totalParsed = 0,
  totalBuckets = 0,
  uploadResult = {},
  sessionUploadSummary = null,
  hasDeviceToken = false,
  pendingBytes = 0,
  drain = false,
  durationMs = 0,
  uploadError = null,
  warning = null,
} = {}) {
  const uploadedTokens = Number(uploadResult.tokens || 0);
  const uploadedCredits = Number(uploadResult.credits || 0);
  const inserted = Number(uploadResult.inserted || 0);
  const rowWord = inserted === 1 ? "row" : "rows";
  const lines = ["Sync finished:"];
  if (deviceIdentity) lines.push(formatDeviceLine(deviceIdentity));
  lines.push(
    `- Parsed files: ${formatNumber(totalParsed)}`,
    `- New 30-min buckets queued: ${formatNumber(totalBuckets)}`,
    hasDeviceToken
      ? `- Uploaded: ${formatNumber(inserted)} ${rowWord} (${formatNumber(uploadedTokens)} tokens), ${formatNumber(uploadResult.skipped)} skipped`
      : "- Uploaded: skipped (no device token)",
  );
  if (hasDeviceToken && uploadedCredits > 0) {
    lines.push(`- Credits: ${formatNumber(uploadedCredits)}`);
  }
  if (sessionUploadSummary) {
    const omittedSuffix = sessionUploadSummary.modelsOmitted > 0
      ? `, models omitted on ${formatNumber(sessionUploadSummary.modelsOmitted)}`
      : "";
    lines.push(
      `- Sessions: ${formatNumber(sessionUploadSummary.uploaded)}/${formatNumber(sessionUploadSummary.pending)} uploaded (upserted ${formatNumber(sessionUploadSummary.upserted)}, skipped ${formatNumber(sessionUploadSummary.skipped)}${omittedSuffix})`,
    );
  }
  if (hasDeviceToken && pendingBytes > 0 && !drain) {
    lines.push(`- Remaining: ${formatBytes(pendingBytes)} pending (run sync again, or use --drain)`);
  }
  lines.push(`- Duration: ${formatDuration(durationMs)}`);
  if (uploadError) lines.push(`- Upload error: ${uploadError.message || uploadError}`);
  if (warning) lines.push(`- Warning: ${warning}`);
  lines.push("");
  return lines;
}

async function cmdSync(argv, context = {}) {
  context = context && typeof context === "object" ? context : {};
  const opts = parseArgs(argv);
  const diagnostics = context && typeof context === "object" ? context.diagnostics : null;
  const cursorStoreOptions = context && typeof context === "object"
    ? context.cursorStoreOptions
    : null;
  const lockWaitOptions = context && typeof context === "object"
    ? context.lockWaitOptions
    : undefined;
  // Narrow test-only seam for TRAE Work CN: deterministic injected fetch + a
  // fixed "now" for the rolling range. Production keeps the global fetch and
  // current time; no public CLI flag/config is introduced.
  const traeCnFetchImpl = context && typeof context === "object"
    ? context.traeCnFetchImpl
    : undefined;
  const traeCnNowMs = context && typeof context === "object"
    ? context.traeCnNowMs
    : undefined;
  const cursorSyncDeps = context && typeof context.cursorSyncDeps === "object"
    ? context.cursorSyncDeps
    : {};
  const syncDiagnostics = diagnostics && typeof diagnostics === "object" ? diagnostics : null;
  const home = context.home || os.homedir();
  const trackerDir = context.trackerDataDir || (await resolveTrackerPaths({ home })).trackerDir;
  // Wall clock for the run summary (the §2.11 run record keeps its own).
  const syncStartedAtMs = Date.now();
  // Collection pause (0.2.0): auto-flavored runs exit silently — no lock, no
  // log line, no run record. A manual sync is the user's explicit request
  // and runs regardless of the flag.
  const autoishSync = opts.auto || opts.background || opts.fromRetry || opts.fromNotify ||
    opts.fromOpenclaw || opts.fromScheduled || context.trigger === "watch";
  if (autoishSync && isCollectionPaused(trackerDir)) return;
  // Auto-flavored runs self-log to the rolling file so neither the scheduled
  // task nor a TTY-less hook run loses its trail.
  if (autoishSync) setAutoLogSink(path.join(trackerDir, "logs", "sync.log"));
  // The init-copied runtime (`<trackerDir>/app`) is what notify hooks, the
  // auto-retry child and the scheduled task spawn when npm's global prefix is
  // gone — but only `init` ever refreshes it, so a globally upgraded CLI
  // leaves a snapshot that still pins the old build's base URL and legacy-host
  // table. An auto run is the last point that touches that snapshot before an
  // upload, so repair the drift here. A stat + marker read when there is no
  // drift; the ~10 MB re-copy only when the versions differ.
  if (autoishSync) {
    await ensureRuntimeCopyFresh({ trackerDir, log: autoLog });
  }
  // §2.11 run telemetry (empty runs included), only when the persisted
  // run-report pref (init --run-report=off) has not disabled it.
  const syncRun = isRunReportEnabled(trackerDir)
    ? createSyncRunTelemetry({
        trigger: resolveSyncTrigger(opts, context),
        cliVersion: require("../../package.json").version,
      })
    : null;
  // Manual CLI sync is a one-time upload request, without changing the toggle.
  // Hooks, native publication and detached retries must honor the saved opt-in.
  const requiresCloudSyncPref = opts.auto || opts.background || opts.fromRetry || opts.fromNotify || opts.fromOpenclaw ||
    Boolean(process.env.TOKENUSAGE_LOCAL_SYNC_ATTEMPT_ID);
  let cloudResetRuntime = null;
  const canUpload = () => !cloudUsageResetBlocksUpload(trackerDir, {
    ownerId: process.env.TOKENUSAGE_CLOUD_OWNER_ID,
    baseUrl: cloudResetRuntime?.baseUrl || process.env.TOKENUSAGE_INSFORGE_BASE_URL,
    deviceId: process.env.TOKENUSAGE_CLOUD_DEVICE_ID,
  }) &&
    (!requiresCloudSyncPref || readCloudSyncEnabled(trackerDir));

  await ensureDir(trackerDir);
  if (opts.fromOpenclaw) {
    await writeOpenclawSignal(trackerDir);
  }

  const lockPath = path.join(trackerDir, "sync.lock");
  const lock = await acquireSyncLock(lockPath, opts, lockWaitOptions);
  if (!lock) {
    // Warn on stderr so the notice reaches interactive and background runs
    // alike without disturbing anything that parses sync's stdout. The marker
    // is diagnostics, not the skip itself: a failed write (Windows' transient
    // EPERM on create) must not turn a skipped sync into a crash — the notice
    // still reaches stderr, just without the marker.
    let notice;
    try {
      notice = await recordSyncSkip(trackerDir, lockPath);
    } catch (error) {
      notice =
        "Sync skipped: sync lock could not be acquired — " +
        `failed to write ${SYNC_SKIP_MARKER} (${error?.code || error?.message || "unknown error"})\n`;
    }
    process.stderr.write(notice);
    return;
  }
  let progress = null;
  try {
    // Marker cleanup can fail for reasons other than ENOENT (permissions, or a
    // directory replacing the expected file). Keep it inside the lease's
    // try/finally so an auxiliary diagnostic never strands the sync lock.
    await clearSyncSkip(trackerDir);
    progress = !opts.auto ? createProgress({ stream: process.stdout }) : null;
    // `--timing`: coarse phase durations for the interactive summary. Purely
    // diagnostic — nothing is persisted, and auto runs never print it.
    const phaseTimings = opts.timing ? [] : null;
    let phaseMarkMs = syncStartedAtMs;
    const markPhase = (label) => {
      if (!phaseTimings) return;
      const now = Date.now();
      phaseTimings.push({ label, ms: now - phaseMarkMs });
      phaseMarkMs = now;
    };
    // Every auto-flavored run (scheduled task, hooks, retry, watch) self-logs:
    // a hidden TTY-less task has no other trail, so --from-scheduled must not
    // fall through to the interactive stdout summary below.
    if (autoishSync) {
      autoLog("Auto sync started — scanning local provider sessions…");
    }
    const configPath = path.join(trackerDir, "config.json");
    const cursorsPath = path.join(trackerDir, "cursors.json");
    const queuePath = path.join(trackerDir, "queue.jsonl");
    const queueStatePath = path.join(trackerDir, "queue.state.json");
    const projectQueuePath = path.join(trackerDir, "project.queue.jsonl");
    const projectQueueStatePath = path.join(trackerDir, "project.queue.state.json");
    const uploadThrottlePath = path.join(trackerDir, "upload.throttle.json");
    const grokSignalPath = path.join(trackerDir, "grok-last-session.json");
    const legacyGrokSignalPath = path.join(trackerDir, "tracker", "grok-last-session.json");

    // Native publication owns backlog and failure-backoff retries on its next
    // five-minute tick. Remove any legacy detached retry marker immediately so
    // an already-sleeping retry process observes the missing marker and exits.
    if (opts.publishAccount || !canUpload()) {
      await clearAutoRetry(trackerDir);
    }

    const config = await readJson(configPath);
    let legacyBaseUrlMigration = null;
    // One-time repair for installs initialized before the 2026-04-19 InsForge
    // project migration (0.5.67): init preserved any persisted config.baseUrl,
    // so those installs kept uploading to the retired b46ug8xu project until
    // its backend went dark on 2026-07-27 — every upload since 503s while the
    // dashboard shows no error (silent cloud outage). Reset the upload offset
    // so the whole local queue replays into the current project, clear the 503
    // backoff, then remove the retired URL as the final commit step. Keeping the
    // URL until every prerequisite succeeds makes an interrupted migration
    // retryable on the next sync. Device tokens are opaque random values looked
    // up by SHA-256 hash in token_device_tokens (not JWT_SECRET-signed);
    // the database was restored into the current project, so preserve the old
    // token unless the local API has already minted a replacement from the
    // user's current login session and passed it through the environment.
    // Ingest is a whole-row upsert per bucket key, making replay idempotent.
    if (config && isLegacyInsforgeBaseUrl(config.baseUrl) &&
        !Object.hasOwn(process.env, "TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN")) {
      const priorQueueState = (await readJson(queueStatePath)) || {};
      // Prepare the replay exactly once. The note survives successful batches,
      // so retryable failures retain both their committed offset and backoff
      // instead of restarting history and hammering the backend on every hook.
      if (priorQueueState.note !== LEGACY_BASE_URL_MIGRATION_NOTE) {
        await writeJson(queueStatePath, {
          ...priorQueueState,
          offset: 0,
          updatedAt: new Date().toISOString(),
          note: LEGACY_BASE_URL_MIGRATION_NOTE,
        });
        try {
          await fs.unlink(uploadThrottlePath);
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
        }
      }
      const replacementDeviceToken =
        typeof process.env.TOKENUSAGE_DEVICE_TOKEN === "string"
          ? process.env.TOKENUSAGE_DEVICE_TOKEN.trim()
          : "";
      const previousDeviceToken =
        typeof config.deviceToken === "string" ? config.deviceToken.trim() : "";
      // Do not commit either the replacement token or URL removal yet. The
      // current backend must accept a token first; otherwise a stale environment
      // token could destroy a valid restored credential and make recovery worse.
      legacyBaseUrlMigration = {
        previousDeviceToken,
        replacementDeviceToken,
        hadPersistedAnonKey: Object.prototype.hasOwnProperty.call(config, "anonKey"),
        persistedAnonKey: config.anonKey,
      };
    }
    // Scan roots (#657). Every producer — hook-fired sync, native background
    // refresh, CLI — must derive the SAME root list, and the cursor store's
    // codexRoots must come from that list: a rollout under a root the store
    // does not know is filed in core.json instead of its per-day shard, so two
    // producers with different roots never see each other's cursor and re-parse
    // the file from byte 0 on every alternation (#639). CODEX_HOME keeps its
    // existing meaning (replaces ~/.codex for this process) but is normalized
    // once by resolveEnvRoot — a relative value is anchored to home, not cwd —
    // and that single value feeds discovery AND the cursor store below.
    // config.scanRoots adds roots for every process.
    const codexNativeValue = resolveEnvRoot("codex", { env: process.env, home }) || path.join(home, ".codex");
    const scanRoots = resolveScanRoots({
      home,
      env: process.env,
      config,
      base: { codex: [codexNativeValue], claude: [path.join(home, ".claude")] },
    });
    const codexCursorRoots = scanRoots.codex.map((entry) => entry.path);
    const cursorStore = await openCursorStore({
      trackerDir,
      cursorsPath,
      codexRoots: codexCursorRoots,
      ...(cursorStoreOptions && typeof cursorStoreOptions === "object"
        ? cursorStoreOptions
        : {}),
    });
    const cursors = cursorStore.cursors;
    const uploadThrottle = normalizeUploadState(await readJson(uploadThrottlePath));
    let uploadThrottleState = uploadThrottle;
    let grokHookSignal = null;
    let grokHookSignalPath = null;
    for (const candidate of [grokSignalPath, legacyGrokSignalPath]) {
      const signal = await readJson(candidate);
      if (signal && typeof signal === "object") {
        grokHookSignal = signal;
        grokHookSignalPath = candidate;
        break;
      }
    }
    let grokHookSignalConsumed = false;

    // Curated pricing overlay (docs/cli-contract.md §2.16): refresh at most
    // once per TTL from the instance's own pricing endpoint. Any failure
    // keeps the last-good cached document (or none — bundled curated then
    // answers exactly as before), so pricing is display-side data that can
    // never fail a collection run. Resolved against the same runtime config
    // the upload path uses, so local/dev instances fetch their own endpoint.
    try {
      const pricingRuntime = resolveRuntimeConfig({ config, env: process.env });
      await ensurePricingOverlay({ baseUrl: pricingRuntime.baseUrl });
    } catch {
      // ensurePricingOverlay already swallows its own failures; this guards
      // the runtime resolution too.
    }

    // Claude Code home — dual-install aware (#307): a Windows host may carry
    // a native ~/.claude plus a WSL install reachable over \\wsl$. Unlike the
    // SQLite providers, Claude UNIONS every allowed install instead of taking
    // resolveAllWin32Paths' single pick: under the default wsl-first mode a
    // WSL ~/.claude would otherwise silently evict the native one from
    // collection — and from the "disk is truth" ground-truth repair below,
    // which would then erase the native history. The file-hash and
    // message-hash dedup layers make the union safe. Native is listed first
    // so the cross-environment file dedup keeps the native copy as primary.
    const claudeNativeHome = path.join(home, ".claude");
    const wslClaudeHome = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
      ? wsl.discoverWslHome(".claude")
      : null;
    const claudeInstallHomes = [];
    if (process.platform !== "win32" || wsl.shouldProbeNative(process.env)) {
      claudeInstallHomes.push(claudeNativeHome);
    }
    if (wslClaudeHome) claudeInstallHomes.push(wslClaudeHome);
    // Extra Claude roots (#657): CLAUDE_CONFIG_DIR of the spawning process and
    // config.scanRoots.claude, additive to the homes above so coverage does not
    // depend on which process spawned this sync. Deduped by realpath at the
    // projects/ level: two profiles may symlink one projects/ dir, and reading
    // it under both spellings would double-parse every file, leaving
    // correctness to the bounded claudeHashes layer.
    const claudeProjectsDirs = appendUniqueDirs(
      claudeInstallHomes.map((h) => path.join(h, "projects")),
      extraScanRootPaths(scanRoots.claude).map((h) => path.join(h, "projects")),
    );
    const xdgDataHome = process.env.XDG_DATA_HOME || path.join(home, ".local", "share");
    const kiloHome = process.env.KILO_HOME || path.join(xdgDataHome, "kilo");

    // OpenClaw session plugin integration: lifecycle hooks request an
    // OpenClaw-only auto sync so unrelated providers do not get walked.
    const openclawSignal = opts.fromOpenclaw
      ? resolveOpenclawSignal({ env: process.env })
      : null;

    const autoSourceScope = resolveAutoSourceScope(opts);
    // `--source` on a manual run has to be a real scan filter. It used to only
    // validate the id (and scope auto/notify retries through
    // resolveAutoSourceScope), so `sync --source zed` still walked every
    // provider tree and reported ~32k parsed files — the documented "scan a
    // single provider" was true only for hooks, which always pass `--auto`.
    const manualSourceScope = resolveManualSourceScope(opts);
    // --background controls local scan breadth; --drain only controls upload
    // depth and lock priority. Plain `sync --drain` remains a full source scan.
    const isBackgroundLightweightSync = opts.auto && opts.background;
    const isBackgroundAllLocalSync = isBackgroundLightweightSync && opts.allLocalSources;
    // A single-source run is not a full scan: the cross-source repairs below
    // rebuild queue rows from the parsed file set, so feeding them one source's
    // files could make them treat the other sources' buckets as stale.
    const isFullSourceScan = !autoSourceScope && !manualSourceScope && !isBackgroundLightweightSync;
    const sourceAllowed = (...sources) => {
      if (Array.isArray(context.scanSources) && !sources.some(source => context.scanSources.includes(source))) return false;
      if (manualSourceScope) return sources.includes(manualSourceScope);
      if (isBackgroundLightweightSync) {
        if (autoSourceScope) {
          return (
            (isBackgroundAllLocalSync || BACKGROUND_AUTO_SYNC_SOURCES.has(autoSourceScope)) &&
            sources.includes(autoSourceScope)
          );
        }
        if (isBackgroundAllLocalSync) {
          return sources.some((source) => AUTO_SYNC_SOURCES.has(source));
        }
        return sources.some((source) => BACKGROUND_AUTO_SYNC_SOURCES.has(source));
      }
      if (autoSourceScope) return sources.includes(autoSourceScope);
      return true;
    };
    // Desktop refreshes are deliberately lightweight, but that also means a
    // migration wired only to full sync would never repair an existing native
    // install. Escalate exactly the first eligible background run: fresh
    // installs have no persisted Codex buckets to repair, while retryable
    // failures remain reserved for an explicit full sync instead of turning
    // every five-minute refresh into a deep historical scan.
    const backgroundCodexUsageMigrationEligible = Boolean(
      isBackgroundLightweightSync &&
      sourceAllowed("codex") &&
      !cursors.migrations?.[CODEX_USAGE_LINEAGE_REPAIR_KEY]
    );
    const hasPersistedCodexUsage = Object.keys(cursors.hourly?.buckets || {})
      .some((key) => key.startsWith("codex|"));
    const backgroundCodexUsageRepair =
      backgroundCodexUsageMigrationEligible && hasPersistedCodexUsage;
    if (backgroundCodexUsageMigrationEligible && !hasPersistedCodexUsage) {
      // A fresh install has no old-parser buckets to repair. Mark it complete
      // before the first bounded parse so the next refresh does not mistake
      // newly parsed, already-correct data for legacy history.
      (cursors.migrations ||= {})[CODEX_USAGE_LINEAGE_REPAIR_KEY] =
        new Date().toISOString();
    }

    const sources = [];
    if (sourceAllowed("codex")) {
      // resolveInstallPaths stays the single authority for wsl-first /
      // native-first / wsl-only / native-only / both selection; requireAnyChild
      // makes it validate that a candidate actually holds sessions/ or
      // archived_sessions/ so an empty WSL ~/.codex shell cannot shadow the
      // native install (issue #codex-wsl-shadow).
      //
      // Pass `wslDir` rather than a pre-resolved home so requireAnyChild is
      // folded INTO the discovery probe: discoverWslHome returns the first
      // distro whose ~/.codex merely exists, so resolving it here first meant a
      // bare shell in an earlier distro won, got rejected as unpopulated, and
      // the populated later distro was never looked at — the same shadowing bug
      // one level down, and a silent disagreement with status.js.
      //
      // union: both installs are real usage on this machine, so a preference
      // mode must not delete one of them. Before this, a populated WSL
      // ~/.codex evicted the native install entirely under the default
      // wsl-first — the session browser (which walks every root, see
      // session-analytics.js providerRoots) showed those Codex sessions while
      // the dashboard counted none of their tokens. Safe because the parser
      // dedups Codex events by sessionUUID:eventTimestamp, so the same session
      // seen under two path spellings collapses instead of double-counting.
      const codexPaths = resolveInstallPaths({
        nativeValue: codexNativeValue,
        wslDir: ".codex",
        requireAnyChild: ["sessions", "archived_sessions"],
        union: true,
      });
      if (codexPaths.native) {
        sources.push({ source: "codex", sessionsDir: path.join(codexPaths.native, "sessions"), inventoryCacheKey: "codexDayInventoryCache" });
        if (!isBackgroundLightweightSync || backgroundCodexUsageRepair) {
          sources.push({ source: "codex", sessionsDir: path.join(codexPaths.native, "archived_sessions"), deep: true });
        }
      }
      if (codexPaths.wsl) {
        sources.push({ source: "codex", sessionsDir: path.join(codexPaths.wsl, "sessions"), inventoryCacheKey: "codexDayInventoryCache" });
        if (!isBackgroundLightweightSync || backgroundCodexUsageRepair) {
          sources.push({ source: "codex", sessionsDir: path.join(codexPaths.wsl, "archived_sessions"), deep: true });
        }
      }
      // Extra Codex roots (#657) from config.scanRoots.codex. Same populated-
      // root rule as requireAnyChild above so an empty shell dir is not walked;
      // the day-inventory cache is keyed by day directory, so sharing it across
      // roots is safe.
      for (const extraRoot of extraScanRootPaths(scanRoots.codex)) {
        if (!hasAnyScanChild(extraRoot, ["sessions", "archived_sessions"])) continue;
        sources.push({ source: "codex", sessionsDir: path.join(extraRoot, "sessions"), inventoryCacheKey: "codexDayInventoryCache" });
        if (!isBackgroundLightweightSync || backgroundCodexUsageRepair) {
          sources.push({ source: "codex", sessionsDir: path.join(extraRoot, "archived_sessions"), deep: true });
        }
      }
    }
    if (sourceAllowed("acode")) {
      const acodeNativeValue =
        process.env.TOKENUSAGE_ACODE_HOME || path.join(home, ".acode");
      const acodePaths = resolveInstallPaths({
        nativeValue: acodeNativeValue,
        wslDir: ".acode",
        requireAnyChild: ["sessions", "archived_sessions"],
        union: true,
      });
      if (acodePaths.native) {
        sources.push({
          source: "acode",
          sessionsDir: path.join(acodePaths.native, "sessions"),
          inventoryCacheKey: "acodeDayInventoryCache",
        });
        if (!isBackgroundLightweightSync) {
          sources.push({
            source: "acode",
            sessionsDir: path.join(acodePaths.native, "archived_sessions"),
            deep: true,
          });
        }
      }
      if (acodePaths.wsl) {
        sources.push({
          source: "acode",
          sessionsDir: path.join(acodePaths.wsl, "sessions"),
          inventoryCacheKey: "acodeDayInventoryCache",
        });
        if (!isBackgroundLightweightSync) {
          sources.push({
            source: "acode",
            sessionsDir: path.join(acodePaths.wsl, "archived_sessions"),
            deep: true,
          });
        }
      }
    }
    if (sourceAllowed("every-code")) {
      const codeNativeValue = process.env.CODE_HOME || path.join(home, ".code");
      const wslCodeDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".code")
        : null;
      const codePaths = resolveInstallPaths({ nativeValue: codeNativeValue, wslValue: wslCodeDir });
      if (codePaths.native) {
        sources.push({ source: "every-code", sessionsDir: path.join(codePaths.native, "sessions") });
      }
      if (codePaths.wsl) {
        sources.push({ source: "every-code", sessionsDir: path.join(codePaths.wsl, "sessions") });
      }
    }

    const rolloutFiles = [];
    const seenSessions = new Set();
    const uniqueSources = sources.filter((entry) => {
      if (seenSessions.has(entry.sessionsDir)) return false;
      seenSessions.add(entry.sessionsDir);
      return true;
    });
    const inventoryCaches = new Map();
    const inventoryCacheKeys = new Set(
      uniqueSources.map((entry) => entry.inventoryCacheKey).filter(Boolean),
    );
    for (const cursorKey of inventoryCacheKeys) {
      const inventoryCache =
        cursors[cursorKey] && typeof cursors[cursorKey] === "object"
          ? cursors[cursorKey]
          : { version: 1, days: {} };
      cursors[cursorKey] = inventoryCache;
      inventoryCaches.set(cursorKey, inventoryCache);
    }
    const sourceFileGroups = await Promise.all(uniqueSources.map((entry) => (
      entry.deep
        ? listRolloutFilesDeep(entry.sessionsDir)
        : listRolloutFiles(entry.sessionsDir, entry.inventoryCacheKey
          ? { dayInventoryCache: inventoryCaches.get(entry.inventoryCacheKey) }
          : undefined)
    )));
    for (let sourceIndex = 0; sourceIndex < uniqueSources.length; sourceIndex++) {
      const entry = uniqueSources[sourceIndex];
      const files = sourceFileGroups[sourceIndex];
      for (const filePath of files) {
        rolloutFiles.push({ path: filePath, source: entry.source });
      }
    }

    if (isFullSourceScan) {
      await cursorStore.materializeAllCodexState(cursors);
      await migrateRolloutCumulativeDeltaBuckets({ cursors, queuePath, rolloutFiles });
      const codexRescanRepairRan = await repairCodexRescanInflation({
        cursors,
        queuePath,
        queueStatePath,
        projectQueuePath,
        projectQueueStatePath,
        rolloutFiles,
      });
      const codexForkRepairRan = await repairCodexForkReplayInflation({
        cursors,
        queuePath,
        queueStatePath,
        projectQueuePath,
        projectQueueStatePath,
        rolloutFiles,
        legacyRepairRan: codexRescanRepairRan,
      });
      await repairCodexInterleavedUsageInflation({
        cursors,
        queuePath,
        queueStatePath,
        projectQueuePath,
        projectQueueStatePath,
        rolloutFiles,
        legacyRepairRan: codexRescanRepairRan || codexForkRepairRan,
      });
      await repairDroidDuplicateSessionInflation({ cursors, queuePath, queueStatePath });
      await repairMimoClaudeMislabel({
        cursors,
        queuePath,
        queueStatePath,
        projectQueuePath,
        projectQueueStatePath,
      });
    } else if (backgroundCodexUsageRepair) {
      await cursorStore.materializeAllCodexState(cursors);
      try {
        await repairCodexInterleavedUsageInflation({
          cursors,
          queuePath,
          queueStatePath,
          projectQueuePath,
          projectQueueStatePath,
          rolloutFiles,
          maxLineageScanBytes: CODEX_BACKGROUND_LINEAGE_SCAN_MAX_BYTES,
        });
      } catch (err) {
        warnProviderParseFailure("Codex usage lineage repair", err, opts);
      } finally {
        // Rebuild failures intentionally leave the migration key unset so a
        // future full sync can retry. Record a retryable sentinel here to keep
        // routine native background refreshes bounded after that first attempt.
        const migrations = (cursors.migrations ||= {});
        if (!migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY]) {
          migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY] = {
            skipped: true,
            reason: "background_repair_requires_full_sync",
            at: new Date().toISOString(),
          };
        }
      }
    }

    const codexColdSkipEnabled = opts.auto && sourceAllowed("codex");
    const deferredCodexAuditSyncs = codexColdSkipEnabled
      ? await cursorStore.readDeferredCodexAuditSyncs()
      : 0;
    const codexColdAuditDue = codexColdSkipEnabled
      ? isCodexColdScanAuditDue(cursors, Date.now(), deferredCodexAuditSyncs)
      : false;
    let codexColdFilter = codexColdSkipEnabled
      ? await filterColdCodexRolloutFiles({
          rolloutFiles,
          cursors,
          codexCursorStore: cursorStore,
          projectEnabled: true,
          auditDue: codexColdAuditDue,
          diagnostics: syncDiagnostics,
        })
      : { rolloutFiles, skipped: 0 };
    const rolloutFilesForParse = codexColdFilter.rolloutFiles;
    let codexCursorLoadRestarted = false;
    if (!codexColdSkipEnabled && sourceAllowed("codex")) {
      const loadResult = await cursorStore.loadCodexFilesForPaths(
        rolloutFilesForParse,
        cursors,
      );
      codexCursorLoadRestarted = Boolean(loadResult?.restarted);
    }

    // Plugin-triggered sync points at one specific session file; a normal full
    // sync also passively scans every on-disk OpenClaw transcript so usage is
    // captured even when the session plugin never fires (issue #264). The scan
    // is gated to full syncs except for gateway lifecycle signals. A scoped
    // agent_end reads only its transcript or its session in the agent database,
    // and the ordinary background tick stays cheap. The
    // event-identity dedup makes the plugin and passive paths idempotent, so
    // overlap on the same file is safe.
    //
    // Keyed by openclawCursorKey, not the raw path: that is the same identity
    // the parser assigns cursors by, so a plugin-supplied path and a scanned
    // path that differ only in Windows casing collapse to one entry instead of
    // being parsed twice.
    const openclawSessionFiles = new Map();
    if (openclawSignal?.sessionFile) {
      openclawSessionFiles.set(openclawCursorKey(openclawSignal.sessionFile), {
        path: openclawSignal.sessionFile,
        source: "openclaw",
      });
      for (const dbPath of [
        path.join(openclawSignal.openclawHome, "agents", openclawSignal.agentId, "agent", "openclaw-agent.sqlite"),
        path.join(openclawSignal.openclawHome, "agents", openclawSignal.agentId, "openclaw-agent.sqlite"),
      ]) {
        if (!(await fs.stat(dbPath).catch(() => null))?.isFile()) continue;
        openclawSessionFiles.set(openclawCursorKey(dbPath), {
          path: dbPath, source: "openclaw", sessionId: openclawSignal.sessionId,
        });
        break;
      }
    }
    if ((isFullSourceScan || (opts.fromOpenclaw && !openclawSignal)) && sourceAllowed("openclaw")) {
      try {
        for (const f of await resolveOpenclawSessionFiles(process.env)) {
          const key = openclawCursorKey(f);
          if (!openclawSessionFiles.has(key) || f.endsWith(".sqlite")) {
            openclawSessionFiles.set(key, { path: f, source: "openclaw" });
          }
        }
      } catch (err) {
        warnProviderParseFailure("OpenClaw", err, opts);
      }
    }
    const openclawFiles = Array.from(openclawSessionFiles.values());

    if (progress?.enabled) {
      progress.start(
        `Parsing ${renderBar(0)} 0/${formatNumber(rolloutFilesForParse.length)} files | buckets 0`,
      );
    }

    let parseResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    let codexParseSucceeded = false;
    let codexFallbackRetryRan = Boolean(
      codexColdFilter.restarted || codexCursorLoadRestarted,
    );
    const runCodexParse = (files) => parseRolloutIncremental({
      rolloutFiles: files,
      cursors,
      codexEventStore: Array.isArray(cursors.codexHashes)
        ? null
        : cursorStore.codexEventStore,
      queuePath,
      projectQueuePath,
      diagnostics: syncDiagnostics,
      onProgress: (p) => {
        if (!progress?.enabled) return;
        const pct = p.total > 0 ? p.index / p.total : 1;
        progress.update(
          `Parsing ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(
            p.bucketsQueued,
          )}`,
        );
      },
    });
    try {
      parseResult = await runCodexParse(rolloutFilesForParse);
      codexParseSucceeded = true;
    } catch (err) {
      if (isCursorStoreRetry(err)) {
        await cursorStore.loadCodexFilesForPaths(rolloutFiles, cursors);
        codexColdFilter = { rolloutFiles, skipped: 0, restarted: true };
        codexFallbackRetryRan = true;
        if (syncDiagnostics) {
          syncDiagnostics.cold_skipped = 0;
          syncDiagnostics.parse_candidates = rolloutFiles.reduce(
            (count, entry) => count + (
              typeof entry === "string" || !entry?.source || entry.source === "codex"
                ? 1
                : 0
            ),
            0,
          );
        }
        parseResult = await runCodexParse(rolloutFiles);
        codexParseSucceeded = true;
      } else if (err?.code === "TOKENUSAGE_CURSOR_STORE_CORRUPT") {
        throw err;
      } else {
        warnProviderParseFailure("Codex", err, opts);
      }
    }
    const codexAuditRecorded = codexColdSkipEnabled && codexParseSucceeded;
    if (codexAuditRecorded) {
      recordCodexColdScanAudit(cursors, {
        fullAudit: codexColdAuditDue || codexFallbackRetryRan,
        skipped: codexColdFilter.skipped,
        deferredSyncs: deferredCodexAuditSyncs,
      });
    }

    let openclawResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("openclaw") && openclawFiles.length > 0) {
      // Parses plugin-triggered and/or passively discovered session files.
      try {
        openclawResult = await parseOpenclawIncremental({
          sessionFiles: openclawFiles,
          cursors,
          queuePath,
          projectQueuePath,
          source: "openclaw",
        });
      } catch (err) {
        warnProviderParseFailure("OpenClaw", err, opts);
      }
    }

    let openclawFallback = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("openclaw")) {
      try {
        openclawFallback = await applyOpenclawTotalsFallback({
          trackerDir,
          signal: openclawSignal,
          cursors,
          queuePath,
          projectQueuePath,
        });
      } catch (err) {
        warnProviderParseFailure("OpenClaw", err, opts);
      }
    }
    openclawResult.filesProcessed += openclawFallback.filesProcessed;
    openclawResult.eventsAggregated += openclawFallback.eventsAggregated;
    openclawResult.bucketsQueued += openclawFallback.bucketsQueued;

    let claudeFiles = [];
    if (sourceAllowed("claude")) {
      const seenClaudeFiles = new Set();
      for (const dir of claudeProjectsDirs) {
        for (const f of await listClaudeProjectFiles(dir)) {
          if (!seenClaudeFiles.has(f)) {
            seenClaudeFiles.add(f);
            claudeFiles.push(f);
          }
        }
      }
    }
    if (isFullSourceScan) {
      await reincludeClaudeMemObserverFiles({ cursors, claudeFiles, queuePath, queueStatePath });
      // The ground-truth repair rebuilds every Claude queue row from the roots
      // it is given. A configured root that is absent or unreadable right now
      // (unmounted volume, permissions) may still hold history that an earlier
      // scoped sync queued, so rebuilding without it would erase that history.
      // The same applies one level down: listClaudeProjectFiles turns a read
      // error on projects/ into an empty listing, so an unreadable projects/
      // would let the repair run against nothing and mark itself complete. An
      // ABSENT projects/ is fine for a NEW root (a profile with no sessions
      // yet) but not for one the cursor store shows has supplied files before:
      // then the directory vanished and rebuilding without it would erase its
      // history. Defer in both cases: the migration key stays unset and the
      // repair runs on a later full scan once the root is back. Ordinary
      // scanning still proceeds.
      const cursorFilePaths = Object.keys(cursors.files || {});
      const rootPreviouslySuppliedFiles = (rootPath) => {
        const prefix = path.join(rootPath, "projects") + path.sep;
        return cursorFilePaths.some((filePath) => filePath.startsWith(prefix));
      };
      const unavailableClaudeRoots = scanRoots.claude
        .filter((entry) => {
          if (entry.origin === "native") return false;
          if (!entry.exists) return true;
          const projectsState = scanRootDirState(path.join(entry.path, "projects"));
          if (projectsState.error !== null) return true;
          return !projectsState.exists && rootPreviouslySuppliedFiles(entry.path);
        })
        .map((entry) => entry.path);
      if (unavailableClaudeRoots.length > 0) {
        if (!opts.auto) {
          process.stderr.write(
            `Claude ground-truth repair deferred: configured scan root(s) unavailable: ${unavailableClaudeRoots.join(", ")}\n`,
          );
        }
      } else {
        await repairClaudeQueueFromGroundTruth({
          cursors,
          queuePath,
          queueStatePath,
          projectQueuePath,
          projectQueueStatePath,
          rootDirs: claudeProjectsDirs,
        });
      }
    }
    let claudeResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (claudeFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(
          `Parsing Claude ${renderBar(0)} 0/${formatNumber(claudeFiles.length)} files | buckets 0`,
        );
      }
      try {
        claudeResult = await parseClaudeIncremental({
          projectFiles: claudeFiles,
          cursors,
          queuePath,
          projectQueuePath,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Claude ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(
                p.bucketsQueued,
              )}`,
            );
          },
          source: "claude",
        });
      } catch (err) {
        warnProviderParseFailure("Claude", err, opts);
      }
    }

    let geminiPaths = null;
    if (sourceAllowed("gemini") || sourceAllowed("antigravity")) {
      const geminiNativeValue = process.env.GEMINI_HOME || path.join(home, ".gemini");
      const wslGeminiDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".gemini")
        : null;
      geminiPaths = resolveInstallPaths({ nativeValue: geminiNativeValue, wslValue: wslGeminiDir });
    }

    let geminiFiles = [];
    if (sourceAllowed("gemini") && geminiPaths) {
      const fileSets = [];
      if (geminiPaths.native) {
        fileSets.push(await listGeminiSessionFiles(path.join(geminiPaths.native, "tmp")));
      }
      if (geminiPaths.wsl) {
        fileSets.push(await listGeminiSessionFiles(path.join(geminiPaths.wsl, "tmp")));
      }
      const seen = new Set();
      for (const set of fileSets) {
        for (const f of set) {
          if (!seen.has(f)) {
            seen.add(f);
            geminiFiles.push(f);
          }
        }
      }
    }
    let geminiResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (geminiFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(
          `Parsing Gemini ${renderBar(0)} 0/${formatNumber(geminiFiles.length)} files | buckets 0`,
        );
      }
      try {
        geminiResult = await parseGeminiIncremental({
          sessionFiles: geminiFiles,
          cursors,
          queuePath,
          projectQueuePath,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Gemini ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(
                p.bucketsQueued,
              )}`,
            );
          },
          source: "gemini",
        });
      } catch (err) {
        warnProviderParseFailure("Gemini", err, opts);
      }
    }

    let antigravityFiles = [];
    let antigravityInventoryComplete = true;
    if (sourceAllowed("antigravity") && geminiPaths) {
      const knownAntigravityFiles = new Set(
        Object.keys(cursors.files || {}).filter((filePath) => resolveAntigravityDbPath(filePath)),
      );
      const fileSets = [];
      if (geminiPaths.native) {
        fileSets.push(
          await listAntigravityTranscriptsWithStatus(geminiPaths.native, knownAntigravityFiles),
        );
      }
      if (geminiPaths.wsl) {
        fileSets.push(
          await listAntigravityTranscriptsWithStatus(geminiPaths.wsl, knownAntigravityFiles),
        );
      }
      antigravityInventoryComplete = fileSets.every((set) => set.complete);
      const seen = new Set();
      for (const set of fileSets) {
        for (const f of set.files) {
          if (!seen.has(f)) {
            seen.add(f);
            antigravityFiles.push(f);
          }
        }
      }
    }
    let antigravityResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (antigravityFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(
          `Parsing Antigravity ${renderBar(0)} 0/${formatNumber(antigravityFiles.length)} files | buckets 0`,
        );
      }
      try {
        antigravityResult = await parseAntigravityIncremental({
          sessionFiles: antigravityFiles,
          cursors,
          queuePath,
          projectQueuePath,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Antigravity ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(
                p.bucketsQueued,
              )}`,
            );
          },
          source: "antigravity",
          inventoryComplete: antigravityInventoryComplete,
        });
      } catch (err) {
        warnProviderParseFailure("Antigravity", err, opts);
      }
    }

    let opencodeResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("opencode")) {
      const opencodeStorageNativeValue = process.env.OPENCODE_HOME || path.join(xdgDataHome, "opencode");
      const wslOpencodeStorageDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".local/share/opencode")
        : null;
      const storagePaths = resolveInstallPaths({
        nativeValue: opencodeStorageNativeValue,
        wslValue: wslOpencodeStorageDir,
      });

      const opencodeDbNativeValue = process.env.OPENCODE_HOME || path.join(xdgDataHome, "opencode");
      const wslOpencodeDbDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".local/share/opencode")
        : null;
      const dbPaths = resolveInstallPaths({
        nativeValue: opencodeDbNativeValue,
        wslValue: wslOpencodeDbDir,
      });

      const parseOpencodeForInstall = async (options) => {
        const { dbDir, cursors, messageFiles } = options;
        let filesResult = { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
        if (messageFiles.length > 0) {
          filesResult = await parseOpencodeIncremental({
            ...options,
            messageFiles,
          });
        }

        let dbResult = { messagesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
        if (dbDir) {
          const dbPath = path.join(dbDir, "opencode.db");
          const dbRead = readOpencodeDbMessagesIncremental(
            dbPath,
            cursors?.opencode?.dbCursor,
          );
          if (dbRead.messages.length > 0 || dbRead.cursor) {
            dbResult = await parseOpencodeDbIncremental({
              ...options,
              dbMessages: dbRead.messages,
              dbCursor: dbRead.cursor,
              dbPath,
              opencodeCursorStore: cursorStore,
            });
          }
        }

        return {
          recordsProcessed: filesResult.filesProcessed + dbResult.messagesProcessed,
          eventsAggregated: filesResult.eventsAggregated + dbResult.eventsAggregated,
          bucketsQueued: filesResult.bucketsQueued + dbResult.bucketsQueued,
        };
      };

      const opencodePaths = {
        native: storagePaths.native || dbPaths.native,
        wsl: storagePaths.wsl || dbPaths.wsl,
      };
      const installKeys = Object.keys(opencodePaths).filter((key) => opencodePaths[key]);
      const messageFilesByInstall = {};
      for (const key of installKeys) {
        messageFilesByInstall[key] = storagePaths[key]
          ? await listOpencodeMessageFiles(path.join(storagePaths[key], "storage"))
          : [];
      }
      const storedOpencode = cursors.opencode;
      const storedNamespaced = Boolean(
        storedOpencode &&
        typeof storedOpencode === "object" &&
        (storedOpencode.native !== undefined || storedOpencode.wsl !== undefined),
      );
      if (
        storedNamespaced !== (installKeys.length > 1) ||
        Object.values(messageFilesByInstall).some((files) => files.length > 0)
      ) {
        await cursorStore.materializeAllOpencodeState();
      }

      let multiResult;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          multiResult = await multiInstallParse({
            paths: opencodePaths,
            parserFn: parseOpencodeForInstall,
            providerName: "opencode",
            cursors,
            queuePath,
            projectQueuePath,
            getParams: (_p, key) => ({
              dbDir: dbPaths[key],
              messageFiles: messageFilesByInstall[key] || [],
              opencodeCursorNamespace: installKeys.length > 1 ? key : "flat",
            }),
            onProgress: (p) => {
              if (!progress?.enabled) return;
              const pct = p.total > 0 ? p.index / p.total : 1;
              progress.update(
                `Parsing Opencode (${p.install || "default"}) ${renderBar(pct)} ${formatNumber(
                  p.index,
                )}/${formatNumber(p.total)} | buckets ${formatNumber(p.bucketsQueued)}`,
              );
            },
            source: "opencode",
          });
          break;
        } catch (error) {
          if (!isCursorStoreRetry(error) || attempt > 0) throw error;
        }
      }

      opencodeResult = {
        filesProcessed: multiResult.recordsProcessed,
        eventsAggregated: multiResult.eventsAggregated,
        bucketsQueued: multiResult.bucketsQueued,
      };
    }

    let qoderResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("qoder")) {
      const qoderPaths = resolveQoderDbPaths({
        home,
        env: process.env,
        platform: process.platform,
      });
      if (qoderPaths.native || qoderPaths.wsl) {
        if (progress?.enabled) {
          progress.start(`Parsing Qoder ${renderBar(0)} | buckets 0`);
        }
        try {
          const result = await multiInstallParse({
            paths: qoderPaths,
            parserFn: async ({ dbPath, ...rest }) => {
              const dbMessages = await readQoderDbMessages(dbPath);
              const parsed = await parseQoderDbIncremental({ dbMessages, dbPath, ...rest });
              return {
                recordsProcessed: parsed.messagesProcessed || 0,
                eventsAggregated: parsed.eventsAggregated || 0,
                bucketsQueued: parsed.bucketsQueued || 0,
              };
            },
            providerName: "qoder",
            cursors,
            queuePath,
            projectQueuePath,
            getParams: (dbPath) => ({ dbPath }),
            onProgress: makeProviderProgress("Qoder"),
          });
          qoderResult = {
            recordsProcessed: result.recordsProcessed || 0,
            eventsAggregated: result.eventsAggregated || 0,
            bucketsQueued: result.bucketsQueued || 0,
          };
        } catch (err) {
          warnProviderParseFailure("Qoder", err, opts);
        }
      }
    }

    // Qoder new (JSONL) — com.qoder.app.stable / ~/.qoder/projects (2026-08+)
    // The new Electron app no longer writes SharedClientCache/local.db; all
    // recent sessions live in ~/.qoder/projects as flat JSONL with credit-based
    // usage. Parse them into the same "qoder" source so history is continuous.
    // The legacy DB block above remains as a fallback for pre-migration rows.
    if (sourceAllowed("qoder")) {
      try {
        const projectsDir = resolveQoderProjectsDir({ home, env: process.env });
        const sessionFiles = await listQoderNewSessionFiles(projectsDir);
        if (sessionFiles.length > 0) {
          if (progress?.enabled) {
            progress.start(`Parsing Qoder (new) ${renderBar(0)} | buckets 0`);
          }
          const parsed = await parseQoderNewIncremental({
            sessionFiles,
            cursors,
            queuePath,
            projectQueuePath,
            onProgress: makeProviderProgress("Qoder (new)"),
            sourceKey: "qoder",
            cursorKey: "qoderNew",
          });
          qoderResult = {
            recordsProcessed: qoderResult.recordsProcessed + (parsed.messagesProcessed || 0),
            eventsAggregated: qoderResult.eventsAggregated + (parsed.eventsAggregated || 0),
            bucketsQueued: qoderResult.bucketsQueued + (parsed.bucketsQueued || 0),
          };
        }
      } catch (err) {
        warnProviderParseFailure("Qoder (new)", err, opts);
      }
    }

    // ── Qoder CN (国内版) — same SharedClientCache/local.db schema, separate
    // Application Support/QoderCN data directory. Tracked as its own source
    // with its own cursor namespace: the two DBs each number rowids from 1, so
    // a shared cursor would mis-dedup across installs.
    let qoderCnResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("qoder-cn")) {
      const qoderCnPaths = resolveQoderCnDbPaths({
        home,
        env: process.env,
        platform: process.platform,
      });
      if (qoderCnPaths.native || qoderCnPaths.wsl) {
        if (progress?.enabled) {
          progress.start(`Parsing Qoder CN ${renderBar(0)} | buckets 0`);
        }
        try {
          const result = await multiInstallParse({
            paths: qoderCnPaths,
            parserFn: async ({ dbPath, ...rest }) => {
              const dbMessages = await readQoderDbMessages(dbPath, { label: "Qoder CN" });
              const parsed = await parseQoderDbIncremental({
                dbMessages,
                dbPath,
                sourceKey: "qoder-cn",
                cursorKey: "qoder-cn",
                ...rest,
              });
              return {
                recordsProcessed: parsed.messagesProcessed || 0,
                eventsAggregated: parsed.eventsAggregated || 0,
                bucketsQueued: parsed.bucketsQueued || 0,
              };
            },
            providerName: "qoder-cn",
            cursors,
            queuePath,
            projectQueuePath,
            getParams: (dbPath) => ({ dbPath }),
            onProgress: makeProviderProgress("Qoder CN"),
          });
          qoderCnResult = {
            recordsProcessed: result.recordsProcessed || 0,
            eventsAggregated: result.eventsAggregated || 0,
            bucketsQueued: result.bucketsQueued || 0,
          };
        } catch (err) {
          warnProviderParseFailure("Qoder CN", err, opts);
        }
      }
    }

    // Qoder CN new (JSONL) — the new CN app (com.qodercn.app.stable) writes
    // ~/.qoder-cn/projects, a sibling of the international ~/.qoder/projects.
    // Keep the divergence guard: if a user (or a future app build) points both
    // resolvers at the same directory, the same JSONL files must not count
    // under two sources.
    if (sourceAllowed("qoder-cn")) {
      try {
        const cnProjectsDir = resolveQoderCnProjectsDir({ home, env: process.env });
        const intlProjectsDir = resolveQoderProjectsDir({ home, env: process.env });
        const projectsDirKey = (p) => {
          const normalized = path.normalize(p);
          return process.platform === "win32" ? normalized.toLowerCase() : normalized;
        };
        if (projectsDirKey(cnProjectsDir) !== projectsDirKey(intlProjectsDir)) {
          const sessionFiles = await listQoderNewSessionFiles(cnProjectsDir);
          if (sessionFiles.length > 0) {
            if (progress?.enabled) {
              progress.start(`Parsing Qoder CN (new) ${renderBar(0)} | buckets 0`);
            }
            const parsed = await parseQoderNewIncremental({
              sessionFiles,
              cursors,
              queuePath,
              projectQueuePath,
              onProgress: makeProviderProgress("Qoder CN (new)"),
              sourceKey: "qoder-cn",
              cursorKey: "qoderCnNew",
            });
            qoderCnResult = {
              recordsProcessed: qoderCnResult.recordsProcessed + (parsed.messagesProcessed || 0),
              eventsAggregated: qoderCnResult.eventsAggregated + (parsed.eventsAggregated || 0),
              bucketsQueued: qoderCnResult.bucketsQueued + (parsed.bucketsQueued || 0),
            };
          }
        }
      } catch (err) {
        warnProviderParseFailure("Qoder CN (new)", err, opts);
      }
    }

    // ── Claude Science (Anthropic's local research workbench, issue #246) ──
    // Per-frame token usage lives on the `frames` table of operon-cli.db.
    // Passive, incremental, subtract-on-change. There can be more than one DB:
    // multi-org installs keep one per org, and on Windows the app runs inside
    // WSL so the DB is on the distro home.
    let claudeScienceResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("claude-science")) {
      // Resolution is inside the error isolation too: it touches the filesystem
      // and (on Windows) probes WSL, and a throw here would abort cmdSync before
      // any provider's buckets are written, not just this one's.
      let claudeScienceDbPaths = [];
      try {
        claudeScienceDbPaths = resolveClaudeScienceDbPaths({ home, env: process.env });
      } catch (err) {
        warnProviderParseFailure("Claude Science", err, opts);
      }
      if (claudeScienceDbPaths.length > 0 && progress?.enabled) {
        progress.start(`Parsing Claude Science ${renderBar(0)} | buckets 0`);
      }
      for (const claudeScienceDbPath of claudeScienceDbPaths) {
        try {
          const dbRows = await readClaudeScienceFrames(claudeScienceDbPath);
          const parsed = await parseClaudeScienceIncremental({
            dbRows,
            cursors,
            queuePath,
            onProgress: makeProviderProgress("Claude Science"),
          });
          claudeScienceResult = mergeParseResult(claudeScienceResult, {
            recordsProcessed: parsed.recordsProcessed || 0,
            eventsAggregated: parsed.eventsAggregated || 0,
            bucketsQueued: parsed.bucketsQueued || 0,
          });
        } catch (err) {
          warnProviderParseFailure("Claude Science", err, opts);
        }
      }
    }

    async function parseOpencodeDbForInstall({ dbPath, readFn, source, cursorKey, ...rest }) {
      if (!dbPath || !fssync.existsSync(dbPath)) {
        return { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
      }
      const dbMessages = readFn(dbPath);
      if (dbMessages.length === 0) return { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
      const result = await parseOpencodeDbIncremental({ dbMessages, dbPath, source, cursorKey, ...rest });
      return {
        recordsProcessed: result.messagesProcessed || 0,
        eventsAggregated: result.eventsAggregated || 0,
        bucketsQueued: result.bucketsQueued || 0,
      };
    }

    // ── Kilo CLI (kilo.ai @kilocode/plugin — OpenCode-fork SQLite) ──
    let kiloResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("kilo-cli")) {
      const kiloNativeValue = process.platform === "win32" && typeof process.env.APPDATA === "string"
        ? path.join(process.env.APPDATA.trim(), "kilo", "kilo.db")
        : path.join(kiloHome, "kilo.db");
      const wslKiloDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".local/share/kilo")
        : null;
      const kiloPaths = resolveInstallPaths({ nativeValue: kiloNativeValue, wslValue: wslKiloDir ? path.join(wslKiloDir, "kilo.db") : null });
      if (kiloPaths.native || kiloPaths.wsl) {
        if (progress?.enabled) progress.start(`Parsing Kilo CLI ${renderBar(0)} | buckets 0`);
        try {
          kiloResult = await multiInstallParse({
            paths: kiloPaths, parserFn: parseOpencodeDbForInstall, providerName: "kiloCli",
            cursors, getParams: (p) => ({ dbPath: p, readFn: readOpencodeDbMessages, source: "kilo-cli", cursorKey: "kiloCli" }),
            queuePath, projectQueuePath, onProgress: makeProviderProgress("Kilo CLI"),
          });
        } catch (err) { warnProviderParseFailure("Kilo CLI", err, opts); }
      }
    }

    let dumateResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("dumate")) {
      const dumateDbPaths = resolveDumateDbPaths({ home });
      if (dumateDbPaths.length > 0) {
        if (progress?.enabled) progress.start(`Parsing DuMate ${renderBar(0)} | buckets 0`);
        try {
          dumateResult = await parseDumateIncremental({
            dbPaths: dumateDbPaths, cursors, queuePath, projectQueuePath,
            onProgress: makeProviderProgress("DuMate"),
          });
        } catch (err) { warnProviderParseFailure("DuMate", err, opts); }
      }
    }

    // ── Mimo (mimocode — OpenCode-fork SQLite) ──
    // readMimoDbMessages filters out mirrored Claude Code rows to avoid
    // double-counting usage already counted as source=claude.
    let mimoResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("mimo")) {
      const mimoNativeValue = resolveMimoNativeDbPath({ home });
      const wslMimoDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".local/share/mimocode")
        : null;
      const mimoPaths = resolveInstallPaths({ nativeValue: mimoNativeValue, wslValue: wslMimoDir ? path.join(wslMimoDir, "mimocode.db") : null });
      if (mimoPaths.native || mimoPaths.wsl) {
        if (progress?.enabled) progress.start(`Parsing Mimo ${renderBar(0)} | buckets 0`);
        try {
          mimoResult = await multiInstallParse({
            paths: mimoPaths, parserFn: parseOpencodeDbForInstall, providerName: "mimo",
            cursors, getParams: (p) => ({ dbPath: p, readFn: readMimoDbMessages, source: "mimo", cursorKey: "mimo" }),
            queuePath, projectQueuePath, onProgress: makeProviderProgress("Mimo"),
          });
        } catch (err) { warnProviderParseFailure("Mimo", err, opts); }
      }
    }

    // ── ZCode (Z.ai's coding agent — OpenCode-fork SQLite) ──
    let zcodeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("zcode")) {
      const zcodeNativeValue = resolveZcodeNativeDbPath({ home });
      const wslZcodeDir = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".zcode")
        : null;
      const zcodeWslValue = wslZcodeDir ? path.join(wslZcodeDir, "cli", "db", "db.sqlite") : null;
      const zcodePaths = resolveZcodeInstallPaths(
        { nativeValue: zcodeNativeValue, wslValue: zcodeWslValue }, process.env,
        { cursors },
      );
      if (zcodePaths.native || zcodePaths.wsl) {
        const mode = wsl.getWslMode(process.env);
        if (process.platform === "win32" && ["native-first", "wsl-first"].includes(mode) &&
            !cursors.zcodeInstallSelection && hasZcodeCursorState(cursors)) {
          // Preserve legacy ownership before a repair can clear old buckets,
          // even when the selected database currently has no rows to parse.
          cursors.zcodeInstallSelection = {
            mode, zcodeHome: process.env.ZCODE_HOME?.trim() || null,
            dbPath: zcodePaths.native || zcodePaths.wsl,
          };
          cursorStore.requiresCommit = true;
        }
        if (progress?.enabled) progress.start(`Parsing ZCode ${renderBar(0)} | buckets 0`);
        try {
          const nativeUsageAvailable = [zcodePaths.native, zcodePaths.wsl]
            .filter(Boolean)
            .some((dbPath) => hasZcodeNativeUsageSchema(dbPath));
          const zcodeDbPaths = [zcodePaths.native, zcodePaths.wsl].filter(Boolean);
          const zcodeRebuildFloorMs = resolveZcodeRebuildFloorMs(zcodeDbPaths);
          if (nativeUsageAvailable) {
            await repairZcodeNativeUsageMigration({
              cursors,
              queuePath,
              queueStatePath,
              projectQueuePath,
              projectQueueStatePath,
              rebuildFloorMs: zcodeRebuildFloorMs,
            });
          }
          await repairZcodeInclusiveTokenMigration({
            cursors,
            queuePath,
            queueStatePath,
            projectQueuePath,
            projectQueueStatePath,
            rebuildFloorMs: zcodeRebuildFloorMs,
          });
          await repairZcodePruneWindowRestore({
            cursors,
            queuePath,
            queueStatePath,
            dbPaths: zcodeDbPaths,
          });
          zcodeResult = await multiInstallParse({
            paths: zcodePaths, parserFn: parseOpencodeDbForInstall, providerName: "zcode",
            cursors, getParams: (p) => ({ dbPath: p, readFn: readZcodeDbMessages, source: "zcode", cursorKey: "zcode" }),
            queuePath, projectQueuePath, onProgress: makeProviderProgress("ZCode"),
          });
          if (zcodeResult.recordsProcessed > 0) {
            if (process.platform === "win32" && ["native-first", "wsl-first"].includes(mode)) {
              cursors.zcodeInstallSelection = {
                mode, zcodeHome: process.env.ZCODE_HOME?.trim() || null,
                dbPath: zcodePaths.native || zcodePaths.wsl,
              };
            } else {
              delete cursors.zcodeInstallSelection;
            }
          }
        } catch (err) { warnProviderParseFailure("ZCode", err, opts); }
      }
    }

    function makeProviderProgress(label) {
      return (p) => {
        if (!progress?.enabled) return;
        const pct = p.total > 0 ? p.index / p.total : 1;
        progress.update(
          `Parsing ${label} ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} records | buckets ${formatNumber(p.bucketsQueued)}`,
        );
      };
    }

    // ── DeepSeek Harness — passive read of ~/.dsh/sessions session logs ──
    let dshResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0, deferredMigrations: 0 };
    if (sourceAllowed("dsh")) {
      await migrateLegacyDeepseekHarnessSource({ cursors, queuePath, queueStatePath });
      const dshSessionFiles = await resolveDshSessionFiles(process.env);
      if (dshSessionFiles.length > 0) {
        if (progress?.enabled) {
          progress.start(
            `Parsing DeepSeek Harness ${renderBar(0)} 0/${formatNumber(
              dshSessionFiles.length,
            )} sessions | buckets 0`,
          );
        }
        try {
          dshResult = await parseDshIncremental({
            sessionFiles: dshSessionFiles,
            cursors,
            queuePath,
            onProgress: makeProviderProgress("DeepSeek Harness"),
          });
          if (dshResult.deferredMigrations > 0) {
            warnProviderParseFailure(
              "DeepSeek Harness",
              new Error(
                `${dshResult.deferredMigrations} artifact migration(s) deferred; inspect cursors.dsh.deferredMigrations and retry after the replacement is complete`,
              ),
              opts,
            );
          }
        } catch (err) {
          warnProviderParseFailure("DeepSeek Harness", err, opts);
        }
      }
    }

    // ── Command Code (`cmd`) — passive read of ~/.commandcode session logs ──
    let commandCodeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("command-code")) {
      try {
        const commandCodeSessionFiles = await resolveCommandCodeSessionFiles(process.env);
        // Empty discovery preserves durable usage history. Native I/O failures
        // remain visible; optional WSL failures do not suppress native usage.
        if (commandCodeSessionFiles.length > 0 || cursors.commandCode) {
          if (progress?.enabled) {
            progress.start(
              `Parsing Command Code ${renderBar(0)} 0/${formatNumber(
                commandCodeSessionFiles.length,
              )} sessions | buckets 0`,
            );
          }
          commandCodeResult = await parseCommandCodeIncremental({
            sessionFiles: commandCodeSessionFiles,
            cursors,
            queuePath,
            projectQueuePath,
            onProgress: makeProviderProgress("Command Code"),
          });
        }
      } catch (err) {
        warnProviderParseFailure("Command Code", err, opts);
      }
    }

    // ── LM Studio and Unsloth Studio — passive inference usage ──
    let lmstudioResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("lmstudio")) {
      const lmstudioLogFiles = await resolveLmstudioLogFiles(process.env);
      if (lmstudioLogFiles.length > 0) {
        if (progress?.enabled) {
          progress.start(
            `Parsing LM Studio ${renderBar(0)} 0/${formatNumber(lmstudioLogFiles.length)} logs | buckets 0`,
          );
        }
        try {
          lmstudioResult = await parseLmstudioIncremental({
            logFiles: lmstudioLogFiles,
            cursors,
            queuePath,
            onProgress: makeProviderProgress("LM Studio"),
          });
        } catch (err) {
          warnProviderParseFailure("LM Studio", err, opts);
        }
      }
    }

    let unslothResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("unsloth")) {
      const unslothDbPath = resolveUnslothDbPath(process.env);
      if (unslothDbPath && fssync.existsSync(unslothDbPath)) {
        if (progress?.enabled) progress.start(`Parsing Unsloth ${renderBar(0)} | buckets 0`);
        try {
          unslothResult = await parseUnslothIncremental({
            dbPath: unslothDbPath,
            cursors,
            queuePath,
            onProgress: makeProviderProgress("Unsloth"),
          });
        } catch (err) {
          warnProviderParseFailure("Unsloth", err, opts);
        }
      }
    }

    // ── AnythingLLM Desktop (workspace_chats.response.metrics) ──
    let anythingllmResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("anythingllm")) {
      const anythingllmDbPath = resolveAnythingllmDbPath(process.env);
      if (anythingllmDbPath && fssync.existsSync(anythingllmDbPath)) {
        if (progress?.enabled) progress.start(`Parsing AnythingLLM ${renderBar(0)} | buckets 0`);
        try {
          anythingllmResult = await parseAnythingllmIncremental({
            dbPath: anythingllmDbPath,
            cursors,
            queuePath,
            onProgress: makeProviderProgress("AnythingLLM"),
          });
        } catch (err) {
          warnProviderParseFailure("AnythingLLM", err, opts);
        }
      }
    }

    // ── Devin CLI (Cognition) — SQLite message_nodes chat_message metrics ──
    let devinResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("devin")) {
      const devinDbPath = resolveDevinDbPath(process.env);
      if (devinDbPath && fssync.existsSync(devinDbPath)) {
        if (progress?.enabled) progress.start(`Parsing Devin ${renderBar(0)} | buckets 0`);
        try {
          devinResult = await parseDevinIncremental({
            dbPath: devinDbPath,
            cursors,
            queuePath,
            projectQueuePath,
            onProgress: makeProviderProgress("Devin"),
          });
        } catch (err) {
          warnProviderParseFailure("Devin", err, opts);
        }
      }
    }

    // ── Kilo Code VS Code extension (Cline-style ui_messages.json) ──
    const kilocodeTaskFiles = sourceAllowed("kilocode")
      ? mergeBothFileSources({ resolveFiles: resolveKilocodeTaskFiles, env: process.env })
      : [];
    let kilocodeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (kilocodeTaskFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(
          `Parsing Kilo Code ${renderBar(0)} 0/${formatNumber(kilocodeTaskFiles.length)} tasks | buckets 0`,
        );
      }
      try {
        kilocodeResult = await parseKilocodeIncremental({
          taskFiles: kilocodeTaskFiles,
          cursors,
          queuePath,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Kilo Code ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(
                p.total,
              )} tasks | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Kilo Code", err, opts);
      }
    }

    // ── Goose (Block) — SQLite sessions with cumulative tokens per session ──
    const gooseDbPath = resolveGooseDbPath(process.env);
    let gooseResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("goose")) {
      const gooseMode = wsl.getWslMode(process.env);
      if (gooseMode === "both" && process.platform === "win32") {
        const home = os.homedir();
        const appData = process.env.APPDATA || path.join(home, "AppData", "Roaming");
        const nativeDb = path.join(appData, "goose", "sessions", "sessions.db");
        const wslDir = wsl.shouldProbeWsl(process.env) ? wsl.discoverWslHome(".local/share/goose/sessions") : null;
        const wslDb = wslDir ? path.join(wslDir, "sessions.db") : null;
        const goosePaths = resolveInstallPaths({ nativeValue: nativeDb, wslValue: wslDb });
        if (goosePaths.native || goosePaths.wsl) {
          if (progress?.enabled) progress.start(`Parsing Goose ${renderBar(0)} 0 sessions | buckets 0`);
          try {
            gooseResult = await multiInstallParse({
              paths: goosePaths, parserFn: parseGooseIncremental, providerName: "goose",
              cursors, getParams: (p) => ({ dbPath: p }), queuePath, onProgress: gooseOnProgress,
              detectInstall: gooseInstallOwnsCursor,
            });
          } catch (err) { warnProviderParseFailure("Goose", err, opts); }
        }
      } else if (gooseDbPath && fssync.existsSync(gooseDbPath)) {
        if (progress?.enabled) progress.start(`Parsing Goose ${renderBar(0)} 0 sessions | buckets 0`);
        ensureFlatCursor(cursors, "goose", process.env);
        try {
          gooseResult = await parseGooseIncremental({
            dbPath: gooseDbPath, cursors, queuePath, onProgress: gooseOnProgress,
          });
        } catch (err) { warnProviderParseFailure("Goose", err, opts); }
      }
    }

    // ── Droid (Factory CLI) — passive reader for ~/.factory/sessions/*.settings.json ──
    const droidSettingsFiles = sourceAllowed("droid")
      ? mergeBothFileSources({ resolveFiles: listDroidSettingsFiles, env: process.env })
      : [];
    let droidResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (droidSettingsFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(
          `Parsing Droid ${renderBar(0)} 0/${formatNumber(droidSettingsFiles.length)} sessions | buckets 0`,
        );
      }
      try {
        droidResult = await parseDroidIncremental({
          settingsFiles: droidSettingsFiles,
          cursors,
          queuePath,
          projectQueuePath,
          // Full-scan sync: drop cursor entries for any session whose
          // settings.json has disappeared off disk so cursors.droid stays
          // bounded by the actual on-disk session count.
          prune: true,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Droid ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(
                p.total,
              )} sessions | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Droid", err, opts);
      }
    }

    // ── Zed Agent (all providers; cumulative-delta over SQLite threads) ──
    const zedDbPath = resolveZedDbPath(process.env);
    let zedResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("zed")) {
      const zedMode = wsl.getWslMode(process.env);
      if (zedMode === "both" && process.platform === "win32") {
        const home = os.homedir();
        const local = process.env.LOCALAPPDATA || path.join(home, "AppData", "Local");
        const nativeDb = path.join(local, "Zed", "threads", "threads.db");
        const wslThreadsDir = wsl.shouldProbeWsl(process.env) ? wsl.discoverWslHome(".local/share/zed/threads") : null;
        const wslDb = wslThreadsDir ? path.join(wslThreadsDir, "threads.db") : null;
        const zedPaths = resolveInstallPaths({ nativeValue: nativeDb, wslValue: wslDb });
        if (zedPaths.native || zedPaths.wsl) {
          if (progress?.enabled) progress.start(`Parsing Zed Agent ${renderBar(0)} 0 threads | buckets 0`);
          try {
            zedResult = await multiInstallParse({
              paths: zedPaths, parserFn: parseZedIncremental, providerName: "zed",
              cursors, getParams: (p) => ({ dbPath: p }), queuePath, onProgress: zedOnProgress,
              detectInstall: zedInstallOwnsCursor,
            });
          } catch (err) { warnProviderParseFailure("Zed Agent", err, opts); }
        }
      } else if (zedDbPath && fssync.existsSync(zedDbPath)) {
        if (progress?.enabled) progress.start(`Parsing Zed Agent ${renderBar(0)} 0 threads | buckets 0`);
        ensureFlatCursor(cursors, "zed", process.env);
        try {
          zedResult = await parseZedIncremental({
            dbPath: zedDbPath, cursors, queuePath, onProgress: zedOnProgress,
          });
        } catch (err) { warnProviderParseFailure("Zed Agent", err, opts); }
      }
    }

    // ── Roo Code VS Code extension (Cline-derived; rooveterinaryinc.roo-cline) ──
    const roocodeTaskFiles = sourceAllowed("roocode") ? resolveRoocodeTaskFiles(process.env) : [];
    let roocodeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (roocodeTaskFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(
          `Parsing Roo Code ${renderBar(0)} 0/${formatNumber(roocodeTaskFiles.length)} tasks | buckets 0`,
        );
      }
      try {
        roocodeResult = await parseRoocodeIncremental({
          taskFiles: roocodeTaskFiles,
          cursors,
          queuePath,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Roo Code ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(
                p.total,
              )} tasks | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Roo Code", err, opts);
      }
    }

    // ── Cline (CLI v3 / desktop app — ~/.cline/data/sessions) ──
    let clineResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("cline")) {
      try {
        const clineScan = resolveClineSessionFilesWithStatus(process.env);
        const clineSessionFiles = clineScan.files;
        for (const failure of clineScan.errors) {
          warnProviderParseFailure("Cline", failure.error, opts);
        }
        if (progress?.enabled && clineSessionFiles.length > 0) {
          progress.start(
            `Parsing Cline ${renderBar(0)} 0/${formatNumber(clineSessionFiles.length)} transcripts | buckets 0`,
          );
        }
        clineResult = await parseClineIncremental({
          sessionFiles: clineSessionFiles,
          scanCompleteRoots: clineScan.completedRoots,
          cursors,
          queuePath,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Cline ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(
                p.total,
              )} transcripts | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Cline", err, opts);
      }
    }

    // ── Cursor (API-based) ──
    // One-time migration: earlier CLI versions mis-parsed the Cursor CSV after
    // Cursor inserted new "Cloud Agent ID"/"Automation ID" columns, writing
    // cursor records under model="unknown". Purge those local buckets, emit
    // zero retractions so the cloud upserts overwrite them to zero, and reset
    // the incremental cursor so the fixed parser re-fetches all affected rows.
    if (isFullSourceScan) {
      await migrateCursorUnknownBuckets({ cursors, queuePath });
    }

    let cursorResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const cursorInstalled = cursorSyncDeps.isInstalled || isCursorInstalled;
    const cursorAuthExtractor = cursorSyncDeps.extractAuth || extractCursorSessionToken;
    const cursorUsageFetcher = cursorSyncDeps.fetchUsageCsv || fetchCursorUsageCsv;
    if (sourceAllowed("cursor") && cursorInstalled({ home })) {
      const cursorAuth = cursorAuthExtractor({ home });
      if (cursorAuth) {
        try {
          if (progress?.enabled) {
            progress.start(`Fetching Cursor usage...`);
          }
          const csvText = await fetchCursorUsageCsvWithFallback({
            cookies: cursorAuth.cookies,
            cookie: cursorAuth.cookie,
            cookieFetcher: cursorUsageFetcher,
          });
          const records = parseCursorCsv(csvText);
          if (records.length > 0) {
            if (progress?.enabled) {
              progress.start(
                `Parsing Cursor ${renderBar(0)} 0/${formatNumber(records.length)} records | buckets 0`,
              );
            }
            cursorResult = await parseCursorApiIncremental({
              records,
              cursors,
              queuePath,
              onProgress: (p) => {
                if (!progress?.enabled) return;
                const pct = p.total > 0 ? p.index / p.total : 1;
                progress.update(
                  `Parsing Cursor ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(
                    p.total,
                  )} records | buckets ${formatNumber(p.bucketsQueued)}`,
                );
              },
              source: "cursor",
            });
          }
        } catch (err) {
          if (!opts.auto) {
            process.stderr.write(`Cursor sync: ${err.message}\n`);
          }
        }
      }
    }

    let traeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("trae")) {
      try {
        traeResult = await parseTraeIncremental({
          cursors, queuePath, onProgress: makeProviderProgress("TRAE"),
        });
        for (const { database, message } of traeResult.errors) {
          process.stderr.write(`TRAE sync: could not read ${database}: ${message}. Will retry on the next sync.\n`);
        }
        if (traeResult.recordsSkipped > 0 && !opts.auto) {
          process.stderr.write(`TRAE sync: skipped ${traeResult.recordsSkipped} records with unsupported usage metadata.\n`);
        }
        if (traeResult.estimatedRecords > 0 && !opts.auto) {
          process.stderr.write(`TRAE sync: ${traeResult.estimatedRecords} Gemini records have repaired thought or cache counters, marked as estimated.\n`);
        }
        if (traeResult.unpricedRecords > 0 && !opts.auto) {
          process.stderr.write(`TRAE sync: ${traeResult.unpricedRecords} multi-request turns include earlier input without a cache split; it is counted in token totals but left out of cost.\n`);
        }
      } catch (err) { warnProviderParseFailure("TRAE", err); }
    }

    // ── Trae Work CN (国内版) — account-level usage API ──
    // A simple explicit rolling 30-day window captured once per sync (no
    // cursor checkpoints / full-history import / page retries / background
    // requests). Runs only when the user has opted in via
    // TOKENUSAGE_TRAE_CN_USAGE=1 (the read transmits the locally stored
    // sign-in JWT to TRAE's official endpoint, so it is never default-on),
    // the sync is non-lightweight, the source is allowed, and the CN storage
    // file exists — which excludes both ordinary background and `--auto
    // --background --all-local-sources`. Fetching goes through the
    // storage-backed helper so its single 401/403 reread/retry is used; an
    // empty response is a successful no-op; each window is bounded to 100
    // pages/2,000 rows and an over-capacity window is split into staggered
    // sub-windows (still over capacity at the finest allowed granularity, or
    // any other fetch/page/schema/auth failure) skips the parser and leaves
    // prior data untouched while unrelated providers continue.
    let traeCnResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    // The local TRAE database and the account-level API describe the same
    // sessions. Local per-request rows are finer-grained, so they win: running
    // both would count every session twice in the dashboard (both render as
    // "Trae"). Only skip the API when local collection is actually enabled.
    const traeCnRequested =
      !isBackgroundLightweightSync &&
      isTraeCnUsageEnabled(process.env) &&
      sourceAllowed("trae-cn");
    const traeCnBlockedByLocal =
      traeCnRequested && sourceAllowed("trae") && resolveTraeDbPaths(process.env).length > 0;
    if (traeCnBlockedByLocal) {
      if (!opts.auto) {
        process.stderr.write(
          "TRAE Work CN sync: local TRAE database is present; account-level usage is skipped to avoid double counting (local per-request data takes precedence).\n",
        );
      }
    } else if (traeCnRequested) {
      const nowMs = Number.isFinite(traeCnNowMs) ? traeCnNowMs : Date.now();
      const fetchImpl = typeof traeCnFetchImpl === "function" ? traeCnFetchImpl : fetch;
      const endTime = Math.floor(nowMs / 1000);
      // Align the REAL fetch start down to a half-hour boundary so the API
      // range fully contains every bucket it can touch (a raw 08:37 start
      // would only partially cover the 08:30 bucket) - session bucket floors
      // never straddle the queried range.
      const HALF_HOUR_SEC = 30 * 60;
      const startTime = Math.max(
        1,
        Math.floor((endTime - 30 * 24 * 60 * 60) / HALF_HOUR_SEC) * HALF_HOUR_SEC,
      );
      try {
        // Absent storage means "not signed in" — a silent skip, not an error.
        const traeCnStoragePath = resolveTraeCnStoragePath({ env: process.env, home });
        if (traeCnStoragePath && fssync.existsSync(traeCnStoragePath)) {
          if (progress?.enabled) {
            progress.start(`Fetching TRAE Work CN usage...`);
          }
          const traeCnUsage = await fetchTraeCnUsageWithAuth({
            start_time: startTime,
            end_time: endTime,
            fetchImpl,
            env: process.env,
            home,
          });
          const traeCnSessions = Array.isArray(traeCnUsage?.sessions) ? traeCnUsage.sessions : [];
          // An empty payload parses as a pure no-op: the TRAE absence
          // contract is NOT PROVEN (no evidence that a missing session means
          // deleted/zero), so an empty response asserts nothing - no usage
          // mutation and no session states. Non-empty snapshots append one
          // canonical session-state observation per CHANGED session (the
          // cloud LWW upsert reconciles cross-device versions).
          {
            if (progress?.enabled && traeCnSessions.length > 0) {
              progress.start(
                `Parsing TRAE Work CN ${renderBar(0)} 0/${formatNumber(
                  traeCnSessions.length,
                )} records | buckets 0`,
              );
            }
            traeCnResult = await parseTraeCnApiIncremental({
              sessions: traeCnSessions,
              cursors,
              queuePath,
              onProgress: makeProviderProgress("TRAE Work CN"),
              windowStartMs: startTime * 1000,
              windowEndMs: endTime * 1000,
              // The LOGICAL fetch stamp carried into every session state's
              // snapshot_verified_at: the same clock that produced the query
              // range, not the later enqueue moment (append-only queue
              // replays it verbatim, so transport retries never fake
              // freshness).
              snapshotVerifiedAtMs: nowMs,
            });
            // A partially malformed snapshot throws inside the parser (fail
            // closed - it must not become the authoritative window state);
            // warnProviderParseFailure below reports it without sensitive
            // data while unrelated providers continue.
          }
        }
      } catch (err) {
        warnProviderParseFailure("TRAE Work CN", err, opts);
      }
    }

    // ── Freebuff — account-level usage API ──
    // Freebuff keeps no local token-consumption records (client-side session
    // projections only), so usage comes from the web console's
    // usage-summary endpoint, authorized by the CLI's own keychain token.
    // Strictly opt-in via TOKENUSAGE_FREEBUFF_USAGE=1 (v1: day-granular
    // account-wide totals, no cross-device dedup mileage yet), non-lightweight
    // syncs only. Absent credentials are a silent skip — a not-signed-in
    // install is a normal state, not an error; any fetch/parse failure leaves
    // prior data untouched while unrelated providers continue.
    let freebuffResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const freebuffRequested =
      !isBackgroundLightweightSync &&
      isFreebuffUsageEnabled(process.env) &&
      sourceAllowed("freebuff");
    if (freebuffRequested && isFreebuffConfigured({ env: process.env, home })) {
      try {
        if (progress?.enabled) {
          progress.start(`Fetching Freebuff usage...`);
        }
        const summary = await fetchFreebuffUsageWithAuth({
          fetchImpl: typeof freebuffFetchImpl === "function" ? freebuffFetchImpl : fetch,
          env: process.env,
          home,
        });
        freebuffResult = await parseFreebuffUsageSummary({
          summary,
          cursors,
          queuePath,
        });
      } catch (err) {
        warnProviderParseFailure("Freebuff", err, opts);
      }
    }

    // ── Kiro (SQLite-based, with JSONL fallback; dual-install aware) ──
    let kiroResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("kiro")) {
      const kiroNativeBase = resolveKiroBasePath(process.env);
      const wslKiroBase = process.platform === "win32" && wsl.shouldProbeWsl(process.env)
        ? wsl.discoverWslHome(".config/Kiro/User/globalStorage/kiro.kiroagent")
        : null;
      const kiroPaths = resolveInstallPaths({ nativeValue: kiroNativeBase, wslValue: wslKiroBase });
      // resolveInstallPaths only checks the base dir (and skips the check off
      // win32); keep the original per-install db/jsonl presence gate so empty
      // installs never spin up a parse or seed a cursor namespace.
      const kiroHasData = (base) => Boolean(base)
        && (fssync.existsSync(resolveKiroDbPath(base)) || fssync.existsSync(resolveKiroJsonlPath(base)));
      if (!kiroHasData(kiroPaths.native)) kiroPaths.native = null;
      if (!kiroHasData(kiroPaths.wsl)) kiroPaths.wsl = null;
      if (kiroPaths.native || kiroPaths.wsl) {
        if (progress?.enabled) {
          progress.start(`Parsing Kiro ${renderBar(0)} | buckets 0`);
        }
        try {
          kiroResult = await multiInstallParse({
            paths: kiroPaths,
            parserFn: parseKiroIncremental,
            providerName: "kiro",
            cursors,
            getParams: (base) => ({
              basePath: base,
              dbPath: resolveKiroDbPath(base),
              jsonlPath: resolveKiroJsonlPath(base),
            }),
            queuePath,
            onProgress: makeProviderProgress("Kiro"),
            detectInstall: (base, flatState) =>
              kiroInstallOwnsCursor(resolveKiroDbPath(base), flatState),
          });
        } catch (err) {
          warnProviderParseFailure("Kiro", err, opts);
        }
      }
    }

    // ── Hermes Agent (SQLite-based) ──
    let hermesResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("hermes")) {
      const override = process.env.TOKENUSAGE_HERMES_HOME;
      const overridePath = typeof override === "string" && override.trim().length > 0 ? override.trim() : null;
      if (overridePath) {
        if (fssync.existsSync(overridePath)) {
          if (progress?.enabled) {
            progress.start(`Parsing Hermes ${renderBar(0)} | buckets 0`);
          }
          ensureFlatCursor(cursors, "hermes", process.env);
          try {
            hermesResult = await parseHermesIncremental({
              hermesPath: overridePath,
              cursors,
              queuePath,
              onProgress: hermesOnProgress,
            });
          } catch (err) {
            warnProviderParseFailure("Hermes", err, opts);
          }
        }
      } else {
        const home = os.homedir();
        const defaultPath = path.join(home, ".hermes");
        const nativeValue = process.platform === "win32" && typeof process.env.LOCALAPPDATA === "string"
          ? path.join(process.env.LOCALAPPDATA.trim(), "hermes") : defaultPath;
        const hermesPaths = resolveInstallPaths({ nativeValue, wslDir: ".hermes" });
        if (hermesPaths.native || hermesPaths.wsl) {
          if (progress?.enabled) {
            progress.start(`Parsing Hermes ${renderBar(0)} | buckets 0`);
          }
          try {
            hermesResult = await multiInstallParse({
              paths: hermesPaths,
              parserFn: parseHermesIncremental,
              providerName: "hermes",
              cursors,
              getParams: (path) => ({ hermesPath: path }),
              queuePath,
              onProgress: hermesOnProgress,
              detectInstall: hermesInstallOwnsCursor,
            });
          } catch (err) {
            warnProviderParseFailure("Hermes", err, opts);
          }
        }
      }
    }

    function hermesOnProgress(p) {
      if (!progress?.enabled) return;
      const pct = p.total > 0 ? p.index / p.total : 1;
      progress.update(
        `Parsing Hermes ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} sessions | buckets ${formatNumber(p.bucketsQueued)}`,
      );
    }

    function gooseOnProgress(p) {
      if (!progress?.enabled) return;
      const pct = p.total > 0 ? p.index / p.total : 1;
      progress.update(
        `Parsing Goose ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} sessions | buckets ${formatNumber(p.bucketsQueued)}`,
      );
    }

    function zedOnProgress(p) {
      if (!progress?.enabled) return;
      const pct = p.total > 0 ? p.index / p.total : 1;
      progress.update(
        `Parsing Zed Agent ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} threads | buckets ${formatNumber(p.bucketsQueued)}`,
      );
    }

    // ── Kiro CLI (reads ~/Library/Application Support/kiro-cli/data.sqlite3,
    //    legacy ~/.kiro/sessions/cli/{uuid}.json, and Kiro CLI 2.13+
    //    ~/.kiro/sessions/{workspace}/sess_{uuid}/messages.jsonl) ──
    // Runs IN PARALLEL with the Kiro IDE branch above — NOT instead of it.
    // Both emit source='kiro' so totals merge transparently; cursor state
    // is isolated in cursors.kiroCli. Kiro CLI does not persist explicit
    // token counts (billing is credit-based on Bedrock); we approximate at
    // 4 chars/token from user prompt chars and assistant response chars.
    let kiroCliResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (sourceAllowed("kiro")) {
      const kiroCliDb = resolveKiroCliDbPath(process.env);
      const kiroCliSessionFiles = resolveKiroCliSessionFiles(process.env);
      const nativeCliPresent = fssync.existsSync(kiroCliDb) || kiroCliSessionFiles.length > 0;

      // Explicit overrides pin a single install — never mix them with WSL
      // auto-discovery (mirrors the Hermes TOKENUSAGE_HERMES_HOME branch).
      const kiroCliOverride = Boolean(process.env.KIRO_CLI_DB_PATH || process.env.KIRO_HOME);
      let wslKiroCliEnv = null;
      let wslKiroCliMarker = null;
      if (!kiroCliOverride && process.platform === "win32" && wsl.shouldProbeWsl(process.env)) {
        // A WSL install owns BOTH a data dir (~/.local/share/kiro-cli) and a
        // sessions home (~/.kiro). Derive both from whichever probe hits so
        // the per-install env never falls back to native paths.
        const wslKiroHomeDir = wsl.discoverWslHome(".kiro");
        const wslCliDataDir = wsl.discoverWslHome(".local/share/kiro-cli");
        const wslHomeRoot = wslKiroHomeDir
          ? path.dirname(wslKiroHomeDir)
          : (wslCliDataDir ? path.dirname(path.dirname(path.dirname(wslCliDataDir))) : null);
        if (wslHomeRoot) {
          const wslCliDb = path.join(wslHomeRoot, ".local", "share", "kiro-cli", "data.sqlite3");
          wslKiroCliEnv = {
            ...process.env,
            KIRO_CLI_DB_PATH: wslCliDb,
            KIRO_HOME: path.join(wslHomeRoot, ".kiro"),
          };
          const wslCliPresent = fssync.existsSync(wslCliDb)
            || resolveKiroCliSessionFiles(wslKiroCliEnv).length > 0;
          if (wslCliPresent) wslKiroCliMarker = wslCliDb;
        }
      }

      // Paths here are install markers only — the parser resolves its DB and
      // session files from the per-install env (KIRO_CLI_DB_PATH/KIRO_HOME).
      const kiroCliPaths = process.platform === "win32"
        ? wsl.resolveAllWin32Paths({
          nativeValue: nativeCliPresent ? kiroCliDb : null,
          wslValue: wslKiroCliMarker,
          env: process.env,
          platform: "win32",
        })
        : { native: nativeCliPresent ? kiroCliDb : null, wsl: null };
      const kiroCliEnvFor = (p) =>
        wslKiroCliEnv && p === wslKiroCliMarker ? wslKiroCliEnv : process.env;
      if (kiroCliPaths.native || kiroCliPaths.wsl) {
        if (progress?.enabled) {
          progress.start(`Parsing Kiro CLI ${renderBar(0)} | buckets 0`);
        }
        try {
          kiroCliResult = await multiInstallParse({
            paths: kiroCliPaths,
            parserFn: parseKiroCliIncremental,
            providerName: "kiroCli",
            cursors,
            // Per-install env MUST come from getParams: multiInstallParse
            // spreads shared params over it, so a top-level env would clobber
            // the per-install one.
            getParams: (p) => ({ env: kiroCliEnvFor(p) }),
            queuePath,
            onProgress: (p) => {
              if (!progress?.enabled) return;
              const pct = p.total > 0 ? p.index / p.total : 1;
              progress.update(
                `Parsing Kiro CLI ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} sessions | buckets ${formatNumber(p.bucketsQueued)}`,
              );
            },
            detectInstall: (p, flatState) =>
              kiroCliInstallOwnsCursor(kiroCliEnvFor(p).KIRO_CLI_DB_PATH || kiroCliDb, flatState),
          });
        } catch (err) {
          if (!opts.auto) {
            process.stderr.write(`Kiro CLI sync: ${err.message}\n`);
          }
        }
      }
    }

    // ── Kimi (passive wire.jsonl reader) ──
    let kimiResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const kimiWireFiles = sourceAllowed("kimi")
      ? mergeBothFileSources({ resolveFiles: resolveKimiWireFiles, env: process.env })
      : [];
    const kimiCodeWireFiles = sourceAllowed("kimi-code")
      ? mergeBothFileSources({ resolveFiles: resolveKimiCodeWireFiles, env: process.env })
      : [];
    if (isFullSourceScan && sourceAllowed("kimi") && sourceAllowed("kimi-code")) {
      await repairKimiModelAttribution({
        cursors, queuePath, queueStatePath,
        legacyFiles: kimiWireFiles, officialFiles: kimiCodeWireFiles,
        parseLegacy: parseKimiIncremental, parseOfficial: parseKimiCodeIncremental,
        env: process.env,
      });
    }
    if (kimiWireFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Kimi Code ${renderBar(0)} | buckets 0`);
      }
      try {
        kimiResult = await parseKimiIncremental({
          wireFiles: kimiWireFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Kimi Code ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Kimi Code", err, opts);
      }
    }

    // ── Kimi Code official (@moonshot-ai/kimi-code, ~/.kimi-code) ──
    let kimiCodeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (kimiCodeWireFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Kimi Code (official) ${renderBar(0)} | buckets 0`);
      }
      try {
        kimiCodeResult = await parseKimiCodeIncremental({
          wireFiles: kimiCodeWireFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Kimi Code (official) ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Kimi Code (official)", err, opts);
      }
    }

    // ── CodeBuddy CLI (passive ~/.codebuddy/projects/**/*.jsonl reader) ──
    // Tencent's CodeBuddy CLI is a Claude Code clone; no hook system, so we
    // tail the per-session JSONL conversation logs incrementally on each sync.
    let codebuddyResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    if (isFullSourceScan && sourceAllowed("codebuddy")) {
      const repairCodebuddyFiles = mergeBothFileSources({
        resolveFiles: (env) => resolveCodebuddyProjectFiles({
          ...env,
          TOKENUSAGE_CODEBUDDY_LOG_FALLBACK: "1",
        }),
        env: process.env,
      });
      try {
        await repairCodebuddyLogJsonlOverlap({
          cursors,
          queuePath,
          queueStatePath,
          codebuddyFiles: repairCodebuddyFiles,
          env: process.env,
        });
      } catch (err) {
        warnProviderParseFailure("CodeBuddy log/JSONL repair", err, opts);
      }
    }
    const codebuddyFiles = sourceAllowed("codebuddy")
      ? mergeBothFileSources({ resolveFiles: resolveCodebuddyProjectFiles, env: process.env })
      : [];
    if (codebuddyFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing CodeBuddy ${renderBar(0)} | buckets 0`);
      }
      try {
        codebuddyResult = await parseCodebuddyIncremental({
          projectFiles: codebuddyFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing CodeBuddy ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("CodeBuddy", err, opts);
      }
    }

    // ── WorkBuddy (passive ~/.workbuddy/projects/**/*.jsonl reader) ──
    // Tencent's WorkBuddy is a Claude Code fork in the same family as CodeBuddy;
    // usage rides on function_call records too (not only assistant messages) and
    // sub-agent logs nest one level deeper, so the resolver recurses. See the
    // parser comment in rollout.js for the cache-aware token math.
    let workbuddyResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0, projectBucketsQueued: 0, projectCursorUpdated: false };
    const workbuddyFiles = sourceAllowed("workbuddy")
      ? mergeBothFileSources({ resolveFiles: resolveWorkbuddyProjectFiles, env: process.env })
      : [];
    if (sourceAllowed("workbuddy")) {
      if (isFullSourceScan) {
        try {
          await repairWorkbuddyContextUsage({
            cursors,
            queuePath,
            queueStatePath,
            workbuddyFiles,
            env: process.env,
          });
        } catch (err) {
          warnProviderParseFailure("WorkBuddy context-usage repair", err, opts);
        }
      }
      if (progress?.enabled) {
        progress.start(`Parsing WorkBuddy ${renderBar(0)} | buckets 0`);
      }
      try {
        workbuddyResult = await parseWorkbuddyIncremental({
          projectFiles: workbuddyFiles,
          cursors,
          queuePath,
          projectQueuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing WorkBuddy ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("WorkBuddy", err, opts);
      }
    }

    // ── WorkBuddy AI — international build (~/.workbuddy-ai/projects/**/*.jsonl) ──
    // Same Claude-fork family and byte-identical JSONL as the CN build above;
    // only the home directory differs, so it reuses the WorkBuddy parser and
    // gets its own source key (and cursor namespace) so the two builds stay
    // separable instead of merging into one provider row.
    let workbuddyAiResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0, projectBucketsQueued: 0, projectCursorUpdated: false };
    const workbuddyAiFiles = sourceAllowed("workbuddy-ai")
      ? mergeBothFileSources({
          resolveFiles: (resolveEnv) => resolveWorkbuddyProjectFiles(resolveEnv, "workbuddy-ai"),
          env: process.env,
        })
      : [];
    if (sourceAllowed("workbuddy-ai")) {
      if (progress?.enabled) {
        progress.start(`Parsing WorkBuddy AI ${renderBar(0)} | buckets 0`);
      }
      try {
        workbuddyAiResult = await parseWorkbuddyIncremental({
          projectFiles: workbuddyAiFiles,
          cursors,
          queuePath,
          projectQueuePath,
          env: process.env,
          source: "workbuddy-ai",
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing WorkBuddy AI ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("WorkBuddy AI", err, opts);
      }
    }

    // ── oh-my-pi (passive ~/.omp/agent/sessions/**/*.jsonl reader) ──
    // Task-subagent transcripts (nested below the cwd level) are scanned too,
    // so their usage counts toward the omp totals.
    let ompResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const ompFiles = sourceAllowed("omp")
      ? mergeBothFileSources({ resolveFiles: resolveOmpSessionFiles, env: process.env })
      : [];
    const ompSubagentFiles = sourceAllowed("omp")
      ? mergeBothFileSources({ resolveFiles: resolveOmpSubagentFiles, env: process.env })
      : [];
    if (ompFiles.length > 0 || ompSubagentFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing oh-my-pi ${renderBar(0)} | buckets 0`);
      }
      try {
        ompResult = await parseOmpIncremental({
          sessionFiles: ompFiles,
          subagentFiles: ompSubagentFiles,
          cursors,
          queuePath,
          projectQueuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing oh-my-pi ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("oh-my-pi", err, opts);
      }
    }

    // ── OmO (passive ~/.omo/agent/sessions/**/*.jsonl reader) ──
    // Same session format as oh-my-pi, but a separate install root, cursor
    // namespace and source label, so the two never shadow each other.
    let omoResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    // Skip OmO when its agent dir resolves to the same path as omp's, so an
    // explicit TOKENUSAGE_OMO_AGENT_DIR pointing at ~/.omp/agent cannot
    // double-count the same transcripts under two source labels.
    const omoCollidesWithOmp = omoAgentDirCollidesWithOmp(process.env);
    const omoFiles = !sourceAllowed("omo") || omoCollidesWithOmp
      ? []
      : mergeBothFileSources({ resolveFiles: resolveOmoSessionFiles, env: process.env });
    const omoSubagentFiles = !sourceAllowed("omo") || omoCollidesWithOmp
      ? []
      : mergeBothFileSources({ resolveFiles: resolveOmoSubagentFiles, env: process.env });
    if (omoFiles.length > 0 || omoSubagentFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing OmO ${renderBar(0)} | buckets 0`);
      }
      try {
        omoResult = await parseOmoIncremental({
          sessionFiles: omoFiles,
          subagentFiles: omoSubagentFiles,
          cursors,
          queuePath,
          projectQueuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing OmO ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("OmO", err, opts);
      }
    }

    // ── pi (@mariozechner/pi-coding-agent) — passive ~/.pi/agent/sessions/**/*.jsonl reader ──
    // Skip pi parse if its agent dir resolves to the same path as omp's. This
    // prevents double-counting when explicit overrides (TOKENUSAGE_OMP_AGENT_DIR /
    // TOKENUSAGE_PI_AGENT_DIR) bypass the install-signal disambiguator.
    let piResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const piFiles = !sourceAllowed("pi") || piAgentDirCollidesWithOmp(process.env)
      ? []
      : mergeBothFileSources({ resolveFiles: resolvePiSessionFiles, env: process.env });
    if (piFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing pi ${renderBar(0)} | buckets 0`);
      }
      try {
        piResult = await parsePiIncremental({
          sessionFiles: piFiles,
          cursors,
          queuePath,
          projectQueuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing pi ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("pi", err, opts);
      }
    }

    // ── Prime Agent — passive ~/.prime/agent/sessions/*.jsonl usage reader ──
    let primeAgentResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const primeAgentFiles = sourceAllowed("prime-agent")
      ? mergeBothFileSources({ resolveFiles: resolvePrimeAgentSessionFiles, env: process.env })
      : [];
    if (primeAgentFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Prime Agent ${renderBar(0)} | buckets 0`);
      }
      try {
        primeAgentResult = await parsePrimeAgentIncremental({
          sessionFiles: primeAgentFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Prime Agent ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Prime Agent", err, opts);
      }
    }

    // ── MiniMax Code — passive ~/.minimax/v2/sessions/**/messages.jsonl usage reader ──
    let minimaxCodeResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const minimaxCodeFiles = sourceAllowed("minimax-code")
      ? mergeBothFileSources({ resolveFiles: resolveMinimaxCodeSessionFiles, env: process.env })
      : [];
    if (minimaxCodeFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing MiniMax Code ${renderBar(0)} | buckets 0`);
      }
      try {
        minimaxCodeResult = await parseMinimaxCodeIncremental({
          sessionFiles: minimaxCodeFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing MiniMax Code ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("MiniMax Code", err, opts);
      }
    }

    // ── Craft Agents (passive ~/.craft-agent + workspaces session.jsonl reader) ──
    let craftResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const craftFiles = sourceAllowed("craft")
      ? mergeBothFileSources({ resolveFiles: resolveCraftSessionFiles, env: process.env })
      : [];
    if (craftFiles.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Craft ${renderBar(0)} | buckets 0`);
      }
      try {
        craftResult = await parseCraftIncremental({
          sessionFiles: craftFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Craft ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Craft", err, opts);
      }
    }

    // Reasonix — content-free cumulative telemetry sidecars only.
    let reasonixResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const reasonixFiles = sourceAllowed("reasonix")
      ? mergeBothFileSources({ resolveFiles: resolveReasonixTelemetryFiles, env: process.env })
      : [];
    if (reasonixFiles.length > 0) {
      try {
        reasonixResult = await parseReasonixIncremental({
          telemetryFiles: reasonixFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: makeProviderProgress("Reasonix"),
        });
      } catch (err) {
        warnProviderParseFailure("Reasonix", err, opts);
      }
    }

    // Muse Code (Meta) — usage counts from per-session session.jsonl logs.
    let museResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const museFiles = sourceAllowed("muse")
      ? mergeBothFileSources({ resolveFiles: resolveMuseSessionFiles, env: process.env })
      : [];
    if (museFiles.length > 0) {
      try {
        museResult = await parseMuseIncremental({
          sessionFiles: museFiles,
          cursors,
          queuePath,
          env: process.env,
          onProgress: makeProviderProgress("Muse"),
        });
      } catch (err) {
        warnProviderParseFailure("Muse", err, opts);
      }
    }

    // ── Grok Build (xAI) ──
    let grokResult = {
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      projectBucketsQueued: 0,
    };
    // Full passive scan of all Grok sessions (historical + any not covered by hook)
    const grokSessions = sourceAllowed("grok") ? resolveGrokBuildSessions(process.env) : [];
    const grokSessionInputs = [...grokSessions];
    if (sourceAllowed("grok") && grokHookSignal && typeof grokHookSignal === "object") {
      const hookSessionId =
        typeof grokHookSignal.sessionId === "string" && grokHookSignal.sessionId.trim()
          ? grokHookSignal.sessionId.trim()
          : null;
      if (hookSessionId) {
        const hookContextTokens =
          grokHookSignal.contextTokensUsed != null
            ? grokHookSignal.contextTokensUsed
            : grokHookSignal.totalTokens;
        const hookTotalTokens =
          grokHookSignal.totalTokens != null
            ? grokHookSignal.totalTokens
            : hookContextTokens;
        grokSessionInputs.unshift({
          sessionId: hookSessionId,
          sessionDir:
            typeof grokHookSignal.sessionDir === "string" ? grokHookSignal.sessionDir : undefined,
          cwd: typeof grokHookSignal.cwd === "string" ? grokHookSignal.cwd : undefined,
          encodedCwd:
            typeof grokHookSignal.sessionDir === "string" && grokHookSignal.sessionDir
              ? path.basename(path.dirname(grokHookSignal.sessionDir))
              : undefined,
          updatesPath:
            typeof grokHookSignal.updatesPath === "string" ? grokHookSignal.updatesPath : undefined,
          signalsPath:
            typeof grokHookSignal.signalsPath === "string" ? grokHookSignal.signalsPath : undefined,
          summaryPath:
            typeof grokHookSignal.summaryPath === "string" ? grokHookSignal.summaryPath : undefined,
          signals: {
            contextTokensUsed: hookContextTokens,
            totalTokens: hookTotalTokens,
            totalTokensBeforeCompaction: grokHookSignal.totalTokensBeforeCompaction,
            assistantMessageCount: grokHookSignal.messageCount,
            primaryModelId: grokHookSignal.model,
            lastActiveAt: grokHookSignal.lastActive,
          },
          summary: { updated_at: grokHookSignal.lastActive },
        });
        grokHookSignalConsumed = true;
      }
    }
    if (grokSessionInputs.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Grok Build ${renderBar(0)} | buckets 0`);
      }
      let grokScanResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
      try {
        grokScanResult = await parseGrokBuildIncremental({
          sessions: grokSessionInputs,
          cursors,
          queuePath,
          projectQueuePath,
          env: process.env,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Grok Build ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} sessions | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
      } catch (err) {
        warnProviderParseFailure("Grok Build", err, opts);
      }
      grokResult = {
        recordsProcessed: grokResult.recordsProcessed + grokScanResult.recordsProcessed,
        eventsAggregated: grokResult.eventsAggregated + grokScanResult.eventsAggregated,
        bucketsQueued: grokResult.bucketsQueued + grokScanResult.bucketsQueued,
        projectBucketsQueued:
          (grokResult.projectBucketsQueued || 0) + (grokScanResult.projectBucketsQueued || 0),
      };
    }
    if (isFullSourceScan && opts.repairGrok) {
      await repairGrokQueueFromSessionSnapshots({ cursors, queuePath, queueStatePath });
    }

    // ── GitHub Copilot App / CLI unified local runtime ──
    //
    // First adoption deliberately runs legacy OTEL + App DB once before the
    // session-store parser records its max-id barrier. Subsequent scans use
    // session-store as canonical for CLI/App requests: OTEL keeps only Chat
    // extension LogRecords, while App DB remains an observe-only baseline.
    let copilotResult = { recordsProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
    const copilotSourceAllowed = sourceAllowed("copilot");
    const adoptedCopilotStorePaths = new Set(
      Object.entries(cursors?.copilotStore?.dbs || {})
        .filter(([, state]) => state?.adoptedAt)
        .map(([dbPath]) => dbPath),
    );
    const copilotStorePaths = copilotSourceAllowed
      ? Array.from(
          new Set([
            ...resolveCopilotSessionStorePaths(process.env),
            ...adoptedCopilotStorePaths,
          ]),
        ).filter((dbPath) => {
          if (adoptedCopilotStorePaths.has(dbPath)) return true;
          try { return fssync.existsSync(dbPath); } catch (_e) { return false; }
        })
      : [];
    const copilotStoreWasActive = cursors?.copilotStore?.active === true;
    const copilotStoreAdoptionFingerprints = {};
    if (!copilotStoreWasActive) {
      for (const dbPath of copilotStorePaths) {
        try {
          copilotStoreAdoptionFingerprints[dbPath] =
            getCopilotSqliteFingerprint(dbPath);
        } catch (_e) {}
      }
    }
    let copilotHadLegacyCliOtelHistory = false;
    if (!copilotStoreWasActive) {
      copilotHadLegacyCliOtelHistory =
        await copilotOtelCursorHasLegacyCliUsage(cursors);
      if (cursors?.copilot && typeof cursors.copilot === "object") {
        if (copilotHadLegacyCliOtelHistory) {
          cursors.copilot.legacyCliHistory = true;
        } else {
          cursors.copilot.usageClaimsComplete = true;
        }
      }
    }
    let copilotLegacyHealthy = true;
    let copilotOtelUsageClaims =
      cursors?.copilot?.recentUsageEvents || [];
    let copilotStoreResult = {
      active: copilotStoreWasActive,
      healthy: false,
      adoptedThisRun: false,
      canonicalDbPaths: [],
      recordsProcessed: 0,
      eventsAggregated: 0,
      bucketsQueued: 0,
      usageClaims: cursors?.copilotStore?.recentEvents || [],
    };
    if (copilotSourceAllowed && copilotStoreWasActive) {
      if (progress?.enabled) {
        progress.start(`Parsing Copilot App/CLI ${renderBar(0)} | buckets 0`);
      }
      try {
        copilotStoreResult = await parseCopilotSessionStoreIncremental({
          dbPaths: copilotStorePaths,
          cursors,
          queuePath,
          env: process.env,
          otelUsageEvents: cursors?.copilot?.recentUsageEvents,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Copilot App/CLI ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} events | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
        copilotResult = mergeParseResult(copilotResult, copilotStoreResult);
      } catch (err) {
        warnProviderParseFailure("Copilot App/CLI session store", err, opts);
      }
    }
    const copilotPathKey = (dbPath) => {
      const normalized = path.normalize(dbPath);
      return process.platform === "win32" ? normalized.toLowerCase() : normalized;
    };
    const canonicalCopilotStorePaths = new Set(
      (copilotStoreResult.canonicalDbPaths || []).map(copilotPathKey),
    );
    const adoptedCopilotStorePathKeys = new Set(
      Object.entries(cursors?.copilotStore?.dbs || {})
        .filter(([, state]) => state?.adoptedAt)
        .map(([dbPath]) => copilotPathKey(dbPath)),
    );
    const explicitCopilotStorePath =
      typeof process.env.TOKENUSAGE_COPILOT_SESSION_STORE_DB === "string" &&
      process.env.TOKENUSAGE_COPILOT_SESSION_STORE_DB.trim()
        ? copilotPathKey(
            normalizeCopilotDbPath(
              process.env.TOKENUSAGE_COPILOT_SESSION_STORE_DB,
              process.env,
            ),
          )
        : null;
    const explicitStoreIsCanonical =
      explicitCopilotStorePath !== null &&
      canonicalCopilotStorePaths.has(explicitCopilotStorePath);
    const explicitStoreIsAdopted =
      explicitCopilotStorePath !== null &&
      adoptedCopilotStorePathKeys.has(explicitCopilotStorePath);

    // ── GitHub Copilot CLI / Chat extension (OTEL JSONL files) ──
    const copilotPaths = copilotSourceAllowed ? resolveCopilotOtelPaths(process.env) : [];
    if (copilotPaths.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Copilot ${renderBar(0)} | buckets 0`);
      }
      try {
        const copilotOtelResult = await parseCopilotIncremental({
          otelPaths: copilotPaths,
          cursors,
          queuePath,
          env: process.env,
          storeUsageEvents:
            copilotStoreResult.usageClaims ||
            cursors?.copilotStore?.recentEvents ||
            [],
          skipCliSpans: copilotStoreWasActive,
          onProgress: (p) => {
            if (!progress?.enabled) return;
            const pct = p.total > 0 ? p.index / p.total : 1;
            progress.update(
              `Parsing Copilot ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} files | buckets ${formatNumber(p.bucketsQueued)}`,
            );
          },
        });
        copilotOtelUsageClaims =
          copilotOtelResult.usageClaims ||
          cursors?.copilot?.recentUsageEvents ||
          [];
        copilotResult = mergeParseResult(copilotResult, copilotOtelResult);
      } catch (err) {
        copilotLegacyHealthy = false;
        warnProviderParseFailure("Copilot", err, opts);
      }
    }

    // ── GitHub Copilot App (passive data.db session summaries) ──
    const copilotAppDbStates =
      cursors?.copilotApp?.dbs && typeof cursors.copilotApp.dbs === "object"
        ? cursors.copilotApp.dbs
        : null;
    const initialTrackedCopilotAppDbPaths = new Set(
      Object.keys(copilotAppDbStates || {}),
    );
    const copilotAppDbCandidates = uniqueCopilotDbPaths(
      [
        ...resolveCopilotAppDbPaths(process.env),
        ...initialTrackedCopilotAppDbPaths,
      ],
      process.env,
      Array.from(initialTrackedCopilotAppDbPaths),
    );
    coalesceCopilotDbStatesByIdentity(
      copilotAppDbStates,
      copilotAppDbCandidates,
      mergeCopilotAppDbStates,
    );
    const explicitStoreOwnsSingleApp =
      copilotAppDbCandidates.length === 1 &&
      explicitStoreIsAdopted;
    if (copilotAppDbStates && (copilotStoreWasActive || copilotStorePaths.length > 0)) {
      for (const dbPath of Object.keys(copilotAppDbStates)) {
        try {
          fssync.statSync(dbPath);
        } catch (err) {
          const matchingStorePath = copilotPathKey(
            path.join(path.dirname(dbPath), "session-store.db"),
          );
          if (err?.code === "ENOENT") {
            if (
              canonicalCopilotStorePaths.has(matchingStorePath) ||
              (explicitStoreOwnsSingleApp && explicitStoreIsCanonical)
            ) {
              delete copilotAppDbStates[dbPath];
            }
          } else {
            if (!copilotStoreWasActive) copilotLegacyHealthy = false;
          }
        }
      }
    }
    const trackedCopilotAppDbPaths = new Set(
      Object.keys(cursors?.copilotApp?.dbs || {}),
    );
    const rawCopilotAppDbPaths = copilotSourceAllowed
      ? Array.from(new Set([
          ...copilotAppDbCandidates,
          ...trackedCopilotAppDbPaths,
        ])).filter((dbPath) => {
          if (trackedCopilotAppDbPaths.has(dbPath)) return true;
          try { return fssync.existsSync(dbPath); } catch (_e) { return false; }
        })
      : [];
    const copilotAppDbPaths = uniqueCopilotDbPaths(
      rawCopilotAppDbPaths,
      process.env,
      Array.from(trackedCopilotAppDbPaths),
    );
    if (copilotAppDbPaths.length > 0) {
      if (progress?.enabled) {
        progress.start(`Parsing Copilot App ${renderBar(0)} | buckets 0`);
      }
      for (const appDbPath of copilotAppDbPaths) {
        const storePathKey = copilotPathKey(
          path.join(path.dirname(appDbPath), "session-store.db"),
        );
        const observeOnly =
          copilotStoreWasActive ||
          adoptedCopilotStorePathKeys.has(storePathKey) ||
          (copilotAppDbPaths.length === 1 && explicitStoreIsAdopted);
        const catchupRelevant =
          !observeOnly &&
          !copilotStoreWasActive &&
          copilotStorePaths.length > 0;
        try {
          const copilotAppResult = await parseCopilotAppDbIncremental({
            dbPaths: [appDbPath],
            cursors,
            queuePath,
            env: process.env,
            observeOnly,
            onProgress: (p) => {
              if (!progress?.enabled) return;
              const pct = p.total > 0 ? p.index / p.total : 1;
              progress.update(
                `Parsing Copilot App ${renderBar(pct)} ${formatNumber(p.index)}/${formatNumber(p.total)} sessions | buckets ${formatNumber(p.bucketsQueued)}`,
              );
            },
          });
          copilotResult = mergeParseResult(copilotResult, copilotAppResult);
          if (catchupRelevant && copilotAppResult.dbErrors > 0) {
            copilotLegacyHealthy = false;
          }
        } catch (err) {
          if (catchupRelevant) copilotLegacyHealthy = false;
          warnProviderParseFailure("Copilot App", err, opts);
        }
      }
    }

    if (
      copilotSourceAllowed &&
      !copilotStoreWasActive &&
      copilotStorePaths.length > 0 &&
      copilotLegacyHealthy
    ) {
      if (progress?.enabled) {
        progress.start(`Adopting Copilot App/CLI store ${renderBar(0)} | buckets 0`);
      }
      try {
        const copilotHasOtelCursorHistory =
          (Array.isArray(cursors?.copilot?.seenIds) &&
            cursors.copilot.seenIds.length > 0) ||
          (cursors?.copilot?.fileOffsets &&
            Object.keys(cursors.copilot.fileOffsets).length > 0);
        const copilotOtelClaimsIncomplete =
          copilotHadLegacyCliOtelHistory ||
          (copilotHasOtelCursorHistory &&
            cursors?.copilot?.usageClaimsComplete !== true);
        const appSessionIds = [];
        const appSessionTotals = {};
        for (const dbState of Object.values(cursors?.copilotApp?.dbs || {})) {
          for (const [sessionId, totals] of Object.entries(
            dbState?.sessionTotals || {},
          )) {
            const total =
              Number(totals?.input || 0) +
              Number(totals?.output || 0) +
              Number(totals?.cached || 0) +
              Number(totals?.reasoning || 0);
            if (total <= 0) continue;
            appSessionIds.push(sessionId);
            const prior = appSessionTotals[sessionId];
            const priorTotal =
              Number(prior?.input || 0) +
              Number(prior?.output || 0) +
              Number(prior?.cached || 0) +
              Number(prior?.reasoning || 0);
            if (total > priorTotal) appSessionTotals[sessionId] = totals;
          }
        }
        copilotStoreResult = await parseCopilotSessionStoreIncremental({
          dbPaths: copilotStorePaths,
          cursors,
          queuePath,
          env: process.env,
          backfillOnFirstRun: !copilotOtelClaimsIncomplete,
          excludeSessionIdsOnFirstRun: appSessionIds,
          excludeSessionTotalsOnFirstRun: appSessionTotals,
          expectedFingerprints: copilotStoreAdoptionFingerprints,
          otelUsageEvents: copilotOtelUsageClaims,
        });
        copilotResult = mergeParseResult(copilotResult, copilotStoreResult);
      } catch (err) {
        warnProviderParseFailure("Copilot App/CLI session store", err, opts);
      }
    }

    if (copilotSourceAllowed) {
      if (Array.isArray(cursors?.copilot?.recentUsageEvents)) {
        cursors.copilot.recentUsageEvents = pruneCopilotUsageClaims(
          cursors.copilot.recentUsageEvents,
        );
      }
      if (Array.isArray(cursors?.copilotStore?.recentEvents)) {
        cursors.copilotStore.recentEvents = pruneCopilotUsageClaims(
          cursors.copilotStore.recentEvents,
        );
      }
    }

    if (isFullSourceScan && cursors?.projectHourly?.projects && projectQueuePath && projectQueueStatePath) {
      for (const [projectKey, meta] of Object.entries(cursors.projectHourly.projects)) {
        if (!meta || typeof meta !== "object") continue;
        if (meta.status !== "blocked" || !meta.purge_pending) continue;
        await purgeProjectUsage({
          projectKey,
          projectQueuePath,
          projectQueueStatePath,
          projectState: cursors.projectHourly,
          cursors,
        });
        meta.purge_pending = false;
        meta.purged_at = new Date().toISOString();
      }
    }

    if (isFullSourceScan) {
      await applyCloudConversationsBackfill({ cursors, queueStatePath });
    }

    const totalParsed =
      parseResult.filesProcessed +
      openclawResult.filesProcessed +
      claudeResult.filesProcessed +
      geminiResult.filesProcessed +
      antigravityResult.filesProcessed +
      opencodeResult.filesProcessed +
      qoderResult.recordsProcessed +
      qoderCnResult.recordsProcessed +
      claudeScienceResult.recordsProcessed +
      cursorResult.recordsProcessed +
      traeCnResult.recordsProcessed +
      freebuffResult.recordsProcessed +
      traeResult.recordsProcessed +
      kiroResult.recordsProcessed +
      kiroCliResult.recordsProcessed +
      hermesResult.recordsProcessed +
      kimiResult.recordsProcessed +
      kimiCodeResult.recordsProcessed +
      codebuddyResult.recordsProcessed +
      workbuddyResult.recordsProcessed +
      workbuddyAiResult.recordsProcessed +
      ompResult.recordsProcessed +
      omoResult.recordsProcessed +
      piResult.recordsProcessed +
      primeAgentResult.recordsProcessed +
      minimaxCodeResult.recordsProcessed +
      craftResult.recordsProcessed +
      reasonixResult.recordsProcessed +
      museResult.recordsProcessed +
      grokResult.recordsProcessed +
      copilotResult.recordsProcessed +
      lmstudioResult.recordsProcessed +
      unslothResult.recordsProcessed +
      anythingllmResult.recordsProcessed +
      devinResult.recordsProcessed +
      kiloResult.recordsProcessed +
      dumateResult.recordsProcessed +
      mimoResult.recordsProcessed +
      zcodeResult.recordsProcessed +
      kilocodeResult.recordsProcessed +
      roocodeResult.recordsProcessed +
      clineResult.recordsProcessed +
      zedResult.recordsProcessed +
      gooseResult.recordsProcessed +
      dshResult.recordsProcessed +
      commandCodeResult.recordsProcessed +
      droidResult.recordsProcessed;
    const totalBuckets =
      parseResult.bucketsQueued +
      openclawResult.bucketsQueued +
      claudeResult.bucketsQueued +
      geminiResult.bucketsQueued +
      antigravityResult.bucketsQueued +
      opencodeResult.bucketsQueued +
      qoderResult.bucketsQueued +
      qoderCnResult.bucketsQueued +
      claudeScienceResult.bucketsQueued +
      cursorResult.bucketsQueued +
      traeCnResult.bucketsQueued +
      freebuffResult.bucketsQueued +
      traeResult.bucketsQueued +
      kiroResult.bucketsQueued +
      kiroCliResult.bucketsQueued +
      hermesResult.bucketsQueued +
      kimiResult.bucketsQueued +
      kimiCodeResult.bucketsQueued +
      codebuddyResult.bucketsQueued +
      workbuddyResult.bucketsQueued +
      workbuddyAiResult.bucketsQueued +
      ompResult.bucketsQueued +
      omoResult.bucketsQueued +
      piResult.bucketsQueued +
      primeAgentResult.bucketsQueued +
      minimaxCodeResult.bucketsQueued +
      craftResult.bucketsQueued +
      reasonixResult.bucketsQueued +
      museResult.bucketsQueued +
      grokResult.bucketsQueued +
      copilotResult.bucketsQueued +
      lmstudioResult.bucketsQueued +
      unslothResult.bucketsQueued +
      anythingllmResult.bucketsQueued +
      devinResult.bucketsQueued +
      kiloResult.bucketsQueued +
      dumateResult.bucketsQueued +
      mimoResult.bucketsQueued +
      zcodeResult.bucketsQueued +
      kilocodeResult.bucketsQueued +
      roocodeResult.bucketsQueued +
      clineResult.bucketsQueued +
      zedResult.bucketsQueued +
      gooseResult.bucketsQueued +
      dshResult.bucketsQueued +
      commandCodeResult.bucketsQueued +
      droidResult.bucketsQueued;
    syncRun?.noteParsedFiles(totalParsed);
    const skipNoOpCursorCommit =
      opts.auto &&
      !isFullSourceScan &&
      cursorStore.mode === "v2" &&
      cursorStore.requiresCommit !== true &&
      totalParsed === (commandCodeResult.cursorUnchanged ? commandCodeResult.recordsProcessed : 0) &&
      totalBuckets === 0 &&
      !(workbuddyResult.projectBucketsQueued > 0) &&
      !(workbuddyAiResult.projectBucketsQueued > 0) &&
      !workbuddyResult.projectCursorUpdated &&
      !workbuddyAiResult.projectCursorUpdated &&
      !(grokResult.projectBucketsQueued > 0) &&
      !(commandCodeResult.projectBucketsQueued > 0) &&
      !commandCodeResult.schemaMigrated &&
      !codexColdAuditDue &&
      !codexFallbackRetryRan &&
      !grokHookSignalConsumed &&
      !cursors.migrations?.[KIMI_MODEL_REPAIR_KEY]?.pendingCompaction &&
      !opts.repairGrok;

    if (syncDiagnostics) {
      syncDiagnostics.cursor_commits = Number(syncDiagnostics.cursor_commits || 0);
      syncDiagnostics.cursor_bytes = Number(syncDiagnostics.cursor_bytes || 0);
      syncDiagnostics.cursor_path = cursorStore.currentCorePath;
    }
    if (!skipNoOpCursorCommit) {
      cursors.updatedAt = new Date().toISOString();
      await cursorStore.commit(cursors);
      if (codexAuditRecorded) {
        await cursorStore.clearDeferredCodexAuditSyncs();
      }
      if (syncDiagnostics) {
        const cursorStat = await fs.stat(cursorStore.currentCorePath);
        syncDiagnostics.cursor_commits += 1;
        syncDiagnostics.cursor_bytes += cursorStat.size;
        syncDiagnostics.cursor_path = cursorStore.currentCorePath;
      }
    } else if (codexAuditRecorded) {
      await cursorStore.writeDeferredCodexAuditSyncs(
        deferredCodexAuditSyncs + 1,
      );
    }
    if (cursors.migrations?.[KIMI_MODEL_REPAIR_KEY]?.pendingCompaction) {
      const state = (await readJson(queueStatePath)) || { offset: 0 };
      await compactPendingQueue({ queuePath, offset: Number(state.offset || 0), minPendingBytes: 0 });
      cursors.migrations[KIMI_MODEL_REPAIR_KEY].pendingCompaction = false;
      await cursorStore.commit(cursors);
    }
    if (grokHookSignalConsumed && grokHookSignalPath) {
      await fs.unlink(grokHookSignalPath).catch(() => {});
    }

    progress?.stop();

    const runtimeConfig = config ? { ...config } : {};
    if (legacyBaseUrlMigration) {
      delete runtimeConfig.anonKey;
    }
    if (legacyBaseUrlMigration?.replacementDeviceToken) {
      runtimeConfig.deviceToken = legacyBaseUrlMigration.replacementDeviceToken;
    }
    // An authenticated local API supplies this capability for this upload.
    // Keep a separately configured CLI account from overriding its owner.
    const resolvedRuntime = resolveRuntimeConfig({
      cli: {
        deviceToken: process.env.TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN,
        ...(process.env.TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN ? {
          baseUrl: process.env.TOKENUSAGE_INSFORGE_BASE_URL,
          anonKey: process.env.TOKENUSAGE_INSFORGE_ANON_KEY,
        } : {}),
      },
      config: runtimeConfig,
      env: process.env,
    });

    // Empty is an explicit local-server denial, so it cannot fall back to a
    // separately configured CLI account when the browser is signed out.
    const runtime = Object.hasOwn(process.env, "TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN")
      ? { ...resolvedRuntime, deviceToken: resolvedRuntime.configurationError ? null : process.env.TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN }
      : resolvedRuntime;
    cloudResetRuntime = runtime;

    let uploadResult = { inserted: 0, skipped: 0 };
    let uploadAttempted = false;
    let uploadError = null;
    let autoUploadDecision = null;
    // Session upload counters, folded into the final summary instead of being
    // printed on their own line before it.
    let sessionUploadSummary = null;

    if (canUpload() && (opts.auto || opts.publishAccount) && runtime.deviceToken && runtime.baseUrl &&
        (!isBackgroundLightweightSync || opts.publishAccount)) {
      const uploadStateBefore = (await readJson(queueStatePath)) || { offset: 0 };
      const queueSizeBefore = await safeStatSize(queuePath);
      const pendingBytesBefore = Math.max(
        0,
        queueSizeBefore - Number(uploadStateBefore.offset || 0),
      );
      // Automatic producers honor success and failure deadlines. A verified
      // manual recheck may probe changed membership; the server decides access.
      const bypassSuccessInterval = (!opts.auto && opts.drain) || legacyBaseUrlMigration;
      const lastSuccessMs = Number(uploadThrottleState.lastSuccessMs || 0);
      const successDeadline = lastSuccessMs > 0
        ? Math.max(Number(uploadThrottleState.serverNextAllowedAtMs || 0), Math.min(Number(uploadThrottleState.nextAllowedAtMs || 0),
          lastSuccessMs + AUTO_UPLOAD_CONFIG.intervalMs + AUTO_UPLOAD_DEFAULTS.jitterMsMax))
        : Number(uploadThrottleState.nextAllowedAtMs || 0);
      const recheckCloudAccess = opts.drain && process.env.TOKENUSAGE_CLOUD_RECHECK === "1" &&
        Boolean(process.env.TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN?.trim());
      const storedBackoff = recheckCloudAccess ? 0 : Number(uploadThrottleState.backoffUntilMs || 0);
      autoUploadDecision = decideAutoUpload({
        nowMs: Date.now(),
        pendingBytes: pendingBytesBefore,
        state: {
          ...uploadThrottleState,
          backoffUntilMs: storedBackoff,
          nextAllowedAtMs: recheckCloudAccess ? 0 : bypassSuccessInterval
            ? Math.max(storedBackoff, Number(uploadThrottleState.serverNextAllowedAtMs || 0))
            : successDeadline,
        },
        config: AUTO_UPLOAD_CONFIG,
      });
      if (opts.drain && autoUploadDecision.reason === "throttled") {
        throw Object.assign(new Error("Cloud upload is backed off; retry after the current upload cooldown"), {
          code: "SYNC_UPLOAD_BACKOFF",
          retryAfterMs: Math.max(0, autoUploadDecision.blockedUntilMs - Date.now()),
        });
      }
    }

    if (canUpload() && runtime.deviceToken && runtime.baseUrl &&
        (!isBackgroundLightweightSync || opts.publishAccount) &&
        (!autoUploadDecision || autoUploadDecision.allowed)) {
      // Decide the window budget from the original backlog. Compact only once
      // upload is allowed so a cooldown run cannot shrink away that budget.
      const state = (await readJson(queueStatePath)) || { offset: 0 };
      await compactPendingQueue({ queuePath, offset: Number(state.offset || 0) });
      uploadAttempted = true;
      // Mirror the machine identity into the purge-surviving seed file so a
      // future `uninstall --purge` + reinstall recovers the same cloud device
      // instead of double-counting history under a new one (issue #176). This
      // is the migration path for installs that predate the seed file.
      try {
        require("../lib/machine-id").getOrCreateMachineId(queuePath);
      } catch {
        // best effort — upload below must not be blocked by identity mirroring
      }
      try {
        let successfulDeviceToken = runtime.deviceToken;
        const drainWithToken = (deviceToken) =>
          drainQueueToCloud({
            baseUrl: runtime.baseUrl,
            anonKey: runtime.anonKey,
            deviceToken,
            queuePath,
            queueStatePath,
            maxBatches: opts.drain ? 100 : (autoUploadDecision?.maxBatches || 5),
            batchSize: autoUploadDecision?.batchSize || 200,
            maxDurationMs: UPLOAD_BUDGET_MS,
            canUpload,
          });
        try {
          uploadResult = await drainWithToken(successfulDeviceToken);
        } catch (error) {
          const fallbackDeviceToken = legacyBaseUrlMigration?.previousDeviceToken;
          const replacementDeviceToken = legacyBaseUrlMigration?.replacementDeviceToken;
          const stateAfterFailure = (await readJson(queueStatePath)) || { offset: 0 };
          const canFallbackWithoutSplittingHistory =
            !Object.hasOwn(process.env, "TOKENUSAGE_LOCAL_SYNC_DEVICE_TOKEN") &&
            (error?.status === 401 || error?.status === 403) &&
            replacementDeviceToken &&
            fallbackDeviceToken &&
            fallbackDeviceToken !== replacementDeviceToken &&
            Number(stateAfterFailure.offset || 0) === 0;
          if (!canFallbackWithoutSplittingHistory) throw error;
          successfulDeviceToken = fallbackDeviceToken;
          uploadResult = await drainWithToken(successfulDeviceToken);
        }
        // A successful ingest response proves which credential belongs to the
        // current backend. Only now commit the token and remove the retry marker.
        // Empty queues make no request, so keep the marker until future data can
        // validate a credential instead of persisting an unverified token.
        if (legacyBaseUrlMigration && uploadResult.batches > 0) {
          // device-login does not share the sync lock and may have written a
          // fresh current-backend config while the scan/upload was running.
          // Re-read before committing and only remove the anonymous key this
          // migration observed. A concurrent login may replace the backend URL
          // while preserving the old key, or another writer may replace the key
          // while the legacy URL is still present.
          await updateJsonLocked(configPath, async (latestConfig) => {
            const hasLegacyBaseUrl = isLegacyInsforgeBaseUrl(latestConfig.baseUrl);
            const hasUnchangedLegacyAnonKey =
              legacyBaseUrlMigration.hadPersistedAnonKey &&
              latestConfig.anonKey === legacyBaseUrlMigration.persistedAnonKey;
            if (!hasLegacyBaseUrl && !hasUnchangedLegacyAnonKey) return null;
            if (hasLegacyBaseUrl) {
              latestConfig.deviceToken = successfulDeviceToken;
              delete latestConfig.baseUrl;
            }
            if (hasUnchangedLegacyAnonKey) {
              delete latestConfig.anonKey;
            }
            return latestConfig;
          });
        }
        // Record success so the exponential backoff step resets — otherwise
        // a single past failure keeps us pessimistically throttled forever.
        if (uploadResult.batches > 0) {
          uploadThrottleState = recordUploadSuccess({
            nowMs: Date.now(),
            state: uploadThrottleState,
            config: AUTO_UPLOAD_CONFIG,
            cloudAccess: uploadResult.cloudAccess,
            attemptId: process.env.TOKENUSAGE_LOCAL_SYNC_ATTEMPT_ID,
          });
          await writeJson(uploadThrottlePath, uploadThrottleState);
        }
      } catch (e) {
        uploadError = e;
        if (e.uploadResult?.batches > 0) {
          uploadResult = e.uploadResult;
          uploadThrottleState = recordUploadSuccess({
            nowMs: Date.now(), state: uploadThrottleState, config: AUTO_UPLOAD_CONFIG,
            cloudAccess: uploadResult.cloudAccess,
            attemptId: process.env.TOKENUSAGE_LOCAL_SYNC_ATTEMPT_ID,
          });
        }
        // Persist a backoff on 429 / 5xx so the next auto-sync waits instead
        // of retrying immediately and making the rate-limit worse. The
        // throttle module already parses Retry-After when we surface it on
        // the error object (drainQueueToCloud stamps err.status + err.retryAfterMs).
        uploadThrottleState = recordUploadFailure({
          nowMs: Date.now(),
          state: uploadThrottleState,
          error: e,
          attemptId: process.env.TOKENUSAGE_LOCAL_SYNC_ATTEMPT_ID,
        });
        await writeJson(uploadThrottlePath, uploadThrottleState);
        if (!opts.auto) {
          process.stderr.write(`Upload error: ${e?.message || e}\n`);
        } else {
          autoLog(`Upload error: ${e?.message || e}`, {
            phase: "upload",
            error: String(e?.message || e),
            status: Number.isInteger(e?.status) ? e.status : null,
          });
        }
        // `sync --drain` is the readiness boundary for first-time cloud view:
        // callers must not treat a swallowed upload failure as a completed
        // historical backfill and switch away from the intact local data.
        if (opts.drain) throw e;
      }
    }

    // §2.11 run counters for the hourly drain: buckets that went into
    // successful ingest requests plus their token sum (client-side telemetry
    // semantics). A failed upload reports the run as partial — data stays
    // queued locally for the next pass.
    if (syncRun && uploadAttempted) {
      syncRun.noteUpload({ inserted: uploadResult.inserted, tokens: uploadResult.tokens || 0, credits: uploadResult.credits || 0 });
      if (uploadError) syncRun.setOutcome({ result: "partial", errorCode: "upload_failed" });
    }

    markPhase("scan + hourly upload");

    // Session metadata upload (docs/cli-contract.md section 2.4 `sessions`):
    // strictly-newer-than-watermark increments, batches of <=200, best-effort —
    // an hourly-bucket sync must not be reported as failed by a sessions error.
    if (canUpload() && runtime.deviceToken && runtime.baseUrl && !opts.noSessions &&
        (!isBackgroundLightweightSync || opts.publishAccount)) {
      try {
        const analytics = await buildSessionAnalytics({ force: false, home });
        const watermarkPath = path.join(trackerDir, "session-upload-watermarks.json");
        const result = await uploadSessions({
          baseUrl: runtime.baseUrl,
          anonKey: runtime.anonKey,
          deviceToken: runtime.deviceToken,
          sessions: analytics,
          watermarkPath,
          canUpload,
        });
        if (result.pending > 0) {
          sessionUploadSummary = {
            uploaded: result.uploaded,
            pending: result.pending,
            upserted: result.upserted,
            skipped: (result.skippedServer || 0) + (result.skippedLocal || 0),
            modelsOmitted: result.modelsOmitted || 0,
          };
          // Auto runs keep the rolling log line; a manual run reports the same
          // counters inside the final summary block (printing here would put
          // the sessions line above the summary it belongs to).
          if (opts.auto) {
            const sessionSuffix =
              result.upserted || result.skippedServer
                ? ` (upserted ${result.upserted}, skipped ${result.skippedServer})`
                : "";
            const omittedSuffix =
              sessionUploadSummary.modelsOmitted > 0
                ? `, models omitted on ${sessionUploadSummary.modelsOmitted}`
                : "";
            autoLog(`Sessions: ${result.uploaded}/${result.pending} uploaded${sessionSuffix}${omittedSuffix}`);
          }
        }
        syncRun?.noteSessions({
          upserted: result.upserted,
          skipped: (result.skippedServer || 0) + (result.skippedLocal || 0),
        });
      } catch (sessionError) {
        syncRun?.setOutcome({ result: "partial", errorCode: "sessions_upload_failed" });
        if (!opts.auto) {
          const detail = sessionError?.message || String(sessionError);
          process.stderr.write(
            `Session upload error (hourly buckets are unaffected): ${detail}\n`,
          );
        } else {
          autoLog(
            `Session upload error (hourly buckets are unaffected): ${
              sessionError?.message || sessionError
            }`,
            {
              phase: "session-upload",
              error: String(sessionError?.message || sessionError),
              status: Number.isInteger(sessionError?.status) ? sessionError.status : null,
            },
          );
        }
        if (opts.drain) throw sessionError;
      }
    }

    // Detected project repositories (docs/cli-contract.md §2.4 `projects`,
    // contract v3). Best-effort like sessions: repo metadata never fails a run.
    // A backend that predates v3 answers the projects-only request with 400 or
    // 404/405; those entries simply stay pending until the server is upgraded.
    if (canUpload() && runtime.deviceToken && runtime.baseUrl &&
        (!isBackgroundLightweightSync || opts.publishAccount)) {
      try {
        const repoResult = await uploadProjectRepos({
          baseUrl: runtime.baseUrl,
          anonKey: runtime.anonKey,
          deviceToken: runtime.deviceToken,
          projects: cursors?.projectHourly?.projects || {},
          statePath: path.join(trackerDir, "project.repos.state.json"),
          canUpload,
        });
        if (repoResult.uploaded > 0 && opts.auto) {
          autoLog(`Project repos: ${repoResult.uploaded} updated`);
        }
      } catch (repoError) {
        // Auxiliary metadata: log, leave the confirmed state untouched so the
        // next sync retries, and keep the run's outcome unchanged.
        autoLog(`Project repo upload error: ${repoError?.message || repoError}`, {
          phase: "project-repos",
          error: String(repoError?.message || repoError),
          status: Number.isInteger(repoError?.status) ? repoError.status : null,
        });
      }
    }

    const afterState = (await readJson(queueStatePath)) || { offset: 0 };
    const queueSize = await safeStatSize(queuePath);
    // Only the main queue is uploaded by drainQueueToCloud. project.queue.jsonl
    // is local project-usage state, so counting it here creates false backlog
    // and can keep auto retry alive even after cloud sync has drained.
    const pendingBytes = Math.max(0, queueSize - Number(afterState.offset || 0));
    syncRun?.noteQueueBytes(pendingBytes);

    if (pendingBytes === 0 && canUpload() && runtime.deviceToken) {
      await finishCloudDeviceUsageReset({ trackerDir, ownerId: process.env.TOKENUSAGE_CLOUD_OWNER_ID,
        baseUrl: runtime.baseUrl, anonKey: runtime.anonKey, deviceToken: runtime.deviceToken,
        deviceId: process.env.TOKENUSAGE_CLOUD_DEVICE_ID });
    }

    if (pendingBytes <= 0 || !canUpload()) {
      await clearAutoRetry(trackerDir);
    } else if (opts.auto && uploadAttempted && !opts.publishAccount) {
      const retryAtMs = Number(uploadThrottleState?.nextAllowedAtMs || 0);
      if (retryAtMs > Date.now()) {
        await scheduleAutoRetry({
          trackerDir,
          retryAtMs,
          reason: "backlog",
          pendingBytes,
          source: autoSourceScope ? `${autoSourceScope}-backlog` : "auto-backlog",
          syncSource: autoSourceScope,
          autoRetryNoSpawn: runtime.autoRetryNoSpawn,
        });
      }
    }

    markPhase("sessions + projects");

    if (!autoishSync) {
      const codexRecordOnlyWarning = formatRecordOnlyWarning(countRecordOnlyFiles(cursors));
      const deviceIdentity = buildDeviceIdentity({ config: runtimeConfig, hostname: os.hostname() });
      process.stdout.write(
        buildSyncSummaryLines({
          deviceIdentity,
          totalParsed,
          totalBuckets,
          uploadResult,
          sessionUploadSummary,
          hasDeviceToken: Boolean(runtime.deviceToken),
          pendingBytes,
          drain: Boolean(opts.drain),
          durationMs: Date.now() - syncStartedAtMs,
          uploadError,
          warning: codexRecordOnlyWarning,
        }).join("\n"),
      );
      if (phaseTimings) {
        process.stdout.write(
          // Start-to-finish total is intentionally the last column: the phases
          // above are sequential, so any gap shows up there.
          `- Timing: ${phaseTimings.map((p) => `${p.label} ${formatDuration(p.ms)}`).join(" | ")}` +
            ` | total ${formatDuration(Date.now() - syncStartedAtMs)}\n`,
        );
      }
    } else {
      autoLog(
        `Auto sync finished — parsed ${totalParsed} files, +${totalBuckets} buckets, ` +
          (runtime.deviceToken
            ? `uploaded ${uploadResult.inserted}, skipped ${uploadResult.skipped}` +
              `, ${uploadResult.tokens || 0} tokens` +
              (pendingBytes > 0 ? `, pending ${formatBytes(pendingBytes)}` : ", queue drained")
            : "upload skipped (no device token)"),
        {
          phase: "finished",
          parsed_files: totalParsed,
          buckets: totalBuckets,
          inserted: uploadResult.inserted,
          skipped: uploadResult.skipped,
          tokens: uploadResult.tokens || 0,
          credits: uploadResult.credits || 0,
          sessions_uploaded: sessionUploadSummary ? sessionUploadSummary.uploaded : 0,
          sessions_skipped: sessionUploadSummary ? sessionUploadSummary.skipped : 0,
          pending_bytes: pendingBytes,
          duration_ms: Date.now() - syncStartedAtMs,
          uploaded: Boolean(runtime.deviceToken),
        },
      );
    }

    // §2.11 run record (empty runs included) — the last thing a run does,
    // strictly best-effort: failures only reach the local log, never the
    // ingest outcome above or this process's exit code.
    if (syncRun) {
      await syncRun.report({
        baseUrl: runtime.baseUrl,
        anonKey: runtime.anonKey,
        deviceToken: runtime.deviceToken,
      });
    }
  } catch (error) {
    // A crashed run still reports (§2.11 error outcome) — best-effort and
    // never masking the original error. cloudResetRuntime carries the
    // resolved backend once known; before that there is nothing to report to.
    if (syncRun) {
      syncRun.setOutcome({ result: "error", errorCode: "sync_error" });
      await syncRun.report({
        baseUrl: cloudResetRuntime?.baseUrl || null,
        anonKey: cloudResetRuntime?.anonKey || null,
        deviceToken: cloudResetRuntime?.deviceToken || null,
      });
    }
    throw error;
  } finally {
    progress?.stop();
    await lock.release();
  }
}

function parseArgs(argv) {
  const out = {
    auto: false,
    fromNotify: false,
    fromRetry: false,
    fromOpenclaw: false,
    source: null,
    drain: false,
    waitForLock: false,
    background: false,
    publishAccount: false,
    allLocalSources: false,
    repairGrok: false,
    noSessions: false,
    timing: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--auto") out.auto = true;
    else if (a === "--no-sessions") out.noSessions = true;
    else if (a === "--from-notify") out.fromNotify = true;
    else if (a === "--from-retry") out.fromRetry = true;
    else if (a === "--from-openclaw") out.fromOpenclaw = true;
    else if (a === "--from-scheduled") out.fromScheduled = true;
    else if (a === "--source") {
      out.source = parseSyncSourceArg(argv[i + 1], "--source");
      i += 1;
    }
    else if (a.startsWith("--source=")) out.source = parseSyncSourceArg(a.slice("--source=".length), "--source=");
    else if (a === "--drain") out.drain = true;
    else if (a === "--wait-for-lock") out.waitForLock = true;
    else if (a === "--background" || a === "--lightweight") out.background = true;
    else if (a === "--publish-account") out.publishAccount = true;
    else if (a === "--all-local-sources") out.allLocalSources = true;
    else if (a === "--repair-grok") out.repairGrok = true;
    else if (a === "--timing") out.timing = true;
    else throw unknownOptionError(a, "sync");
  }
  return out;
}

// Manual (`sync --source <id>`) scan scope. Kept separate from
// resolveAutoSourceScope: that one deliberately returns null unless `--auto` is
// set, which is how the flag ended up validated-but-unused on plain syncs.
function resolveManualSourceScope(opts) {
  if (!opts || opts.auto) return null;
  return normalizeSyncSource(opts.source);
}

function resolveAutoSourceScope(opts) {
  if (!opts?.auto) return null;
  if (opts.fromOpenclaw) return "openclaw";
  if (opts.fromRetry) return normalizeSyncSource(opts.source);
  if (!opts.fromNotify) return null;
  return normalizeSyncSource(opts.source);
}

function normalizeSyncSource(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  const aliased = AUTO_SYNC_SOURCE_ALIASES.get(normalized) || normalized;
  return AUTO_SYNC_SOURCES.has(aliased) ? aliased : null;
}

// Help/list text for `--source`, generated from the registries above so the
// documented ids cannot drift from what sync actually scans.
function formatSyncSourceList() {
  return Array.from(AUTO_SYNC_SOURCES).sort().join(", ");
}

// CLI-facing `--source`: a typo used to fall back to null, which quietly
// degraded to a full 46-source scan — the opposite of "only scan this one".
// Failing loudly is the only safe behavior; the error lists valid ids.
function parseSyncSourceArg(value, flag = "--source") {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) {
    throw new UsageError(`${flag} requires a provider id`, {
      code: "SOURCE_MISSING",
      hint: `Available ids: ${formatSyncSourceList()}`,
    });
  }
  const resolved = normalizeSyncSource(raw);
  if (!resolved) {
    throw new UsageError(`Unknown --source value: ${raw}`, {
      code: "SOURCE_UNKNOWN",
      hint: `Available ids: ${formatSyncSourceList()}`,
    });
  }
  return resolved;
}

function isCodexColdScanAuditDue(
  cursors,
  nowMs = Date.now(),
  deferredSyncs = 0,
) {
  const state = cursors?.codexColdScanAudit;
  if (!state || typeof state !== "object" || state.version !== 1) return true;
  const lastFullScanAtMs = Number(state.lastFullScanAtMs);
  if (!Number.isFinite(lastFullScanAtMs) || lastFullScanAtMs <= 0) return true;
  if (Number.isFinite(nowMs) && lastFullScanAtMs - nowMs > 5 * 60 * 1000) return true;
  if (Number.isFinite(nowMs) && nowMs - lastFullScanAtMs >= CODEX_COLD_SCAN_AUDIT_INTERVAL_MS) {
    return true;
  }
  const syncsSinceFullScan =
    Number(state.syncsSinceFullScan || 0) +
    Math.max(0, Number(deferredSyncs) || 0);
  return (
    Number.isFinite(syncsSinceFullScan) &&
    syncsSinceFullScan >= CODEX_COLD_SCAN_AUDIT_MAX_SYNCS
  );
}

function recordCodexColdScanAudit(
  cursors,
  { fullAudit = false, skipped = 0, deferredSyncs = 0 } = {},
  nowMs = Date.now(),
) {
  if (!cursors || typeof cursors !== "object") return;
  const prev =
    cursors.codexColdScanAudit && typeof cursors.codexColdScanAudit === "object"
      ? cursors.codexColdScanAudit
      : {};
  const previousSyncs = Number(prev.syncsSinceFullScan || 0);
  const lastFullScanAtMs = Number(prev.lastFullScanAtMs);
  const next = {
    version: 1,
    lastFullScanAtMs: Number.isFinite(lastFullScanAtMs) && lastFullScanAtMs > 0
      ? lastFullScanAtMs
      : nowMs,
    syncsSinceFullScan:
      (Number.isFinite(previousSyncs) && previousSyncs > 0 ? previousSyncs : 0) +
      Math.max(0, Number(deferredSyncs) || 0),
    lastSkippedFiles: Math.max(0, Number(skipped) || 0),
    updatedAt: new Date(nowMs).toISOString(),
  };
  if (fullAudit) {
    next.lastFullScanAtMs = nowMs;
    next.lastFullScanAt = new Date(nowMs).toISOString();
    next.syncsSinceFullScan = 0;
  } else {
    next.lastFullScanAt = Number.isFinite(next.lastFullScanAtMs)
      ? new Date(next.lastFullScanAtMs).toISOString()
      : null;
    next.syncsSinceFullScan += 1;
  }
  cursors.codexColdScanAudit = next;
}

module.exports = {
  cmdSync,
  acquireSyncLock,
  AUTO_SYNC_SOURCES,
  AUTO_SYNC_SOURCE_ALIASES,
  BACKGROUND_AUTO_SYNC_SOURCES,
  buildSyncSummaryLines,
  readQueueBatch,
  drainQueueToCloud,
  normalizeSyncSource,
  resolveManualSourceScope,
  parseSyncSourceArg,
  formatSyncSourceList,
  zcodeRowTotals,
  buildZcodeRestorationRow,
  migrateCursorUnknownBuckets,
  migrateRolloutCumulativeDeltaBuckets,
  repairCodebuddyLogJsonlOverlap,
  repairWorkbuddyContextUsage,
  WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY,
  migrateLegacyDeepseekHarnessSource,
  DSH_LEGACY_SOURCE_MIGRATION_KEY,
  repairCodexRescanInflation,
  repairCodexForkReplayInflation,
  repairCodexInterleavedUsageInflation,
  repairDroidDuplicateSessionInflation,
  repairMimoClaudeMislabel,
  repairZcodeNativeUsageMigration,
  repairZcodeInclusiveTokenMigration,
  repairZcodePruneWindowRestore,
  resolveZcodeRebuildFloorMs,
  ZCODE_PRUNE_WINDOW_RESTORE_KEY,
  reincludeClaudeMemObserverFiles,
  repairGrokQueueFromSessionSnapshots,
  applyCloudConversationsBackfill,
  scheduleAutoRetry,
  buildAutoRetryScript,
  isCodexColdScanAuditDue,
  recordCodexColdScanAudit,
  CURSOR_UNKNOWN_MIGRATION_KEY,
  ROLLOUT_CUMULATIVE_DELTA_MIGRATION_KEY,
  CODEBUDDY_LOG_JSONL_REPAIR_KEY,
  CODEX_RESCAN_DEDUP_REPAIR_KEY,
  CODEX_FORK_REPLAY_REPAIR_KEY,
  CODEX_USAGE_LINEAGE_REPAIR_KEY,
  DROID_DUP_SESSION_REPAIR_KEY,
  CLAUDE_MEM_OBSERVER_REINCLUDE_KEY,
  GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY,
  CLOUD_CONVERSATIONS_BACKFILL_KEY,
};

// The pre-merge Harness prototype briefly emitted source="deepseek" before
// settling on the official CLI id, source="dsh". Relabel the local history,
// append explicit zero rows for every old cloud key, and replay from offset 0.
// That preserves the latest canonical totals while making remote whole-row
// upserts remove the stale alias instead of displaying both sources or summing
// the same session twice.
async function migrateLegacyDeepseekHarnessSource({ cursors, queuePath, queueStatePath } = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  if (migrations[DSH_LEGACY_SOURCE_MIGRATION_KEY]) return false;

  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  const output = [];
  const legacyKeys = new Map();
  const latestMigratedRows = new Map();
  const latestExplicitCanonicalRows = new Map();
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_error) {
      output.push(line);
      continue;
    }

    const isLegacy =
      row?.source === "deepseek" &&
      typeof row.model === "string" &&
      typeof row.hour_start === "string";
    if (isLegacy) {
      const key = `${row.model}|${row.hour_start}`;
      legacyKeys.set(key, { model: row.model, hour_start: row.hour_start });
      row = {
        ...row,
        source: "dsh",
        billable_total_tokens: row.billable_total_tokens ?? row.total_tokens,
      };
    }
    const serialized = JSON.stringify(row);
    output.push(serialized);
    if (row?.source === "dsh" && typeof row.model === "string" && typeof row.hour_start === "string") {
      const key = `${row.model}|${row.hour_start}`;
      if (isLegacy) latestMigratedRows.set(key, serialized);
      else latestExplicitCanonicalRows.set(key, serialized);
    }
  }

  if (legacyKeys.size === 0) {
    migrations[DSH_LEGACY_SOURCE_MIGRATION_KEY] = {
      status: "noop",
      appliedAt: new Date().toISOString(),
      reason: "no-legacy-deepseek-rows",
    };
    return false;
  }

  // Re-append the last canonical row for each affected key so local readers'
  // last-row-wins contract remains correct even when an old alias line was
  // physically later than an already-emitted dsh row.
  for (const key of legacyKeys.keys()) {
    const canonical = latestExplicitCanonicalRows.get(key) || latestMigratedRows.get(key);
    if (canonical) output.push(canonical);
  }
  for (const { model, hour_start } of legacyKeys.values()) {
    output.push(JSON.stringify({
      source: "deepseek",
      model,
      hour_start,
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
      billable_total_tokens: 0,
      conversation_count: 0,
    }));
  }

  await ensureDir(path.dirname(queuePath));
  const tmpPath = `${queuePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmpPath, `${output.join("\n")}\n`, "utf8");
  await fs.rename(tmpPath, queuePath);

  if (typeof queueStatePath === "string" && queueStatePath) {
    let state = {};
    try {
      state = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
      if (!state || typeof state !== "object") state = {};
    } catch (_error) {
      state = {};
    }
    state.offset = 0;
    state.updatedAt = new Date().toISOString();
    state.note = "reset_after_deepseek_harness_source_migration_2026_08";
    await ensureDir(path.dirname(queueStatePath));
    await fs.writeFile(queueStatePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  }

  migrations[DSH_LEGACY_SOURCE_MIGRATION_KEY] = {
    status: "applied",
    appliedAt: new Date().toISOString(),
    migratedBuckets: legacyKeys.size,
    retractedBuckets: legacyKeys.size,
  };
  return true;
}

function normalizeString(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function resolveOpenclawSignal({ env } = {}) {
  if (!env) return null;

  const agentId = normalizeString(env.TOKENUSAGE_OPENCLAW_AGENT_ID);
  const sessionId = normalizeString(env.TOKENUSAGE_OPENCLAW_PREV_SESSION_ID);
  if (!agentId || !sessionId) return null;

  // Resolve the OpenClaw home identically to the passive scanner so the
  // plugin-triggered file and passively discovered files share one path
  // spelling — otherwise the same transcript could get two cursors and be
  // counted twice (issue #264 review).
  const openclawHome = resolveOpenclawHome(env);
  const sessionFile = path.join(openclawHome, "agents", agentId, "sessions", `${sessionId}.jsonl`);

  const prevTotals = {
    totalTokens: normalizeNonNegativeInt(env.TOKENUSAGE_OPENCLAW_PREV_TOTAL_TOKENS),
    inputTokens: normalizeNonNegativeInt(env.TOKENUSAGE_OPENCLAW_PREV_INPUT_TOKENS),
    outputTokens: normalizeNonNegativeInt(env.TOKENUSAGE_OPENCLAW_PREV_OUTPUT_TOKENS),
    model: normalizeString(env.TOKENUSAGE_OPENCLAW_PREV_MODEL),
    updatedAt: normalizeIsoOrEpoch(env.TOKENUSAGE_OPENCLAW_PREV_UPDATED_AT),
  };

  return {
    agentId,
    sessionId,
    sessionKey: normalizeString(env.TOKENUSAGE_OPENCLAW_SESSION_KEY),
    openclawHome,
    sessionFile,
    prevTotals,
  };
}

async function applyOpenclawTotalsFallback({
  trackerDir,
  signal,
  cursors,
  queuePath,
  projectQueuePath,
}) {
  const totalTokens = Number(signal?.prevTotals?.totalTokens || 0);
  if (!trackerDir || !signal || totalTokens <= 0) {
    return { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
  }

  // The passive/plugin transcript parse is authoritative: if this session's
  // transcript has ever yielded real per-event usage, synthesizing sessions.json
  // totals on top would count the same tokens twice (issue #264 review). Defer
  // to the real events and advance the fallback baseline so no stale delta lingers.
  const transcriptCursor =
    signal.sessionFile && cursors?.files
      ? cursors.files[openclawCursorKey(signal.sessionFile)]
      : null;
  const transcriptHasRealUsage = Boolean(transcriptCursor?.hasRealUsage);

  const sessionKey = `${signal.agentId}:${signal.sessionId}`;
  const statePath = path.join(trackerDir, "openclaw.fallback.state.json");
  const fallbackFilePath = path.join(trackerDir, "openclaw.fallback.jsonl");
  const state = (await readJson(statePath)) || { version: 1, sessions: {} };
  const sessions = state.sessions && typeof state.sessions === "object" ? state.sessions : {};
  const prev =
    sessions[sessionKey] && typeof sessions[sessionKey] === "object" ? sessions[sessionKey] : null;

  if (transcriptHasRealUsage) {
    sessions[sessionKey] = {
      totalTokens: normalizeNonNegativeInt(signal?.prevTotals?.totalTokens) || 0,
      inputTokens: normalizeNonNegativeInt(signal?.prevTotals?.inputTokens) || 0,
      outputTokens: normalizeNonNegativeInt(signal?.prevTotals?.outputTokens) || 0,
      model: normalizeString(signal?.prevTotals?.model) || "unknown",
      updatedAt: normalizeIsoOrEpoch(signal?.prevTotals?.updatedAt) || new Date().toISOString(),
      seenAt: new Date().toISOString(),
      coveredByEvents: true,
    };
    state.version = 1;
    state.sessions = sessions;
    await writeJson(statePath, state);
    return { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
  }

  const current = {
    totalTokens: normalizeNonNegativeInt(signal?.prevTotals?.totalTokens) || 0,
    inputTokens: normalizeNonNegativeInt(signal?.prevTotals?.inputTokens) || 0,
    outputTokens: normalizeNonNegativeInt(signal?.prevTotals?.outputTokens) || 0,
    model: normalizeString(signal?.prevTotals?.model) || "unknown",
    updatedAt: normalizeIsoOrEpoch(signal?.prevTotals?.updatedAt) || new Date().toISOString(),
    seenAt: new Date().toISOString(),
  };

  let deltaTotal = current.totalTokens;
  let deltaInput = current.inputTokens;
  let deltaOutput = current.outputTokens;
  if (prev) {
    deltaTotal = Math.max(
      0,
      current.totalTokens - (normalizeNonNegativeInt(prev.totalTokens) || 0),
    );
    deltaInput = Math.max(
      0,
      current.inputTokens - (normalizeNonNegativeInt(prev.inputTokens) || 0),
    );
    deltaOutput = Math.max(
      0,
      current.outputTokens - (normalizeNonNegativeInt(prev.outputTokens) || 0),
    );
  }

  if (deltaTotal > 0 && deltaInput + deltaOutput === 0) {
    deltaInput = deltaTotal;
  }

  sessions[sessionKey] = current;
  state.version = 1;
  state.sessions = sessions;

  if (deltaTotal <= 0) {
    await writeJson(statePath, state);
    return { filesProcessed: 0, eventsAggregated: 0, bucketsQueued: 0 };
  }

  await ensureDir(path.dirname(fallbackFilePath));
  const syntheticMessage = {
    type: "message",
    timestamp: current.updatedAt,
    message: {
      role: "assistant",
      model: current.model,
      usage: {
        input: deltaInput,
        output: deltaOutput,
        cacheRead: 0,
        cacheWrite: 0,
        totalTokens: deltaTotal,
      },
    },
  };
  await fs.appendFile(fallbackFilePath, `${JSON.stringify(syntheticMessage)}\n`, "utf8");
  await writeJson(statePath, state);

  return parseOpenclawIncremental({
    sessionFiles: [{ path: fallbackFilePath, source: "openclaw" }],
    cursors,
    queuePath,
    projectQueuePath,
    source: "openclaw",
  });
}

function normalizeNonNegativeInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.floor(n);
}

function normalizeIsoOrEpoch(value) {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length > 0 && !Number.isNaN(Date.parse(trimmed))) return trimmed;
    const numeric = Number(trimmed);
    if (Number.isFinite(numeric) && numeric > 0) {
      const ms = numeric < 1e12 ? Math.floor(numeric * 1000) : Math.floor(numeric);
      const iso = new Date(ms).toISOString();
      if (!Number.isNaN(Date.parse(iso))) return iso;
    }
  }

  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  const ms = n < 1e12 ? Math.floor(n * 1000) : Math.floor(n);
  const dt = new Date(ms);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toISOString();
}


function deriveAutoSkipReason({ decision, state }) {
  if (!decision || decision.reason !== "throttled") return decision?.reason || "unknown";
  const backoffUntilMs = Number(state?.backoffUntilMs || 0);
  const nextAllowedAtMs = Number(state?.nextAllowedAtMs || 0);
  if (backoffUntilMs > 0 && backoffUntilMs >= nextAllowedAtMs) return "backoff";
  return "throttled";
}

async function scheduleAutoRetry({
  trackerDir,
  retryAtMs,
  reason,
  pendingBytes,
  source,
  syncSource,
  autoRetryNoSpawn,
}) {
  const retryMs = coerceRetryMs(retryAtMs);
  if (!retryMs) return { scheduled: false, retryAtMs: 0 };

  const retryPath = path.join(trackerDir, AUTO_RETRY_FILENAME);
  const nowMs = Date.now();
  const existing = await readJson(retryPath);
  const existingMs = coerceRetryMs(existing?.retryAtMs);
  const normalizedSyncSource = normalizeSyncSource(syncSource);
  if (existingMs && existingMs >= retryMs - 1000) {
    const existingSyncSource = normalizeSyncSource(existing?.syncSource);
    if (existingSyncSource !== normalizedSyncSource) {
      await writeJson(
        retryPath,
        buildAutoRetryPayload({
          retryMs: existingMs,
          nowMs,
          reason,
          pendingBytes,
          source,
          syncSource: normalizedSyncSource,
        }),
      );
    }
    return { scheduled: false, retryAtMs: existingMs };
  }

  const payload = buildAutoRetryPayload({
    retryMs,
    nowMs,
    reason,
    pendingBytes,
    source,
    syncSource: normalizedSyncSource,
  });

  await writeJson(retryPath, payload);

  const delayMs = Math.min(AUTO_RETRY_MAX_DELAY_MS, Math.max(0, retryMs - nowMs));
  if (delayMs <= 0) return { scheduled: false, retryAtMs: retryMs };
  if (autoRetryNoSpawn) {
    return { scheduled: false, retryAtMs: retryMs };
  }

  spawnAutoRetryProcess({
    retryPath,
    trackerDir,
    packageEntryPath: cliEntryPath(),
    fallbackPkg: "tokenusage-cli",
    delayMs,
  });
  return { scheduled: true, retryAtMs: retryMs };
}

function buildAutoRetryPayload({ retryMs, nowMs, reason, pendingBytes, source, syncSource }) {
  const payload = {
    version: 1,
    retryAtMs: retryMs,
    retryAt: new Date(retryMs).toISOString(),
    reason: typeof reason === "string" && reason.length > 0 ? reason : "throttled",
    pendingBytes: Math.max(0, Number(pendingBytes || 0)),
    scheduledAt: new Date(nowMs).toISOString(),
    source: typeof source === "string" ? source : "auto",
  };
  if (syncSource) payload.syncSource = syncSource;
  return payload;
}

async function clearAutoRetry(trackerDir) {
  const retryPath = path.join(trackerDir, AUTO_RETRY_FILENAME);
  await fs.unlink(retryPath).catch(() => {});
}

function spawnAutoRetryProcess({
  retryPath,
  trackerDir,
  packageEntryPath,
  fallbackPkg,
  delayMs,
}) {
  const script = buildAutoRetryScript({
    retryPath,
    trackerDir,
    packageEntryPath,
    fallbackPkg,
    delayMs,
  });
  try {
    const child = cp.spawn(process.execPath, ["-e", script], {
      detached: true,
      // Without this Windows allocates a visible console for the detached
      // wait, flashes an empty terminal window on every backoff, and closes
      // it when the retry child exits.
      windowsHide: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
  } catch (_e) {}
}

function buildAutoRetryScript({
  retryPath,
  trackerDir,
  packageEntryPath,
  fallbackPkg,
  delayMs,
}) {
  return (
    `'use strict';\n` +
    `// node:fs and node:path come from the inlined launcher lib below.\n` +
    `const cp = require('node:child_process');\n` +
    `const retryPath = ${JSON.stringify(retryPath)};\n` +
    `const fallbackPkg = ${JSON.stringify(fallbackPkg)};\n` +
    `const delayMs = ${Math.max(0, Math.floor(delayMs || 0))};\n` +
    `\n` +
    // Which CLI entry runs the retried sync is decided by the shared launcher
    // contract (lib/runtime-launch.js) — the same one notify.cjs, the OpenClaw
    // spawn points, init's first sync and the scheduled runners use.
    buildLauncherPrelude({ trackerDir, packageEntry: packageEntryPath }) +
    `setTimeout(() => {\n` +
    `  let payload = null;\n` +
    `  let retryAtMs = 0;\n` +
    `  try {\n` +
    `    const raw = fs.readFileSync(retryPath, 'utf8');\n` +
    `    payload = JSON.parse(raw);\n` +
    `    retryAtMs = Number(payload.retryAtMs || 0);\n` +
    `  } catch (_) {}\n` +
    `  if (!retryAtMs || Date.now() + 1000 < retryAtMs) process.exit(0);\n` +
    `  const argv = ['sync', '--auto', '--from-retry'];\n` +
    `  if (payload && typeof payload.syncSource === 'string' && payload.syncSource.trim()) {\n` +
    `    argv.push('--source', payload.syncSource.trim());\n` +
    `  }\n` +
    `  // Newest usable entry wins (see the resolution block above): the init-copied\n` +
    `  // runtime when it is newer, the installed package otherwise, npx last. A\n` +
    `  // half-copied runtime is never a candidate.\n` +
    `  const launcher = resolveLauncher({\n` +
    `    trackerDir: LAUNCHER_DATA_DIR,\n` +
    `    packageEntry: LAUNCHER_PACKAGE_ENTRY,\n` +
    `  });\n` +
    `  const cmd = launcherCommand(launcher, argv, { fallbackPkg });\n` +
    `  try {\n` +
    `    const child = cp.spawn(cmd[0], cmd.slice(1), { detached: true, windowsHide: true, stdio: 'ignore', env: process.env });\n` +
    `    child.unref();\n` +
    `  } catch (_) {}\n` +
    `}, delayMs);\n`
  );
}

function coerceRetryMs(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

async function writeOpenclawSignal(trackerDir) {
  const openclawSignalPath = path.join(trackerDir, "openclaw.signal");
  try {
    await fs.writeFile(openclawSignalPath, new Date().toISOString(), "utf8");
  } catch (_e) {
    // best-effort marker
  }
}

const AUTO_RETRY_FILENAME = "auto.retry.json";
const AUTO_RETRY_MAX_DELAY_MS = 2 * 60 * 60 * 1000;

const { buildSessionAnalytics } = require("../lib/session-analytics");
const { uploadSessions } = require("../lib/session-upload");
const { uploadProjectRepos } = require("../lib/project-repos");
// Sessions split batches on a 500 KiB byte budget (lib/session-upload.js);
// the hourly drain used to rely on the row cap alone. Raw queue-line bytes
// upper-bound the sanitized wire rows (the whitelist in ingest-sanitize only
// shrinks them), so cutting on raw bytes keeps every request comfortably
// under the contract's 1 MiB body cap (§1.2 → 413).

async function applyCloudConversationsBackfill({ cursors, queueStatePath }) {
  if (!cursors || typeof cursors !== "object") return false;
  cursors.migrations = cursors.migrations || {};
  if (cursors.migrations[CLOUD_CONVERSATIONS_BACKFILL_KEY]) return false;

  // Reset ONLY the cloud upload offset. The queue file itself is untouched;
  // ingest upserts are idempotent per (user, device, hour, source, model),
  // so replaying the whole queue is safe — it costs upload batches, not
  // correctness. Project queue is never uploaded and is not touched.
  let prevOffset = 0;
  try {
    const st = (await readJson(queueStatePath)) || {};
    prevOffset = Number(st.offset || 0);
  } catch (_e) {
    /* missing state file — nothing to reset */
  }
  if (prevOffset > 0) {
    await writeJson(queueStatePath, { offset: 0, updatedAt: new Date().toISOString() });
  }
  cursors.migrations[CLOUD_CONVERSATIONS_BACKFILL_KEY] = {
    appliedAt: new Date().toISOString(),
    previousOffset: prevOffset,
  };
  return prevOffset > 0;
}
