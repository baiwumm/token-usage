#!/usr/bin/env node
"use strict";

/**
 * Historical project attribution backfill (2026-11-04).
 *
 * The CLI started writing project_key split rows in 0.4.5, but older hourly
 * rows in queue.jsonl are still one unattributed aggregate. The local project
 * queue already has the per-project totals for those hours. This script
 * reconstructs the split rows and appends them to the append-only queue so the
 * normal `tokenusage upload --drain` path sends them to the server.
 *
 * It never changes the queue's existing rows or any totals. All emitted rows
 * add up to the original aggregate; the residual row overwrites the old
 * unattributed bucket on the server (including an explicit zero residual).
 *
 * Usage:
 *   node scripts/archive/project-backfill.cjs            # dry run (default)
 *   node scripts/archive/project-backfill.cjs --apply    # append split rows
 *
 * `--apply` acquires the same sync.lock as the collector, writes a timestamped
 * backup next to queue.jsonl, then atomically replaces the queue with the old
 * contents plus the new rows. Run `tokenusage upload --drain` afterwards and
 * `tokenusage reconcile` to verify.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveTrackerPaths } = require("../../packages/cli/src/lib/tracker-paths");
const { openLock } = require("../../packages/cli/src/lib/fs");
const { buildProjectBackfill } = require("./project-backfill-core.cjs");

const hasFlag = (name) => process.argv.includes(name);

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { rows: [], badLines: 0 };
  const rows = [];
  let badLines = 0;
  for (const line of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      rows.push(JSON.parse(line));
    } catch {
      badLines += 1;
    }
  }
  return { rows, badLines };
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("en-US");
}

function summarize(result, extras = {}) {
  const stats = result.stats;
  const lines = [];
  lines.push("Historical project attribution backfill");
  lines.push(`Tracker: ${extras.trackerDir || "-"}`);
  lines.push(
    `Input: ${formatNumber(stats.inputQueueRows)} queue rows, ` +
      `${formatNumber(stats.inputProjectRows)} project rows, ` +
      `${formatNumber(stats.inputSessionRows)} session rows`,
  );
  lines.push(
    `Groups: ${formatNumber(stats.projectGroups)} with project data, ` +
      `${formatNumber(stats.consideredGroups)} considered, ` +
      `${formatNumber(stats.emittedGroups)} emitted, ${formatNumber(stats.skipped)} skipped`,
  );
  lines.push(
    `Rows: ${formatNumber(result.rows.length)} total ` +
      `(${formatNumber(stats.projectRowsEmitted)} project + ` +
      `${formatNumber(stats.residualRowsEmitted)} residual)`,
  );
  lines.push(
    `Tokens: processed input ${formatNumber(stats.processedInputTotalTokens)}, ` +
      `emitted ${formatNumber(stats.emittedTotalTokens)} (must match)`,
  );
  if (stats.zeroProjectRows) {
    lines.push(`Zero-token project rows skipped: ${formatNumber(stats.zeroProjectRows)}`);
  }
  if (stats.invalidMainRows || stats.invalidProjectRows || stats.invalidSessionRows) {
    lines.push(
      `Invalid rows skipped: queue ${formatNumber(stats.invalidMainRows)}, ` +
        `project ${formatNumber(stats.invalidProjectRows)}, ` +
        `session ${formatNumber(stats.invalidSessionRows)}`,
    );
  }
  if (extras.badLines) {
    lines.push(`Unparseable JSONL lines skipped: ${formatNumber(extras.badLines)}`);
  }

  const reasons = Object.entries(stats.skipReasons).sort(([a], [b]) => a.localeCompare(b));
  if (reasons.length) {
    lines.push("Skip reasons:");
    for (const [reason, count] of reasons) lines.push(`  ${reason}: ${formatNumber(count)}`);
  }
  if (result.skippedGroups.length) {
    lines.push("Skipped groups:");
    for (const group of result.skippedGroups.slice(0, 40)) {
      const detail = group.detail ? ` ${JSON.stringify(group.detail)}` : "";
      lines.push(`  ${group.hour_start} ${group.source}: ${group.reason}${detail}`);
    }
    if (result.skippedGroups.length > 40) {
      lines.push(`  ... ${formatNumber(result.skippedGroups.length - 40)} more`);
    }
  }
  if (result.groups.length) {
    const multi = result.groups.filter((group) => group.mode === "multi_model_session");
    lines.push(
      `Emitted modes: single-model ${formatNumber(result.groups.length - multi.length)}, ` +
        `multi-model session ${formatNumber(multi.length)}`,
    );
    for (const group of multi) {
      lines.push(`  multi-model ${group.hour_start} ${group.source}: models ${group.models.join(", ")}`);
    }
  }
  return lines.join("\n");
}

function appendQueueRows(queuePath, rows) {
  const previous = fs.readFileSync(queuePath, "utf8");
  const separator = previous.length && !previous.endsWith("\n") ? "\n" : "";
  const appended = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
  const next = previous + separator + appended;
  const tempPath = `${queuePath}.backfill-${process.pid}.tmp`;
  fs.writeFileSync(tempPath, next, "utf8");
  const handle = fs.openSync(tempPath, "r+");
  try {
    fs.fsyncSync(handle);
  } finally {
    fs.closeSync(handle);
  }
  // Atomic replace keeps the existing queue prefix byte-for-byte, so
  // queue.state.json's offset remains valid and only the appended rows are
  // pending for the next upload.
  fs.renameSync(tempPath, queuePath);
  return next.length;
}

async function main() {
  if (hasFlag("--help") || hasFlag("-h")) {
    console.log(
      "Usage: node scripts/archive/project-backfill.cjs [--apply]\n" +
        "  default: dry run; --apply: append split rows to queue.jsonl",
    );
    return;
  }

  const apply = hasFlag("--apply");
  const { trackerDir } = await resolveTrackerPaths({ home: os.homedir() });
  const queuePath = path.join(trackerDir, "queue.jsonl");
  const projectQueuePath = path.join(trackerDir, "project.queue.jsonl");
  const sessionQueuePath = path.join(trackerDir, "session.queue.jsonl");
  const statePath = path.join(trackerDir, "queue.state.json");
  const lockPath = path.join(trackerDir, "sync.lock");

  if (!fs.existsSync(queuePath)) {
    throw new Error(`Queue not found: ${queuePath}`);
  }

  const run = () => {
    const queue = readJsonl(queuePath);
    const project = readJsonl(projectQueuePath);
    const session = readJsonl(sessionQueuePath);
    const result = buildProjectBackfill({
      queueRows: queue.rows,
      projectRows: project.rows,
      sessionRows: session.rows,
    });
    return {
      result,
      badLines: queue.badLines + project.badLines + session.badLines,
    };
  };

  if (!apply) {
    const { result, badLines } = run();
    console.log(summarize(result, { trackerDir, badLines }));
    console.log(
      `\nDry run only. Run with --apply to append ${formatNumber(result.rows.length)} rows, ` +
        "then `tokenusage upload --drain` and `tokenusage reconcile`.",
    );
    return;
  }

  let lock;
  try {
    lock = await openLock(lockPath, { quietIfLocked: true });
  } catch (error) {
    throw new Error(`Could not acquire sync lock ${lockPath}: ${error.message}`);
  }
  if (!lock) {
    throw new Error(`Another sync is running (${lockPath}); retry after it finishes`);
  }

  try {
    const { result, badLines } = run();
    console.log(summarize(result, { trackerDir, badLines }));
    if (result.rows.length === 0) {
      console.log("\nNo rows to append.");
      return;
    }

    const previousSize = fs.statSync(queuePath).size;
    const state = fs.existsSync(statePath)
      ? JSON.parse(fs.readFileSync(statePath, "utf8"))
      : {};
    const offset = Number(state.offset || 0);
    if (Number.isFinite(offset) && offset > previousSize) {
      throw new Error(
        `queue.state.json offset ${offset} exceeds queue size ${previousSize}; refusing to append`,
      );
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${queuePath}.bak.backfill.${stamp}`;
    fs.copyFileSync(queuePath, backupPath);

    const newSize = appendQueueRows(queuePath, result.rows);
    console.log(
      `\nAppended ${formatNumber(result.rows.length)} rows: ` +
        `${formatNumber(previousSize)} -> ${formatNumber(newSize)} bytes\n` +
        `Backup: ${backupPath}\n` +
        `Next: tokenusage upload --drain && tokenusage reconcile`,
    );
  } finally {
    await lock.release();
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
