"use strict";

// Mimo mislabel repair (0.57.0), split out of commands/sync.js. That release
// read mimocode.db without the providerID filter, so the Claude/claude-mem
// mirror was ingested a second time as source=mimo. The repair purges every
// source=mimo row and cursor bucket so the next scan rebuilds it correctly;
// cloud orphans are cleaned server-side.

const path = require("node:path");
const fs = require("node:fs/promises");

const { ensureDir } = require("../lib/fs");
const { backupExistingFile } = require("../lib/queue-backup");

const MIMO_PROVIDER_REPAIR_KEY = "mimoClaudeMislabelRepair_2026_06";

async function resetUploadOffsetForMimoRepair(queueStatePath) {
  if (typeof queueStatePath !== "string" || !queueStatePath) return false;
  let state = {};
  try {
    state = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
  } catch (_e) {
    state = {};
  }
  state.offset = 0;
  state.updatedAt = new Date().toISOString();
  state.note = "reset_after_mimo_claude_mislabel_repair_2026_06";
  await ensureDir(path.dirname(queueStatePath));
  await fs.writeFile(queueStatePath, JSON.stringify(state, null, 2) + "\n", "utf8");
  return true;
}

// Remove every source=mimo row from a queue file (atomic rewrite, backed up
// first). Returns the number of rows removed. Non-JSON lines are preserved.
async function dropMimoQueueRows(filePath) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch (e) {
    if (e?.code === "ENOENT") return 0;
    throw e;
  }
  const kept = [];
  let removed = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      kept.push(line);
      continue;
    }
    if (row && row.source === "mimo") {
      removed += 1;
      continue;
    }
    kept.push(line);
  }
  if (removed === 0) return 0;
  await backupExistingFile(filePath);
  const tmp = `${filePath}.mimorepair.${process.pid}.${Date.now()}`;
  await fs.writeFile(tmp, kept.length ? kept.join("\n") + "\n" : "", "utf8");
  await fs.rename(tmp, filePath);
  return removed;
}

// One-time repair for the 0.57.0 mimo mislabel bug. Purges all source=mimo data
// (the mislabeled Claude/claude-mem mirror) from the local queues and cursor
// state, so the next sync re-parses mimocode.db with the providerID-filtered
// reader and rebuilds source=mimo from scratch — correct mimo-auto only. Cloud
// orphans (mimo rows already uploaded) are cleaned server-side separately.
async function repairMimoClaudeMislabel({
  cursors,
  queuePath,
  queueStatePath,
  projectQueuePath,
  projectQueueStatePath,
} = {}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  if (migrations[MIMO_PROVIDER_REPAIR_KEY]) return false;

  const hourly = cursors.hourly && typeof cursors.hourly === "object" ? cursors.hourly : null;
  const hasMimoBucket =
    hourly && hourly.buckets
      ? Object.keys(hourly.buckets).some((k) => k.startsWith("mimo|"))
      : false;

  // Nothing mimo-related anywhere → mark done so we don't re-scan every sync.
  let mainRaw = null;
  try {
    mainRaw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
  }
  const hasMimoRow =
    typeof mainRaw === "string" &&
    mainRaw.split("\n").some((l) => {
      if (!l.trim()) return false;
      try {
        return JSON.parse(l).source === "mimo";
      } catch (_e) {
        return false;
      }
    });

  if (!hasMimoBucket && !hasMimoRow && !cursors.mimo) {
    migrations[MIMO_PROVIDER_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  // 1. Drop source=mimo rows from the main + project queues.
  const removedMain = await dropMimoQueueRows(queuePath);
  const removedProject =
    typeof projectQueuePath === "string" && projectQueuePath
      ? await dropMimoQueueRows(projectQueuePath)
      : 0;

  // 2. Clear stale mimo buckets from the aggregation state (keys are
  //    `source|model|hour` for hourly, `projectKey|source|hour` for project).
  if (hourly && hourly.buckets) {
    for (const k of Object.keys(hourly.buckets)) {
      if (k.startsWith("mimo|")) delete hourly.buckets[k];
    }
  }
  if (hourly && hourly.groupQueued) {
    for (const k of Object.keys(hourly.groupQueued)) {
      if (k.startsWith("mimo|")) delete hourly.groupQueued[k];
    }
  }
  const projectHourly =
    cursors.projectHourly && typeof cursors.projectHourly === "object"
      ? cursors.projectHourly
      : null;
  if (projectHourly && projectHourly.buckets) {
    for (const k of Object.keys(projectHourly.buckets)) {
      if (k.includes("|mimo|")) delete projectHourly.buckets[k];
    }
  }

  // 3. Reset the mimo message index so the next sync re-parses the DB fresh.
  delete cursors.mimo;

  // 4. Reset upload offsets — the queue rewrite changed byte offsets, so a full
  //    replay is required (cloud keeps latest per key; orphan mimo rows already
  //    uploaded are removed server-side).
  if (removedMain > 0) await resetUploadOffsetForMimoRepair(queueStatePath);
  if (removedProject > 0) await resetUploadOffsetForMimoRepair(projectQueueStatePath);

  migrations[MIMO_PROVIDER_REPAIR_KEY] = {
    appliedAt: new Date().toISOString(),
    removedMain,
    removedProject,
  };
  return true;
}
module.exports = {
  MIMO_PROVIDER_REPAIR_KEY,
  repairMimoClaudeMislabel,
};
