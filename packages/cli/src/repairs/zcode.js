"use strict";

// Zcode repair family, split out of commands/sync.js. These are one-shot
// history corrections: two queue+state rebuilds keyed by migration id
// (native-usage adoption, inclusive-token semantics) and the prune-window
// restore that re-appends pre-window peaks from queue backups. They mutate
// cursors/queue files in place and are idempotent via cursors.migrations.

const path = require("node:path");
const fs = require("node:fs/promises");
const fssync = require("node:fs");

const { ensureDir } = require("../lib/fs");
const { readSqliteJsonRows } = require("../lib/sqlite-reader");
const { backupExistingFile } = require("../lib/queue-backup");
const {
  readZcodeDbMessages,
  hasZcodeNativeUsageSchema,
  hasZcodeCursorState,
  coerceEpochMs,
  toUtcHalfHourStart,
  bucketKey,
} = require("../lib/rollout");

const ZCODE_NATIVE_USAGE_REPAIR_KEY = "zcodeNativeUsageRepair_2026_08";
const ZCODE_INCLUSIVE_TOKEN_REPAIR_KEY = "zcodeInclusiveTokenRepair_2026_09";
const ZCODE_PRUNE_WINDOW_RESTORE_KEY = "zcodePruneWindowRestore_2026_10";
async function resetUploadOffsetForZcodeRepair(queueStatePath, note) {
  if (typeof queueStatePath !== "string" || !queueStatePath) return false;
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
  } catch (_error) {
    state = {};
  }
  state.offset = 0;
  state.updatedAt = new Date().toISOString();
  state.note = note;
  await ensureDir(path.dirname(queueStatePath));
  await fs.writeFile(queueStatePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  return true;
}

function zcodeHourStartMs(hourStart) {
  if (typeof hourStart !== "string" || !hourStart.trim()) return null;
  const ms = Date.parse(hourStart);
  return Number.isFinite(ms) ? ms : null;
}

// One restored queue row from a backup peak (repairZcodePruneWindowRestore).
// peak.totals comes from zcodeRowTotals, which fills the billable/cost columns
// older backup rows are missing — the restored row must match the live queue
// schema exactly (audit fix: 恢复行缺 billable/cost 字段).
function buildZcodeRestorationRow(peak) {
  return {
    source: "zcode",
    model: peak.model,
    hour_start: peak.hour_start,
    ...peak.totals,
  };
}

// Main bucket keys are `source|model|hour_start` — hour_start (an ISO string)
// never contains `|`, so it is everything after the LAST separator. Splitting
// on every `|` mis-parses models whose name contains one (audit fix).
function zcodeHourFromMainBucketKey(key) {
  if (typeof key !== "string" || !key.startsWith("zcode|")) return null;
  const last = key.lastIndexOf("|");
  if (last <= "zcode|".length - 1) return null;
  const hour = key.slice(last + 1);
  return hour || null;
}

function zcodeHourFromProjectBucketKey(key) {
  if (typeof key !== "string") return null;
  const marker = "|zcode|";
  const idx = key.indexOf(marker);
  if (idx < 0) return null;
  const hour = key.slice(idx + marker.length);
  return hour || null;
}

function zcodeHourFromGroupQueuedKey(key) {
  if (typeof key !== "string" || !key.startsWith("zcode|")) return null;
  return key.slice("zcode|".length) || null;
}

function zcodeHourIsPreWindow(hourStart, preserveBeforeMs) {
  if (!Number.isFinite(preserveBeforeMs)) return false;
  const hourMs = zcodeHourStartMs(hourStart);
  return hourMs != null && hourMs < preserveBeforeMs;
}

