"use strict";

// CodeBuddy log/JSONL overlap repair (issue #403), split out of
// commands/sync.js. Rebuilds CodeBuddy history from the discoverable sources
// and retracts keys the rebuild cannot reproduce.

const fs = require("node:fs");
const path = require("node:path");

const { ensureDir } = require("../lib/fs");
const {
  bucketKey,
  codebuddyJsonlHasUsage,
  parseCodebuddyIncremental,
} = require("../lib/rollout");

const CODEBUDDY_LOG_JSONL_REPAIR_KEY = "codebuddyLogJsonlOverlapRepair_2026_08";

function codebuddyUsageRowKey(row) {
  if (!row || row.source !== "codebuddy") return null;
  const model = typeof row.model === "string" && row.model ? row.model : "unknown";
  const hourStart = typeof row.hour_start === "string" && row.hour_start ? row.hour_start : null;
  return hourStart ? bucketKey("codebuddy", model, hourStart) : null;
}

function codebuddyZeroUsageRow(model, hourStart) {
  return {
    source: "codebuddy",
    model: model || "unknown",
    hour_start: hourStart,
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    billable_total_tokens: 0,
    conversation_count: 0,
  };
}

// Issue #403 historical repair. Before the JSONL usage fix, CodeBuddy could
// ingest the same round-trip once from ~/.codebuddy/projects and once from the
// IDE extension log. The forward resolver now disables logs whenever any JSONL
// has usable rawUsage, but existing queues/hourly state need one guarded,
// atomic rebuild so the old double-count is not left visible forever.
async function repairCodebuddyLogJsonlOverlap({
  cursors,
  queuePath,
  queueStatePath,
  codebuddyFiles,
  env = process.env,
} = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  const prior = migrations[CODEBUDDY_LOG_JSONL_REPAIR_KEY];
  if (prior && !(typeof prior === "object" && prior.skipped)) return false;

  const files = Array.isArray(codebuddyFiles) ? codebuddyFiles : [];
  const jsonlFiles = files.filter((filePath) => typeof filePath === "string" && filePath.endsWith(".jsonl"));
  const logFiles = files.filter((filePath) => typeof filePath === "string" && filePath.endsWith(".log"));
  const hasDetailedJsonl = jsonlFiles.some((filePath) => codebuddyJsonlHasUsage(filePath));

  const hourly = cursors.hourly && typeof cursors.hourly === "object" ? cursors.hourly : {};
  const liveHourlyKeys = new Set(
    Object.keys(hourly.buckets || {}).filter((key) => key.startsWith("codebuddy|")),
  );
  let queueRaw = "";
  try {
    queueRaw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  const queueCodebuddyKeys = new Set();
  const keptQueueLines = [];
  for (const line of queueRaw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      keptQueueLines.push(line);
      continue;
    }
    const key = codebuddyUsageRowKey(row);
    if (!key) {
      keptQueueLines.push(line);
      continue;
    }
    queueCodebuddyKeys.add(key);
  }
  const liveKeys = new Set([...liveHourlyKeys, ...queueCodebuddyKeys]);
  if (liveKeys.size === 0) {
    migrations[CODEBUDDY_LOG_JSONL_REPAIR_KEY] = {
      status: "noop",
      appliedAt: new Date().toISOString(),
      reason: "no-codebuddy-history",
    };
    return false;
  }

  // Keep this condition retryable when old CodeBuddy history exists but the
  // extension log is temporarily rotated/missing. A permanent no-op here
  // would close the repair window before a later full scan can rediscover it.
  if (jsonlFiles.length === 0 || logFiles.length === 0 || !hasDetailedJsonl) {
    migrations[CODEBUDDY_LOG_JSONL_REPAIR_KEY] = {
      skipped: true,
      reason: "no-mixed-detailed-sources",
      at: new Date().toISOString(),
    };
    return false;
  }

  // A rebuild from the currently discoverable JSONL is safe only if every
  // file previously tailed by CodeBuddy is still available in this scan. If a
  // rotated/deleted log is missing, retain the user's history and retry later
  // rather than silently erasing an unreproducible bucket.
  const discovered = new Set(files);
  const priorFiles = cursors.codebuddy?.fileOffsets && typeof cursors.codebuddy.fileOffsets === "object"
    ? Object.keys(cursors.codebuddy.fileOffsets)
    : [];
  const missingPriorFile = priorFiles.find((filePath) => !discovered.has(filePath));
  if (missingPriorFile) {
    migrations[CODEBUDDY_LOG_JSONL_REPAIR_KEY] = {
      skipped: true,
      reason: "codebuddy_file_unreproducible",
      filePath: missingPriorFile,
      at: new Date().toISOString(),
    };
    return false;
  }

  const tmpQueue = `${queuePath}.codebuddyrebuild.${process.pid}.${Date.now()}`;
  const tmpCursors = {
    version: 1,
    hourly: { buckets: {}, groupQueued: {} },
    codebuddy: {},
  };
  let rebuiltRows = [];
  try {
    await parseCodebuddyIncremental({
      // Rebuild from both sources. The parser now preserves legacy-only log
      // sessions while consuming mirrored log fingerprints against JSONL, so
      // rebuilding JSONL alone would silently discard valid pre-rawUsage data.
      projectFiles: files,
      cursors: tmpCursors,
      queuePath: tmpQueue,
      env,
    });
    let rebuiltRaw = "";
    try {
      rebuiltRaw = await fs.readFile(tmpQueue, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    rebuiltRows = rebuiltRaw.split("\n").filter((line) => line.trim());
  } catch (e) {
    console.error("[sync] CodeBuddy log/JSONL repair: rebuild failed, leaving history untouched:", e?.message || e);
    return false;
  } finally {
    await fs.rm(tmpQueue, { force: true }).catch(() => {});
  }

  const rebuiltKeys = new Set();
  const validRebuiltRows = [];
  for (const line of rebuiltRows) {
    let row;
    try { row = JSON.parse(line); } catch (_e) { continue; }
    const key = codebuddyUsageRowKey(row);
    if (!key) continue;
    rebuiltKeys.add(key);
    validRebuiltRows.push(line);
  }
  if (rebuiltKeys.size === 0) {
    migrations[CODEBUDDY_LOG_JSONL_REPAIR_KEY] = {
      skipped: true,
      reason: "jsonl_rebuild_empty",
      at: new Date().toISOString(),
    };
    return false;
  }

  const staleRetractions = [];
  for (const key of liveKeys) {
    if (rebuiltKeys.has(key)) continue;
    const [, model, ...hourParts] = key.split("|");
    staleRetractions.push(JSON.stringify(codebuddyZeroUsageRow(model, hourParts.join("|"))));
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
    if (key.startsWith("codebuddy|")) delete nextHourly.buckets[key];
  }
  for (const key of Object.keys(nextHourly.groupQueued)) {
    if (key.startsWith("codebuddy|")) delete nextHourly.groupQueued[key];
  }
  for (const [key, bucket] of Object.entries(tmpCursors.hourly.buckets || {})) {
    if (key.startsWith("codebuddy|")) nextHourly.buckets[key] = bucket;
  }
  for (const [key, value] of Object.entries(tmpCursors.hourly.groupQueued || {})) {
    if (key.startsWith("codebuddy|")) nextHourly.groupQueued[key] = value;
  }
  cursors.codebuddy = tmpCursors.codebuddy || {};

  let uploadState = {};
  try { uploadState = JSON.parse(await fs.readFile(queueStatePath, "utf8")); } catch (_e) {}
  uploadState.offset = 0;
  uploadState.updatedAt = new Date().toISOString();
  uploadState.note = "reset_after_codebuddy_log_jsonl_repair_2026_08";
  await ensureDir(path.dirname(queueStatePath));
  await fs.writeFile(queueStatePath, JSON.stringify(uploadState, null, 2) + "\n", "utf8");

  migrations[CODEBUDDY_LOG_JSONL_REPAIR_KEY] = {
    status: "applied",
    appliedAt: new Date().toISOString(),
    jsonlFiles: jsonlFiles.length,
    logFiles: logFiles.length,
    previousBuckets: liveKeys.size,
    rebuiltBuckets: rebuiltKeys.size,
    retractedBuckets: staleRetractions.length,
  };
  return true;
}

// WorkBuddy's 0.87.9 SQLite fallback treated the bounded session_usage.used
// context snapshot as cumulative input tokens. A current database proves that
// assumption false (`size` is a 192k context limit while trace input totals can
// exceed it), so rebuild historical WorkBuddy buckets from JSONL/trace sources
// once the new parser is available. The same missing-source guard used by the
// other data migrations keeps this recoverable: if a previously contributing
// file is gone, leave history untouched and stop adding new context snapshots.

module.exports = {
  CODEBUDDY_LOG_JSONL_REPAIR_KEY,
  codebuddyUsageRowKey,
  codebuddyZeroUsageRow,
  repairCodebuddyLogJsonlOverlap,
};
