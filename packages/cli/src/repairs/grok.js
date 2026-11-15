"use strict";

// Grok append-only repair, split out of commands/sync.js. The pre-0.2 Grok
// reader replaced hourly rows instead of appending, so historical buckets were
// overwritten by whichever pass ran last. This rebuilds them from the persisted
// session snapshots (the only source that still knows the totals) and retracts
// keys the snapshots cannot reproduce; idempotent via cursors.grok.migrations.

const path = require("node:path");
const fs = require("node:fs/promises");

const { ensureDir } = require("../lib/fs");
const { backupExistingFile } = require("../lib/queue-backup");
const { bucketKey, totalsKey } = require("../lib/rollout");

const GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY = "grokAppendOnlyRepair_2026_05_v4";

function normalizeGrokRepairSource(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeGrokRepairModel(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "grok-build";
}

function normalizeGrokRepairNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function toGrokRepairHalfHourStart(value) {
  if (value == null) return null;
  const millis =
    typeof value === "number"
      ? value < 10_000_000_000
        ? value * 1000
        : value
      : Date.parse(String(value));
  if (!Number.isFinite(millis)) return null;
  const halfHourMs = 30 * 60 * 1000;
  return new Date(Math.floor(millis / halfHourMs) * halfHourMs).toISOString();
}

function estimateGrokRepairTotals(totalTokens, conversationCount) {
  const total = Math.trunc(normalizeGrokRepairNumber(totalTokens));
  const inputTokens = Math.round(total * 0.8);
  const outputTokens = Math.max(0, total - inputTokens);
  return {
    input_tokens: inputTokens,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: outputTokens,
    reasoning_output_tokens: 0,
    total_tokens: total,
    billable_total_tokens: total,
    conversation_count: Math.trunc(normalizeGrokRepairNumber(conversationCount)),
  };
}

function addGrokRepairTotals(target, delta) {
  target.input_tokens += delta.input_tokens;
  target.cached_input_tokens += delta.cached_input_tokens;
  target.cache_creation_input_tokens += delta.cache_creation_input_tokens;
  target.output_tokens += delta.output_tokens;
  target.reasoning_output_tokens += delta.reasoning_output_tokens;
  target.total_tokens += delta.total_tokens;
  target.billable_total_tokens += delta.billable_total_tokens;
  target.conversation_count += delta.conversation_count;
}

function buildGrokRepairRowsFromSnapshots(sessionSnapshots) {
  if (!sessionSnapshots || typeof sessionSnapshots !== "object") return [];

  const buckets = new Map();
  for (const snapshot of Object.values(sessionSnapshots)) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const totalTokens = Math.trunc(normalizeGrokRepairNumber(snapshot.totalTokens));
    if (totalTokens <= 0) continue;

    const hourStart = toGrokRepairHalfHourStart(
      snapshot.lastEventTimestamp || snapshot.updatedAt,
    );
    if (!hourStart) continue;

    const model = normalizeGrokRepairModel(snapshot.model);
    const key = bucketKey("grok", model, hourStart);
    let totals = buckets.get(key);
    if (!totals) {
      totals = {
        source: "grok",
        model,
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
      buckets.set(key, totals);
    }
    addGrokRepairTotals(
      totals,
      estimateGrokRepairTotals(totalTokens, snapshot.messageCount),
    );
  }

  return Array.from(buckets.values()).sort((a, b) => {
    const timeCompare = a.hour_start.localeCompare(b.hour_start);
    return timeCompare || a.model.localeCompare(b.model);
  });
}

function applyGrokRepairHourlyState(cursors, rows) {
  const hourly = cursors.hourly && typeof cursors.hourly === "object" ? cursors.hourly : {};
  const buckets = hourly.buckets && typeof hourly.buckets === "object" ? hourly.buckets : {};
  const groupQueued =
    hourly.groupQueued && typeof hourly.groupQueued === "object" ? hourly.groupQueued : {};

  for (const key of Object.keys(buckets)) {
    if (key.startsWith("grok|")) {
      delete buckets[key];
    }
  }
  for (const key of Object.keys(groupQueued)) {
    if (key.startsWith("grok|")) {
      delete groupQueued[key];
    }
  }

  for (const row of rows) {
    const totals = {
      input_tokens: row.input_tokens,
      cached_input_tokens: row.cached_input_tokens,
      cache_creation_input_tokens: row.cache_creation_input_tokens,
      output_tokens: row.output_tokens,
      reasoning_output_tokens: row.reasoning_output_tokens,
      total_tokens: row.total_tokens,
      billable_total_tokens: row.billable_total_tokens,
      conversation_count: row.conversation_count,
    };
    buckets[bucketKey("grok", row.model, row.hour_start)] = {
      totals,
      queuedKey: totalsKey(totals),
      source: "grok",
      hour_start: row.hour_start,
    };
  }

  cursors.hourly = {
    ...hourly,
    version: 3,
    buckets,
    groupQueued,
    updatedAt: typeof hourly.updatedAt === "string" ? hourly.updatedAt : null,
  };
}

async function resetGrokRepairUploadOffset(queueStatePath) {
  if (typeof queueStatePath !== "string" || !queueStatePath) return false;
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
  } catch (_e) {
    state = {};
  }
  state.offset = 0;
  state.updatedAt = new Date().toISOString();
  state.note = "reset_after_grok_append_only_repair_2026_05_v4";
  await ensureDir(path.dirname(queueStatePath));
  await fs.writeFile(queueStatePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  return true;
}

function hasAppliedGrokRepairMigration(value) {
  if (!value) return false;
  if (value === true) return true;
  if (value && typeof value === "object") {
    if (value.status === "applied" || value.status === "noop") return true;
    if (value.status) return false;
    return value.rowsWritten != null || value.rowsRemoved != null;
  }
  return false;
}

function serializeGrokRepairRow(row) {
  return JSON.stringify({
    source: "grok",
    model: normalizeGrokRepairModel(row.model),
    hour_start: row.hour_start,
    input_tokens: row.input_tokens || 0,
    cached_input_tokens: row.cached_input_tokens || 0,
    cache_creation_input_tokens: row.cache_creation_input_tokens || 0,
    output_tokens: row.output_tokens || 0,
    reasoning_output_tokens: row.reasoning_output_tokens || 0,
    total_tokens: row.total_tokens || 0,
    billable_total_tokens: row.billable_total_tokens || 0,
    conversation_count: row.conversation_count || 0,
  });
}

async function repairGrokQueueFromSessionSnapshots({ cursors, queuePath, queueStatePath } = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const grokState = (cursors.grok ||= {});
  const migrations = (grokState.migrations ||= {});
  if (hasAppliedGrokRepairMigration(migrations[GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY])) {
    return false;
  }

  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }

  const latestGrokRows = new Map();
  let existingGrokRows = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      continue;
    }

    if (normalizeGrokRepairSource(row?.source) === "grok") {
      const model = normalizeGrokRepairModel(row.model);
      const hourStart = typeof row.hour_start === "string" ? row.hour_start : null;
      if (!hourStart) continue;
      existingGrokRows += 1;
      latestGrokRows.set(bucketKey("grok", model, hourStart), {
        ...row,
        source: "grok",
        model,
        hour_start: hourStart,
      });
    }
  }

  if (existingGrokRows === 0) {
    migrations[GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY] = {
      status: "noop",
      appliedAt: new Date().toISOString(),
      existingGrokRows: 0,
      rowsWritten: 0,
      snapshotsUsed: 0,
      uploadOffsetReset: false,
    };
    return false;
  }

  const repairRows = buildGrokRepairRowsFromSnapshots(grokState.sessionSnapshots);
  if (repairRows.length === 0) {
    migrations[GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY] = {
      status: "skipped",
      appliedAt: new Date().toISOString(),
      reason: "missing-session-snapshots",
      existingGrokRows,
      rowsWritten: 0,
      snapshotsUsed: 0,
      uploadOffsetReset: false,
    };
    return false;
  }

  applyGrokRepairHourlyState(cursors, repairRows);

  const repairLines = [];
  const repairKeys = new Set();
  for (const row of repairRows) {
    const key = bucketKey("grok", row.model, row.hour_start);
    repairKeys.add(key);
    const current = latestGrokRows.get(key);
    if (current && totalsKey(current) === totalsKey(row)) continue;
    repairLines.push(serializeGrokRepairRow(row));
  }

  const zeroTotals = {
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    billable_total_tokens: 0,
    conversation_count: 0,
  };
  let staleRowsRetracted = 0;
  for (const [key, row] of latestGrokRows.entries()) {
    if (repairKeys.has(key)) continue;
    if (totalsKey(row) === totalsKey(zeroTotals)) continue;
    staleRowsRetracted += 1;
    repairLines.push(serializeGrokRepairRow({
      ...zeroTotals,
      model: row.model,
      hour_start: row.hour_start,
    }));
  }

  if (repairLines.length === 0) {
    migrations[GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY] = {
      status: "noop",
      appliedAt: new Date().toISOString(),
      existingGrokRows,
      rowsWritten: 0,
      staleRowsRetracted,
      snapshotsUsed: repairRows.length,
      uploadOffsetReset: false,
    };
    return false;
  }

  await ensureDir(path.dirname(queuePath));
  const queueBackupPath = await backupExistingFile(queuePath);
  const queueStateBackupPath = await backupExistingFile(queueStatePath);
  await fs.appendFile(queuePath, `${repairLines.join("\n")}\n`, "utf8");

  const uploadOffsetReset = await resetGrokRepairUploadOffset(queueStatePath);
  migrations[GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY] = {
    status: "applied",
    appliedAt: new Date().toISOString(),
    existingGrokRows,
    rowsWritten: repairLines.length,
    staleRowsRetracted,
    snapshotsUsed: Object.values(grokState.sessionSnapshots || {}).filter((snapshot) => {
      if (!snapshot || typeof snapshot !== "object") return false;
      if (Math.trunc(normalizeGrokRepairNumber(snapshot.totalTokens)) <= 0) return false;
      return Boolean(toGrokRepairHalfHourStart(snapshot.lastEventTimestamp || snapshot.updatedAt));
    }).length,
    uploadOffsetReset,
    queueBackupPath,
    queueStateBackupPath,
  };
  return true;
}
module.exports = {
  GROK_APPEND_ONLY_REPAIR_MIGRATION_KEY,
  normalizeGrokRepairSource,
  normalizeGrokRepairModel,
  normalizeGrokRepairNumber,
  toGrokRepairHalfHourStart,
  buildGrokRepairRowsFromSnapshots,
  applyGrokRepairHourlyState,
  resetGrokRepairUploadOffset,
  hasAppliedGrokRepairMigration,
  serializeGrokRepairRow,
  repairGrokQueueFromSessionSnapshots,
};