// Per-install rebuild floor. Prefer native model_usage MIN(started_at) when the
// native schema exists — an ancient legacy message does not prove continuous
// coverage through pruned native gaps (#828).
function resolveZcodeDbRebuildFloorMs(dbPath) {
  if (!dbPath || !fssync.existsSync(dbPath)) return null;
  if (hasZcodeNativeUsageSchema(dbPath)) {
    try {
      const rows = readSqliteJsonRows(
        dbPath,
        `SELECT MIN(started_at) AS floor
           FROM model_usage
          WHERE status = 'completed'
            AND trim(model_id) != ''
            AND (
              input_tokens > 0 OR output_tokens > 0 OR reasoning_tokens > 0 OR
              cache_creation_input_tokens > 0 OR cache_read_input_tokens > 0
            )`,
        { label: "ZCode", timeout: 10_000, maxBuffer: 1024 * 1024, readOnly: true },
      );
      const floor = coerceEpochMs(Array.isArray(rows) ? rows[0]?.floor : null);
      return floor > 0 ? floor : null;
    } catch (_error) {
      return null;
    }
  }
  let messages;
  try {
    messages = readZcodeDbMessages(dbPath, { readOnly: true });
  } catch (_error) {
    return null;
  }
  let floor = Number.POSITIVE_INFINITY;
  for (const message of Array.isArray(messages) ? messages : []) {
    const ms = coerceEpochMs(
      message?.timeUpdated ?? message?.data?.time?.completed ?? message?.data?.time?.created,
    );
    if (ms > 0) floor = Math.min(floor, ms);
  }
  return Number.isFinite(floor) ? floor : null;
}

// Shared wipe window across installs: the LATEST per-install floor (most
// conservative). Any listed install that exists but cannot report a floor
// defers the wipe — silently taking min() would erase another install's history.
function resolveZcodeRebuildFloorMs(dbPaths = []) {
  const paths = [...new Set((Array.isArray(dbPaths) ? dbPaths : []).filter(Boolean))];
  if (paths.length === 0) return null;
  let latestFloor = 0;
  for (const dbPath of paths) {
    if (!fssync.existsSync(dbPath)) continue;
    const floor = resolveZcodeDbRebuildFloorMs(dbPath);
    if (!Number.isFinite(floor)) return null;
    latestFloor = Math.max(latestFloor, floor);
  }
  return latestFloor > 0 ? latestFloor : null;
}

// Wipe starts at the half-hour bucket that contains the first live message so
// that bucket is rebuilt (not preserved) and cannot be double-counted after
// cursors.zcode is cleared.
function zcodePreserveBeforeMsFromFloor(floorMs) {
  if (!Number.isFinite(floorMs)) return null;
  const iso = toUtcHalfHourStart(floorMs);
  const ms = iso ? Date.parse(iso) : floorMs;
  return Number.isFinite(ms) ? ms : null;
}

function hasZcodeCursorHistory(cursors) {
  return hasZcodeCursorState(cursors);
}

function pruneZcodeMessageIndexForRebuild(messages, preserveBeforeMs) {
  if (!messages || typeof messages !== "object") return 0;
  let removed = 0;
  for (const key of Object.keys(messages)) {
    const entry = messages[key];
    const attribution = typeof entry?.attribution === "string"
      ? entry.attribution.split("	")[0]
      : entry?.attribution?.bucketStart;
    const bucketStart = typeof attribution === "string" ? attribution : "";
    // Keep unattributed entries: older cursors omit attribution, and deleting
    // them re-adds still-present pre-window legacy messages onto preserved
    // buckets (5000→10000). Prefer a possible in-window under-correction over
    // permanent double-count (#828).
    if (!bucketStart) continue;
    if (zcodeHourIsPreWindow(bucketStart, preserveBeforeMs)) continue;
    delete messages[key];
    removed += 1;
  }
  return removed;
}

