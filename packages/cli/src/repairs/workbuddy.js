"use strict";

// WorkBuddy context-usage repair, split out of commands/sync.js. The 0.87.9
// SQLite fallback counted the bounded context snapshot as cumulative input;
// this rebuilds WorkBuddy buckets from JSONL/trace sources.

const fs = require("node:fs");
const path = require("node:path");

const { ensureDir } = require("../lib/fs");
const { bucketKey, parseWorkbuddyIncremental } = require("../lib/rollout");

const WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY = "workbuddyContextUsageRepair_2026_08";

async function repairWorkbuddyContextUsage({
  cursors,
  queuePath,
  queueStatePath,
  workbuddyFiles,
  env = process.env,
} = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  const prior = migrations[WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY];
  if (prior && !(typeof prior === "object" && prior.skipped)) return false;

  const hourly = cursors.hourly && typeof cursors.hourly === "object" ? cursors.hourly : {};
  const liveHourlyKeys = new Set(
    Object.keys(hourly.buckets || {}).filter((key) => key.startsWith("workbuddy|")),
  );
  let queueRaw = "";
  try {
    queueRaw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  const queueWorkbuddyKeys = new Set();
  const keptQueueLines = [];
  for (const line of queueRaw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try { row = JSON.parse(line); } catch (_e) {
      keptQueueLines.push(line);
      continue;
    }
    if (row && row.source === "workbuddy" && typeof row.model === "string" && typeof row.hour_start === "string") {
      queueWorkbuddyKeys.add(bucketKey("workbuddy", row.model || "unknown", row.hour_start));
    } else {
      keptQueueLines.push(line);
    }
  }
  const liveKeys = new Set([...liveHourlyKeys, ...queueWorkbuddyKeys]);
  if (liveKeys.size === 0) {
    migrations[WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY] = {
      status: "noop",
      appliedAt: new Date().toISOString(),
      reason: "no-workbuddy-history",
    };
    return false;
  }

  const files = Array.isArray(workbuddyFiles) ? workbuddyFiles : [];
  const discoveredPaths = new Set(
    files.map((entry) => typeof entry === "string" ? entry : entry?.path).filter(Boolean),
  );
  const priorFiles = cursors.workbuddy?.fileOffsets && typeof cursors.workbuddy.fileOffsets === "object"
    ? Object.keys(cursors.workbuddy.fileOffsets)
    : [];
  if (files.length === 0 || priorFiles.some((filePath) => !discoveredPaths.has(filePath))) {
    migrations[WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY] = {
      skipped: true,
      reason: files.length === 0 ? "no-rebuild-sources" : "workbuddy_file_unreproducible",
      at: new Date().toISOString(),
    };
    return false;
  }

  const tmpQueue = `${queuePath}.workbuddyrebuild.${process.pid}.${Date.now()}`;
  const tmpCursors = {
    version: 1,
    hourly: { buckets: {}, groupQueued: {} },
    workbuddy: {},
  };
  let rebuiltRows = [];
  try {
    await parseWorkbuddyIncremental({
      projectFiles: files,
      cursors: tmpCursors,
      queuePath: tmpQueue,
      env,
    });
    let rebuiltRaw = "";
    try { rebuiltRaw = await fs.readFile(tmpQueue, "utf8"); } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    rebuiltRows = rebuiltRaw.split("\n").filter((line) => line.trim());
  } catch (e) {
    console.error("[sync] WorkBuddy context-usage repair: rebuild failed, leaving history untouched:", e?.message || e);
    return false;
  } finally {
    await fs.rm(tmpQueue, { force: true }).catch(() => {});
  }

  const rebuiltKeys = new Set();
  const validRebuiltRows = [];
  for (const line of rebuiltRows) {
    let row;
    try { row = JSON.parse(line); } catch (_e) { continue; }
    if (!row || row.source !== "workbuddy" || typeof row.model !== "string" || typeof row.hour_start !== "string") continue;
    rebuiltKeys.add(bucketKey("workbuddy", row.model || "unknown", row.hour_start));
    validRebuiltRows.push(line);
  }

  const staleRetractions = [];
  for (const key of liveKeys) {
    if (rebuiltKeys.has(key)) continue;
    const [, model, ...hourParts] = key.split("|");
    staleRetractions.push(JSON.stringify({
      source: "workbuddy",
      model: model || "unknown",
      hour_start: hourParts.join("|"),
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

  const nextQueueLines = keptQueueLines.concat(staleRetractions, validRebuiltRows);
  await ensureDir(path.dirname(queuePath));
  const queueTmp = `${queuePath}.tmp.${process.pid}.${Date.now()}`;
  await fs.writeFile(queueTmp, nextQueueLines.length ? `${nextQueueLines.join("\n")}\n` : "", "utf8");
  await fs.rename(queueTmp, queuePath);

  const nextHourly = (cursors.hourly ||= { buckets: {}, groupQueued: {} });
  nextHourly.buckets ||= {};
  nextHourly.groupQueued ||= {};
  for (const key of Object.keys(nextHourly.buckets)) {
    if (key.startsWith("workbuddy|")) delete nextHourly.buckets[key];
  }
  for (const key of Object.keys(nextHourly.groupQueued)) {
    if (key.startsWith("workbuddy|")) delete nextHourly.groupQueued[key];
  }
  for (const [key, bucket] of Object.entries(tmpCursors.hourly.buckets || {})) {
    if (key.startsWith("workbuddy|")) nextHourly.buckets[key] = bucket;
  }
  for (const [key, value] of Object.entries(tmpCursors.hourly.groupQueued || {})) {
    if (key.startsWith("workbuddy|")) nextHourly.groupQueued[key] = value;
  }
  // This migration rebuilds totals from a temp queue using empty cursors, so
  // `tmpCursors.workbuddy` carries no project state. Replacing the whole object
  // would drop the project cursor while leaving the published project buckets
  // (cursors.projectHourly and the real project queue) untouched, and the next
  // parse would re-attribute every historical session on top of them. The
  // migration only changes totals, so keep the project cursor as it is.
  const previousWorkbuddyState =
    cursors.workbuddy && typeof cursors.workbuddy === "object" ? cursors.workbuddy : {};
  cursors.workbuddy = {
    ...(tmpCursors.workbuddy || {}),
    ...(previousWorkbuddyState.projectFileOffsets
      ? { projectFileOffsets: previousWorkbuddyState.projectFileOffsets }
      : {}),
    ...(Array.isArray(previousWorkbuddyState.projectSeenIds)
      ? { projectSeenIds: previousWorkbuddyState.projectSeenIds }
      : {}),
  };

  let uploadState = {};
  try { uploadState = JSON.parse(await fs.readFile(queueStatePath, "utf8")); } catch (_e) {}
  uploadState.offset = 0;
  uploadState.updatedAt = new Date().toISOString();
  uploadState.note = "reset_after_workbuddy_context_usage_repair_2026_08";
  await ensureDir(path.dirname(queueStatePath));
  await fs.writeFile(queueStatePath, JSON.stringify(uploadState, null, 2) + "\n", "utf8");

  migrations[WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY] = {
    status: "applied",
    appliedAt: new Date().toISOString(),
    previousBuckets: liveKeys.size,
    rebuiltBuckets: rebuiltKeys.size,
    retractedBuckets: staleRetractions.length,
  };
  return true;
}

// One-time repair (#187): rebuild codex hourly buckets that the inode-keyed
// re-scan double-counted before the codexHashes event-dedup landed, and push
// the corrected values to the cloud. Runs BEFORE the codex parse in the same
// sync: it clears codex hourly state + codexHashes so the parse rebuilds clean,
// atomically strips the inflated codex rows from queue.jsonl, and resets the
// upload offset so the re-uploaded clean rows overwrite the cloud (with no
// stale-high codex rows left in the queue, the ingest's within-batch MAX keeps
// nothing larger, so its overwrite-upsert replaces the inflated cloud rows).
//
// GUARDED against the v6 ground-truth-repair data-loss incident: a clear+reparse
// rebuilds codex buckets ONLY from the codex files this sync re-parses (now both
// sessions/ AND archived_sessions/), so if any codex file that previously
// contributed is gone from disk (genuinely deleted — Codex-Manager log rotation
// or user cleanup) the migration is skipped entirely — the forward dedup fix
// still prevents new double-counting; only this historical correction is deferred.

module.exports = {
  WORKBUDDY_CONTEXT_USAGE_REPAIR_KEY,
  repairWorkbuddyContextUsage,
};
