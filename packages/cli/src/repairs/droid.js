"use strict";

// Droid duplicate-session repair, split out of commands/sync.js: one Droid
// session could be counted twice when the same conversation appeared under two
// session ids, inflating history until this rebuild retracts the duplicate.

const fs = require("node:fs/promises");
const fssync = require("node:fs");
const path = require("node:path");
const {
  ensureDir,
} = require("../lib/fs");
const {
  backupExistingFile,
} = require("../lib/queue-backup");
const {
  reincludeClaudeMemObserverFiles,
} = require("./claude");
const {
  bucketKey,
  droidSessionIdFromPath,
  listDroidSettingsFiles,
  parseDroidIncremental,
  resolveDroidModel,
  toUtcHalfHourStart,
} = require("../lib/rollout");

const DROID_DUP_SESSION_REPAIR_KEY = "droidDupSessionInflationRepair_2026_06";

async function repairDroidDuplicateSessionInflation({ cursors, queuePath, queueStatePath } = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  // Completed run → truthy non-skip sentinel (final). A {skipped:true} object would
  // retry (codex skip-retry semantics; this repair only ever writes done/none).
  const prior = migrations[DROID_DUP_SESSION_REPAIR_KEY];
  if (prior && !(typeof prior === "object" && prior.skipped)) return false;

  // Group current on-disk settings files by session id; collect duplicates.
  let onDisk;
  try {
    onDisk = listDroidSettingsFiles(process.env);
  } catch {
    onDisk = [];
  }
  const bySession = new Map();
  for (const fp of onDisk) {
    const sid = droidSessionIdFromPath(fp);
    if (!sid) continue;
    if (!bySession.has(sid)) bySession.set(sid, []);
    bySession.get(sid).push(fp);
  }
  const dupFiles = [];
  const cleanFiles = [];
  for (const group of bySession.values()) {
    if (group.length > 1) dupFiles.push(...group);
    else cleanFiles.push(...group);
  }
  if (dupFiles.length === 0) {
    migrations[DROID_DUP_SESSION_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  // Map on-disk settings files to the (droid, model, half-hour) bucket keys they
  // emit under the parser's own keying (mirrors parseDroidIncremental).
  const bucketKeysForFiles = (files) => {
    const keys = new Set();
    for (const fp of files) {
      let mtimeMs = 0;
      try {
        mtimeMs = fssync.statSync(fp).mtimeMs;
      } catch {
        continue;
      }
      let settings;
      try {
        settings = JSON.parse(fssync.readFileSync(fp, "utf8"));
      } catch {
        continue;
      }
      if (!settings || typeof settings !== "object" || !settings.tokenUsage) continue;
      const bucketStart = toUtcHalfHourStart(
        new Date(mtimeMs || Date.now()).toISOString(),
      );
      if (!bucketStart) continue;
      keys.add(bucketKey("droid", resolveDroidModel(settings, fp), bucketStart));
    }
    return keys;
  };

  // A bucket key is (source, model, half-hour) — it carries NO session identity.
  // pollutedKeys are the buckets the duplicate files emit to; cleanKeys are buckets
  // a NON-duplicate on-disk session emits to. When a clean session resolves to the
  // same (model, half-hour) as a duplicate file, they collide on one key. We must
  // NOT delete-and-replace such a shared bucket: the rebuild runs over duplicate
  // files only, so replacing the bucket would erase the clean session's tokens
  // (silent data loss). So repair ONLY buckets owned exclusively by duplicate
  // sessions; leave shared buckets intact. Residual inflation in a rare shared
  // bucket is visible and recoverable; destroying real data is not (this is the
  // dedup-needs-identity-proof rule).
  const pollutedKeys = bucketKeysForFiles(dupFiles);
  const cleanKeys = bucketKeysForFiles(cleanFiles);
  const repairKeys = new Set();
  for (const k of pollutedKeys) if (!cleanKeys.has(k)) repairKeys.add(k);
  if (repairKeys.size === 0) {
    migrations[DROID_DUP_SESSION_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  // Ground-truth rebuild into throwaway state over the DUPLICATE files only
  // (parseDroidIncremental de-dupes its own input → canonical per session). On any
  // throw, leave all state untouched and do NOT set the sentinel (retry next sync).
  let rebuilt;
  const tmpQueue = `${queuePath}.droidrebuild.${process.pid}.${Date.now()}`;
  try {
    const tmpCursors = { hourly: { buckets: {}, groupQueued: {} }, droid: {} };
    await parseDroidIncremental({
      settingsFiles: dupFiles,
      cursors: tmpCursors,
      queuePath: tmpQueue,
      env: process.env,
      prune: true,
    });
    let tmpRaw = "";
    try {
      tmpRaw = await fs.readFile(tmpQueue, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    rebuilt = {
      buckets: tmpCursors.hourly.buckets || {},
      sessionTotals: (tmpCursors.droid && tmpCursors.droid.sessionTotals) || {},
      queueRows: tmpRaw.split("\n").filter((l) => l.trim()),
    };
  } catch (e) {
    console.error(
      "[sync] droid dup-session repair: rebuild failed, leaving all data untouched:",
      e?.message || e,
    );
    return false;
  } finally {
    await fs.rm(tmpQueue, { force: true }).catch(() => {});
  }

  // Inflation present? Compare live vs rebuilt totals over the repair-scoped keys
  // only. Fire only on live > rebuilt (real inflation) — never on a fresh install
  // (live 0).
  const liveBuckets = (cursors.hourly && cursors.hourly.buckets) || {};
  let liveScoped = 0;
  let rebuiltScoped = 0;
  for (const key of repairKeys) {
    liveScoped += Number(liveBuckets[key]?.totals?.total_tokens || 0);
    rebuiltScoped += Number(rebuilt.buckets[key]?.totals?.total_tokens || 0);
  }
  if (liveScoped <= rebuiltScoped) {
    migrations[DROID_DUP_SESSION_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  // ── COMMIT (atomic) ──
  await ensureDir(path.dirname(queuePath));
  await backupExistingFile(queuePath);

  // 1. queue.jsonl: keep every non-droid line verbatim (incl. unparseable) and
  //    every droid row whose bucket key is NOT in repairKeys (clean + shared +
  //    deleted-session history). Drop droid rows in repairKeys; append rebuilt rows.
  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  // A queue line is in scope if it's a droid row whose bucket is in repairKeys.
  // Unparseable / non-droid / clean / shared droid rows are kept verbatim.
  const isRepairDroidRow = (line) => {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      return false;
    }
    return (
      row?.source === "droid" &&
      repairKeys.has(bucketKey("droid", row.model, row.hour_start))
    );
  };
  const kept = raw
    .split("\n")
    .filter((line) => line.trim() && !isRepairDroidRow(line));
  const rebuiltRepairRows = rebuilt.queueRows.filter(isRepairDroidRow);
  const tmp = `${queuePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(
    tmp,
    kept.concat(rebuiltRepairRows).join("\n") + "\n",
    "utf8",
  );
  await fs.rename(tmp, queuePath);

  // 2. live hourly buckets: delete repair-scoped droid keys, install the rebuilt
  //    buckets for those keys. Other droid buckets untouched.
  const hourly = (cursors.hourly ||= { version: 3, buckets: {}, groupQueued: {} });
  hourly.buckets ||= {};
  hourly.groupQueued ||= {};
  for (const key of repairKeys) {
    delete hourly.buckets[key];
    if (rebuilt.buckets[key]) hourly.buckets[key] = rebuilt.buckets[key];
  }
  // Defensive: droid never uses the legacy aggregate path, but drop any stale droid
  // group markers so a repaired hour can't re-emit as model=unknown.
  for (const gk of Object.keys(hourly.groupQueued)) {
    if (gk.startsWith("droid|")) delete hourly.groupQueued[gk];
  }

  // 3. session cursor: overwrite ONLY the duplicate sessions with the ground-truth
  //    rebuild so the later same-sync droid parse short-circuits (mtime match) and
  //    emits nothing. Clean sessions' cursor entries are correct already — leave
  //    them, or the later parse would re-emit them from zero.
  const droidState = (cursors.droid ||= {});
  if (!droidState.sessionTotals || typeof droidState.sessionTotals !== "object") {
    droidState.sessionTotals = {};
  }
  for (const sid of Object.keys(rebuilt.sessionTotals)) {
    droidState.sessionTotals[sid] = rebuilt.sessionTotals[sid];
  }
  droidState.updatedAt = new Date().toISOString();

  // 4. reset the cloud upload offset so corrected rows re-upload (idempotent upsert).
  if (typeof queueStatePath === "string" && queueStatePath) {
    let uploadState = {};
    try {
      uploadState = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
    } catch {
      uploadState = {};
    }
    uploadState.offset = 0;
    uploadState.updatedAt = new Date().toISOString();
    uploadState.note = "reset_after_droid_dup_session_2026_06";
    await fs.writeFile(queueStatePath, JSON.stringify(uploadState));
  }

  migrations[DROID_DUP_SESSION_REPAIR_KEY] = {
    status: "done",
    at: new Date().toISOString(),
    keysRepaired: repairKeys.size,
    keysSkippedSharedWithCleanSession: pollutedKeys.size - repairKeys.size,
    liveBefore: liveScoped,
    rebuiltAfter: rebuiltScoped,
    deltaReclaimed: liveScoped - rebuiltScoped,
  };
  return true;
}

// One-time repair migration: rebuild source=claude rows in queue.jsonl from
// the actual jsonl files using ccusage's algorithm (msgId+reqId global
// dedup). Earlier `reincludeClaudeMemObserverFiles` versions (v1/v2/v3) each
// reset the hash set and re-read observer jsonls, which silently inflated
// queue.jsonl's claude totals by ~40%. We do an atomic rewrite — keep all
// non-claude rows verbatim, replace every claude/claude-mem row with the
// ground-truth set — then reset cursors so the next incremental sync stays
// in sync, and reset the cloud upload offset so the corrected rows actually
// reach the cloud (the ingest endpoint upserts by (source, model,
// hour_start), so re-uploading other sources is idempotent).

module.exports = {
  DROID_DUP_SESSION_REPAIR_KEY,
  repairDroidDuplicateSessionInflation,
};