function pruneZcodeMessageCursorForRebuild(cursors, preserveBeforeMs) {
  if (!cursors || typeof cursors !== "object") return;
  if (!Number.isFinite(preserveBeforeMs)) {
    delete cursors.zcode;
    return;
  }
  const root = cursors.zcode;
  if (!root || typeof root !== "object") {
    delete cursors.zcode;
    return;
  }
  pruneZcodeMessageIndexForRebuild(root.messages, preserveBeforeMs);
  for (const nestedKey of ["native", "wsl"]) {
    const nested = root[nestedKey];
    if (nested && typeof nested === "object") {
      pruneZcodeMessageIndexForRebuild(nested.messages, preserveBeforeMs);
    }
  }
  const hasMessages = Object.keys(root.messages || {}).length > 0
    || Object.keys(root.native?.messages || {}).length > 0
    || Object.keys(root.wsl?.messages || {}).length > 0;
  if (!hasMessages) delete cursors.zcode;
}

async function queueFileHasZcodeRows(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      if (row?.source === "zcode") return true;
    } catch (_error) {
      // keep scanning
    }
  }
  return false;
}

function isCompletedZcodeMigration(entry) {
  return Boolean(entry) && !(typeof entry === "object" && entry.skipped);
}

async function dropZcodeQueueRows(filePath, {
  retainRetractions = false,
  preserveBeforeMs = null,
} = {}) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return { removed: 0, retractions: 0, preserved: 0 };
    throw error;
  }
  const kept = [];
  const retractions = new Map();
  let removed = 0;
  let preserved = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_error) {
      kept.push(line);
      continue;
    }
    if (row?.source === "zcode") {
      const model = typeof row.model === "string" && row.model.trim()
        ? row.model.trim()
        : "unknown";
      const hourStart = typeof row.hour_start === "string" ? row.hour_start : "";
      // #828: keep pre-window rows intact — the live DB cannot rebuild them.
      if (zcodeHourIsPreWindow(hourStart, preserveBeforeMs)) {
        kept.push(line);
        preserved += 1;
        continue;
      }
      removed += 1;
      if (retainRetractions && hourStart) {
        retractions.set(`${model}|${hourStart}`, {
          source: "zcode",
          model,
          hour_start: hourStart,
          input_tokens: 0,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 0,
          conversation_count: 0,
        });
      }
      continue;
    }
    kept.push(line);
  }
  if (removed === 0) return { removed: 0, retractions: 0, preserved };
  await backupExistingFile(filePath);
  const tmp = `${filePath}.zcoderepair.${process.pid}.${Date.now()}`;
  const rewritten = [
    ...kept,
    ...[...retractions.values()].map((row) => JSON.stringify(row)),
  ];
  await fs.writeFile(tmp, rewritten.length ? rewritten.join("\n") + "\n" : "", "utf8");
  await fs.rename(tmp, filePath);
  return { removed, retractions: retractions.size, preserved };
}

async function repairZcodeUsageMigration({
  migrationKey,
  queueStateNote,
  cursors,
  queuePath,
  queueStatePath,
  projectQueuePath,
  projectQueueStatePath,
  rebuildFloorMs = null,
} = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  // Mirror Codex: a prior {skipped:true} must retry once the live ledger can
  // establish a rebuild floor (or the pre-window history is gone).
  const prior = migrations[migrationKey];
  if (isCompletedZcodeMigration(prior)) return false;

  const preserveBeforeMs = zcodePreserveBeforeMsFromFloor(rebuildFloorMs);
  // Empty / unreadable live ledger + existing history => refuse the wipe. The
  // forward reader still works; only this historical correction defers (#828).
  if (preserveBeforeMs == null) {
    const hasQueueHistory = await queueFileHasZcodeRows(queuePath)
      || await queueFileHasZcodeRows(projectQueuePath);
    if (hasZcodeCursorHistory(cursors) || hasQueueHistory) {
      migrations[migrationKey] = {
        skipped: true,
        reason: "zcode_rebuild_floor_unavailable",
        at: new Date().toISOString(),
      };
      return false;
    }
  }

  const mainRepair = await dropZcodeQueueRows(queuePath, {
    retainRetractions: true,
    preserveBeforeMs,
  });
  const projectRepair = projectQueuePath
    ? await dropZcodeQueueRows(projectQueuePath, { preserveBeforeMs })
    : { removed: 0, retractions: 0, preserved: 0 };

  const hourly = cursors.hourly && typeof cursors.hourly === "object" ? cursors.hourly : null;
  if (hourly?.buckets) {
    for (const key of Object.keys(hourly.buckets)) {
      if (!key.startsWith("zcode|")) continue;
      if (zcodeHourIsPreWindow(zcodeHourFromMainBucketKey(key), preserveBeforeMs)) continue;
      delete hourly.buckets[key];
    }
  }
  if (hourly?.groupQueued) {
    for (const key of Object.keys(hourly.groupQueued)) {
      if (!key.startsWith("zcode|")) continue;
      if (zcodeHourIsPreWindow(zcodeHourFromGroupQueuedKey(key), preserveBeforeMs)) continue;
      delete hourly.groupQueued[key];
    }
  }
  const projectHourly = cursors.projectHourly && typeof cursors.projectHourly === "object"
    ? cursors.projectHourly
    : null;
  if (projectHourly?.buckets) {
    for (const key of Object.keys(projectHourly.buckets)) {
      if (!key.includes("|zcode|")) continue;
      if (zcodeHourIsPreWindow(zcodeHourFromProjectBucketKey(key), preserveBeforeMs)) continue;
      delete projectHourly.buckets[key];
    }
  }
  // Keep pre-window message dedup so preserved buckets are not double-counted
  // when legacy rows still exist in the live DB. Clear only in-window (and
  // unattributed) cursor entries so the rescan can rebuild those hours.
  pruneZcodeMessageCursorForRebuild(cursors, preserveBeforeMs);

  if (mainRepair.removed > 0) {
    await resetUploadOffsetForZcodeRepair(queueStatePath, queueStateNote);
  }
  if (projectRepair.removed > 0) {
    await resetUploadOffsetForZcodeRepair(projectQueueStatePath, queueStateNote);
  }
  migrations[migrationKey] = {
    appliedAt: new Date().toISOString(),
    removedMain: mainRepair.removed,
    removedProject: projectRepair.removed,
    retractions: mainRepair.retractions,
    preservedMain: mainRepair.preserved || 0,
    preservedProject: projectRepair.preserved || 0,
    rebuildFloorMs: preserveBeforeMs,
  };
  return true;
}

function zcodeRowTotals(row) {
  return {
    input_tokens: Number(row?.input_tokens) || 0,
    cached_input_tokens: Number(row?.cached_input_tokens) || 0,
    cache_creation_input_tokens: Number(row?.cache_creation_input_tokens) || 0,
    output_tokens: Number(row?.output_tokens) || 0,
    reasoning_output_tokens: Number(row?.reasoning_output_tokens) || 0,
    total_tokens: Number(row?.total_tokens) || 0,
    // Queue-schema completeness (audit fix): backup rows written by older
    // versions may lack these two columns; restored rows must carry them or
    // the restored (recovered) usage uploads with a shape the cloud and the
    // local readers have to heal. billable falls back to total (zcode counts
    // plan-included usage as billable), cost to 0 (read-side pricing recomputes).
    billable_total_tokens: row?.billable_total_tokens == null
      ? Math.max(0, Number(row?.total_tokens) || 0)
      : Math.max(0, Number(row.billable_total_tokens) || 0),
    total_cost_usd: Math.max(0, Number(row?.total_cost_usd) || 0),
    conversation_count: Number(row?.conversation_count) || 0,
  };
}

function zcodeTotalsDominate(candidate, baseline) {
  if (!candidate) return false;
  if (!baseline) return (candidate.total_tokens || 0) > 0;
  return (candidate.total_tokens || 0) > (baseline.total_tokens || 0);
}

async function collectZcodeQueuePeaks(filePath, { beforeMs = null } = {}) {
  const peaks = new Map();
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return peaks;
    throw error;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_error) {
      continue;
    }
    if (row?.source !== "zcode") continue;
    const model = typeof row.model === "string" && row.model.trim()
      ? row.model.trim()
      : "unknown";
    const hourStart = typeof row.hour_start === "string" ? row.hour_start : "";
    if (!hourStart) continue;
    if (beforeMs != null && !zcodeHourIsPreWindow(hourStart, beforeMs)) continue;
    const key = `${model}|${hourStart}`;
    const totals = zcodeRowTotals(row);
    const prev = peaks.get(key);
    if (!prev || zcodeTotalsDominate(totals, prev.totals)) {
      peaks.set(key, { model, hour_start: hourStart, totals });
    }
  }
  return peaks;
}

// Last-wins per key (cloud replay semantics). A historical peak of 9000 followed
// by a repair retraction of 0 must report 0 so restore still re-appends.
async function collectZcodeQueueLatest(filePath, { beforeMs = null } = {}) {
  const latest = new Map();
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return latest;
    throw error;
  }
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_error) {
      continue;
    }
    if (row?.source !== "zcode") continue;
    const model = typeof row.model === "string" && row.model.trim()
      ? row.model.trim()
      : "unknown";
    const hourStart = typeof row.hour_start === "string" ? row.hour_start : "";
    if (!hourStart) continue;
    if (beforeMs != null && !zcodeHourIsPreWindow(hourStart, beforeMs)) continue;
    latest.set(`${model}|${hourStart}`, {
      model,
      hour_start: hourStart,
      totals: zcodeRowTotals(row),
    });
  }
  return latest;
}

async function listZcodeQueueBackupPaths(queuePath) {
  if (typeof queuePath !== "string" || !queuePath) return [];
  const dir = path.dirname(queuePath);
  const base = path.basename(queuePath);
  let names;
  try {
    names = await fs.readdir(dir);
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  return names
    .filter((name) => name.startsWith(`${base}.bak.`))
    .map((name) => path.join(dir, name))
    .sort();
}

async function repairZcodePruneWindowRestore({
  cursors,
  queuePath,
  queueStatePath,
  dbPaths = [],
  rebuildFloorMs: rebuildFloorMsOption = null,
} = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  const prior = migrations[ZCODE_PRUNE_WINDOW_RESTORE_KEY];
  if (isCompletedZcodeMigration(prior)) return false;

  const rebuildFloorMs = Number.isFinite(rebuildFloorMsOption)
    ? rebuildFloorMsOption
    : resolveZcodeRebuildFloorMs(dbPaths);
  if (!Number.isFinite(rebuildFloorMs)) {
    migrations[ZCODE_PRUNE_WINDOW_RESTORE_KEY] = {
      skipped: true,
      reason: "zcode_rebuild_floor_unavailable",
      at: new Date().toISOString(),
    };
    return false;
  }

  const backupPaths = await listZcodeQueueBackupPaths(queuePath);
  if (backupPaths.length === 0) {
    migrations[ZCODE_PRUNE_WINDOW_RESTORE_KEY] = {
      skipped: true,
      reason: "zcode_queue_backup_missing",
      at: new Date().toISOString(),
      rebuildFloorMs,
    };
    return false;
  }

  const preserveBeforeMs = zcodePreserveBeforeMsFromFloor(rebuildFloorMs);
  const backupPeaks = new Map();
  for (const backupPath of backupPaths) {
    const peaks = await collectZcodeQueuePeaks(backupPath, { beforeMs: preserveBeforeMs });
    for (const [key, peak] of peaks) {
      const prev = backupPeaks.get(key);
      if (!prev || zcodeTotalsDominate(peak.totals, prev.totals)) {
        backupPeaks.set(key, peak);
      }
    }
  }
  if (backupPeaks.size === 0) {
    migrations[ZCODE_PRUNE_WINDOW_RESTORE_KEY] = {
      appliedAt: new Date().toISOString(),
      restored: 0,
      rebuildFloorMs,
      preserveBeforeMs,
      note: "no_pre_window_peaks_in_backups",
    };
    return true;
  }

  const liveLatest = await collectZcodeQueueLatest(queuePath, { beforeMs: preserveBeforeMs });
  const hourly = (cursors.hourly ||= { buckets: {}, groupQueued: {} });
  hourly.buckets ||= {};
  const restorations = [];
  for (const [key, peak] of backupPeaks) {
    const bucketKeyName = bucketKey("zcode", peak.model, peak.hour_start);
    const live = liveLatest.get(key)?.totals || null;
    // Compare against the latest queue emission (last-wins), not historical peaks
    // or cursor buckets — a 9000→0 retraction must still restore.
    if (!zcodeTotalsDominate(peak.totals, live)) {
      const bucketTotals = hourly.buckets[bucketKeyName]?.totals
        ? zcodeRowTotals(hourly.buckets[bucketKeyName].totals)
        : null;
      if (bucketTotals && zcodeTotalsDominate(peak.totals, bucketTotals)) {
        hourly.buckets[bucketKeyName] = {
          ...(hourly.buckets[bucketKeyName] || {}),
          totals: { ...peak.totals },
          hour_start: peak.hour_start,
          source: "zcode",
          model: peak.model,
        };
      }
      continue;
    }
    restorations.push(peak);
    hourly.buckets[bucketKeyName] = {
      ...(hourly.buckets[bucketKeyName] || {}),
      totals: { ...peak.totals },
      hour_start: peak.hour_start,
      source: "zcode",
      model: peak.model,
    };
  }

  if (restorations.length === 0) {
    migrations[ZCODE_PRUNE_WINDOW_RESTORE_KEY] = {
      appliedAt: new Date().toISOString(),
      restored: 0,
      rebuildFloorMs,
      backupsConsidered: backupPaths.length,
      note: "backup_peaks_not_higher",
    };
    return true;
  }

  await backupExistingFile(queuePath);
  const append = restorations.map((peak) => JSON.stringify(buildZcodeRestorationRow(peak)));
  await fs.appendFile(queuePath, `${append.join("\n")}\n`, "utf8");
  await resetUploadOffsetForZcodeRepair(
    queueStatePath,
    "reset_after_zcode_prune_window_restore_2026_10",
  );
  migrations[ZCODE_PRUNE_WINDOW_RESTORE_KEY] = {
    appliedAt: new Date().toISOString(),
    restored: restorations.length,
    rebuildFloorMs,
    backupsConsidered: backupPaths.length,
  };
  return true;
}

async function repairZcodeNativeUsageMigration(options = {}) {
  return repairZcodeUsageMigration({
    ...options,
    migrationKey: ZCODE_NATIVE_USAGE_REPAIR_KEY,
    queueStateNote: "reset_after_zcode_native_usage_repair_2026_08",
  });
}

async function repairZcodeInclusiveTokenMigration(options = {}) {
  return repairZcodeUsageMigration({
    ...options,
    migrationKey: ZCODE_INCLUSIVE_TOKEN_REPAIR_KEY,
    queueStateNote: "reset_after_zcode_inclusive_token_repair_2026_09",
  });
}
module.exports = {
  ZCODE_NATIVE_USAGE_REPAIR_KEY,
  ZCODE_INCLUSIVE_TOKEN_REPAIR_KEY,
  ZCODE_PRUNE_WINDOW_RESTORE_KEY,
  resolveZcodeDbRebuildFloorMs,
  resolveZcodeRebuildFloorMs,
  zcodeRowTotals,
  buildZcodeRestorationRow,
  repairZcodeNativeUsageMigration,
  repairZcodeInclusiveTokenMigration,
  repairZcodePruneWindowRestore,
};
