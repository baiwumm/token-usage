"use strict";

// Claude history repairs, split out of commands/sync.js: the ground-truth
// rebuild (queue + hourly state from the raw transcript set), claude-mem
// observer-file re-inclusion and the claude-mem row relabel.

const fs = require("node:fs/promises");
const readline = require("node:readline");
const fssync = require("node:fs");
const path = require("node:path");
const {
  computeClaudeGroundTruthBuckets,
} = require("../lib/claude-categorizer");
const {
  ensureDir,
} = require("../lib/fs");
const {
  bucketKey,
  claudeMessageDedupKey,
  totalsKey,
} = require("../lib/rollout");

const CLAUDE_MEM_OBSERVER_REINCLUDE_KEY = "claudeMemObserverReinclude_2026_05_v3";
const CLAUDE_MEM_OBSERVER_PATH_SEGMENT = "--claude-mem-observer-sessions";
const CLAUDE_GROUND_TRUTH_REPAIR_KEY = "claudeGroundTruthRepair_2026_05_v4";

async function repairClaudeQueueFromGroundTruth({
  cursors,
  queuePath,
  queueStatePath = null,
  projectQueuePath = null,
  projectQueueStatePath = null,
  rootDirs = null,
}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  if (migrations[CLAUDE_GROUND_TRUTH_REPAIR_KEY]) return false;

  let result;
  try {
    // rootDirs must cover every install the incremental parser scans (native
    // AND WSL): this repair's semantics are "disk is truth" — it clears all
    // claude buckets and replaces claudeHashes wholesale, so scanning fewer
    // roots than sync would silently drop the missing install's history.
    result = await computeClaudeGroundTruthBuckets(
      Array.isArray(rootDirs) && rootDirs.length > 0 ? { rootDirs } : {},
    );
  } catch (e) {
    console.error("[sync] claude ground-truth repair: scan failed:", e?.message || e);
    return false;
  }
  const { rows, seenHashes, fileList } = result;

  // 1. Atomic rewrite of queue.jsonl: keep non-claude rows, drop existing
  //    claude/claude-mem rows, append truth rows. Atomic via tmp + rename.
  let claudeRowsRemoved = 0;
  if (typeof queuePath === "string" && queuePath) {
    let raw = "";
    try {
      raw = await fs.readFile(queuePath, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    const keptLines = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch (_e) {
        // Preserve unparseable lines verbatim — operator may want to
        // recover them later.
        keptLines.push(line);
        continue;
      }
      if (row?.source === "claude" || row?.source === "claude-mem") {
        claudeRowsRemoved += 1;
        continue;
      }
      keptLines.push(line);
    }

    const truthLines = rows.map((r) =>
      JSON.stringify({
        source: "claude",
        model: r.model,
        hour_start: r.hour_start,
        input_tokens: r.input_tokens,
        cached_input_tokens: r.cached_input_tokens,
        cache_creation_input_tokens: r.cache_creation_input_tokens,
        output_tokens: r.output_tokens,
        reasoning_output_tokens: r.reasoning_output_tokens,
        total_tokens: r.total_tokens,
        billable_total_tokens: r.billable_total_tokens,
        conversation_count: r.conversation_count,
      }),
    );

    await ensureDir(path.dirname(queuePath));
    const out = keptLines.concat(truthLines).join("\n") + "\n";
    const tmp = `${queuePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, out, "utf8");
    await fs.rename(tmp, queuePath);
  }

  // 2. Reset cursors.hourly.buckets / groupQueued for source=claude (and the
  //    dead source=claude-mem buckets) so incremental sync's in-memory state
  //    matches the truth.
  const hourly = (cursors.hourly ||= { buckets: {}, groupQueued: {} });
  hourly.buckets ||= {};
  hourly.groupQueued ||= {};

  let bucketsCleared = 0;
  for (const k of Object.keys(hourly.buckets)) {
    if (k.startsWith("claude|") || k.startsWith("claude-mem|")) {
      delete hourly.buckets[k];
      bucketsCleared += 1;
    }
  }
  // Clear stale claude entries from groupQueued (left over by v2 repair).
  // After v3 we never repopulate it for claude, so nothing should be added
  // back during the per-model write loop below.
  for (const k of Object.keys(hourly.groupQueued)) {
    if (k.startsWith("claude|") || k.startsWith("claude-mem|")) {
      delete hourly.groupQueued[k];
    }
  }

  // Per-model claude buckets: set queuedKey but DO NOT touch
  // hourly.groupQueued. groupQueued is used by enqueueTouchedBuckets to
  // mark a (source, hour) as legacy-aggregate state; writing claude hours
  // there would force every later sync to re-emit the hour as a single
  // model=DEFAULT_MODEL aggregate row instead of touching only the bucket
  // that actually changed. The original v2 release did write groupQueued
  // here and was the cause of an unknown-bucket inflation regression.
  for (const r of rows) {
    const totals = {
      input_tokens: r.input_tokens,
      cached_input_tokens: r.cached_input_tokens,
      cache_creation_input_tokens: r.cache_creation_input_tokens,
      output_tokens: r.output_tokens,
      reasoning_output_tokens: r.reasoning_output_tokens,
      total_tokens: r.total_tokens,
      billable_total_tokens: r.billable_total_tokens,
      conversation_count: r.conversation_count,
    };
    const key = bucketKey("claude", r.model, r.hour_start);
    hourly.buckets[key] = {
      totals,
      queuedKey: totalsKey(totals),
      source: "claude",
      hour_start: r.hour_start,
    };
  }

  // 3. Reset per-file cursors so future incremental sync only reads genuinely
  //    new tail content. Format must match what rollout.js expects:
  //    { inode, offset, updatedAt }. Setting a plain integer here breaks
  //    the inode-equality check inside parseClaudeFile, which would treat
  //    the file as untracked and re-read it from byte 0 — silently doubling
  //    everything. (That was the actual cause of the regression after the
  //    first repair attempt.)
  cursors.files ||= {};
  let filesReset = 0;
  const nowIso = new Date().toISOString();
  for (const fp of fileList) {
    let st;
    try {
      st = fssync.statSync(fp);
    } catch (_e) {
      continue;
    }
    cursors.files[fp] = {
      inode: st.ino || 0,
      offset: st.size,
      updatedAt: nowIso,
    };
    filesReset += 1;
  }
  cursors.claudeHashes = seenHashes;

  // 4. Reset cloud-upload offset so the corrected rows are re-sent. Other
  //    sources are upserted idempotently by the ingest endpoint, so this is
  //    safe — just costs one extra round of bandwidth.
  if (typeof queueStatePath === "string" && queueStatePath) {
    let uploadState = {};
    try {
      uploadState = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
    } catch (_e) {
      uploadState = {};
    }
    uploadState.offset = 0;
    uploadState.updatedAt = new Date().toISOString();
    uploadState.note = "reset_after_claude_repair_2026_05_v4";
    await fs.writeFile(queueStatePath, JSON.stringify(uploadState));
  }

  // 5. Repair project queue. Historical claude rows in project.queue.jsonl
  //    were uniformly mis-attributed to project_key=
  //    "claude-mem/observer-sessions" (left over from the observer
  //    relabel migration). We can't reconstruct the true cwd-based
  //    project_key for each historical message reliably, so we drop every
  //    claude/claude-mem row from project.queue.jsonl and reset the
  //    matching cursors.projectHourly state. New claude usage will
  //    accumulate to the correct cwd-derived project_key going forward.
  let projectRowsRemoved = 0;
  let projectBucketsCleared = 0;
  if (typeof projectQueuePath === "string" && projectQueuePath) {
    let projRaw = "";
    try {
      projRaw = await fs.readFile(projectQueuePath, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    if (projRaw) {
      const projKept = [];
      for (const line of projRaw.split("\n")) {
        if (!line.trim()) continue;
        let row;
        try {
          row = JSON.parse(line);
        } catch (_e) {
          projKept.push(line);
          continue;
        }
        if (row?.source === "claude" || row?.source === "claude-mem") {
          projectRowsRemoved += 1;
          continue;
        }
        projKept.push(line);
      }
      await ensureDir(path.dirname(projectQueuePath));
      const tmp = `${projectQueuePath}.tmp.${process.pid}.${Date.now()}`;
      await fs.writeFile(tmp, projKept.join("\n") + "\n", "utf8");
      await fs.rename(tmp, projectQueuePath);
    }

    // Clear matching projectHourly state so the claude project buckets
    // start fresh.
    const projHourly = (cursors.projectHourly ||= { buckets: {} });
    projHourly.buckets ||= {};
    for (const k of Object.keys(projHourly.buckets)) {
      const v = projHourly.buckets[k];
      const src = v?.source || "";
      if (src === "claude" || src === "claude-mem") {
        delete projHourly.buckets[k];
        projectBucketsCleared += 1;
      }
    }

    // Reset project upload offset.
    if (typeof projectQueueStatePath === "string" && projectQueueStatePath) {
      let st = {};
      try {
        st = JSON.parse(await fs.readFile(projectQueueStatePath, "utf8"));
      } catch (_e) {
        st = {};
      }
      st.offset = 0;
      st.updatedAt = new Date().toISOString();
      st.note = "reset_after_claude_repair_2026_05_v6";
      await fs.writeFile(projectQueueStatePath, JSON.stringify(st));
    }
  }

  migrations[CLAUDE_GROUND_TRUTH_REPAIR_KEY] = {
    appliedAt: new Date().toISOString(),
    bucketsWritten: rows.length,
    bucketsCleared,
    rowsRemoved: claudeRowsRemoved,
    filesReset,
    hashesRetained: seenHashes.length,
    uploadOffsetReset: typeof queueStatePath === "string" && !!queueStatePath,
    projectRowsRemoved,
    projectBucketsCleared,
  };
  return true;
}

async function reincludeClaudeMemObserverFiles({ cursors, claudeFiles, queuePath, queueStatePath }) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  if (migrations[CLAUDE_MEM_OBSERVER_REINCLUDE_KEY]) return false;

  const observerPaths = (Array.isArray(claudeFiles) ? claudeFiles : [])
    .map((entry) => (typeof entry === "string" ? entry : entry?.path))
    .filter((p) => typeof p === "string" && p.includes(CLAUDE_MEM_OBSERVER_PATH_SEGMENT));

  if (!cursors.files || typeof cursors.files !== "object") {
    cursors.files = {};
  }

  let filesReset = 0;
  for (const filePath of observerPaths) {
    if (cursors.files[filePath]) {
      delete cursors.files[filePath];
      filesReset += 1;
    }
  }

  const hashesToRemove = observerPaths.length > 0
    ? await collectClaudeMessageHashes(observerPaths)
    : new Set();
  let hashesRemoved = 0;
  if (Array.isArray(cursors.claudeHashes) && hashesToRemove.size > 0) {
    const nextHashes = [];
    for (const hash of cursors.claudeHashes) {
      if (hashesToRemove.has(hash)) {
        hashesRemoved += 1;
        continue;
      }
      nextHashes.push(hash);
    }
    cursors.claudeHashes = nextHashes;
  }

  const queueRowsRelabeled = typeof queuePath === "string" && queuePath
    ? await relabelClaudeMemQueueRows(queuePath, queueStatePath)
    : 0;

  migrations[CLAUDE_MEM_OBSERVER_REINCLUDE_KEY] = {
    appliedAt: new Date().toISOString(),
    filesReset,
    hashesRemoved,
    queueRowsRelabeled,
  };
  return filesReset > 0 || hashesRemoved > 0 || queueRowsRelabeled > 0;
}

async function relabelClaudeMemQueueRows(queuePath, queueStatePath = null) {
  let raw;
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (_e) {
    return 0;
  }
  if (!raw || !raw.includes('"claude-mem"')) return 0;

  // The cloud-upload cursor (queue.state.json `offset`) is a byte position in
  // the pre-rewrite file. Relabeling shrinks rewritten lines ("claude-mem" →
  // "claude"), so the old offset would land mid-line in the new file and the
  // next drainQueueToCloud batch would skip part of a row (or a whole row).
  // Track the old→new byte mapping while rewriting and remap the offset to
  // the equivalent line boundary (same pattern as project-usage-purge.js).
  let previousOffset = 0;
  if (typeof queueStatePath === "string" && queueStatePath) {
    try {
      const st = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
      const off = Number(st?.offset || 0);
      if (Number.isFinite(off) && off > 0) previousOffset = off;
    } catch (_e) {
      previousOffset = 0;
    }
  }

  const lines = raw.split("\n");
  const out = [];
  let relabeled = 0;
  let inputOffset = 0;
  let outputOffset = 0;
  let nextOffset = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const isLast = i === lines.length - 1;
    let outLine = line;
    if (line) {
      try {
        const obj = JSON.parse(line);
        if (obj && obj.source === "claude-mem") {
          obj.source = "claude";
          relabeled += 1;
          outLine = JSON.stringify(obj);
        }
      } catch (_e) {
        // keep malformed lines verbatim
      }
    }
    out.push(outLine);
    inputOffset += Buffer.byteLength(line, "utf8") + (isLast ? 0 : 1);
    outputOffset += Buffer.byteLength(outLine, "utf8") + (isLast ? 0 : 1);
    // Upload offsets always sit at line boundaries; a mid-line offset
    // (corruption) rounds down to the previous boundary so no row is skipped
    // — worst case a row is re-uploaded, and cloud ingest upserts by key.
    if (inputOffset <= previousOffset) nextOffset = outputOffset;
  }
  if (relabeled === 0) return 0;

  // Atomic rewrite: temp file in the same directory + rename, so a crash
  // mid-write can never leave queue.jsonl truncated.
  const tmpPath = `${queuePath}.tmp`;
  await fs.writeFile(tmpPath, out.join("\n"), "utf8");
  await fs.rename(tmpPath, queuePath);

  if (typeof queueStatePath === "string" && queueStatePath && previousOffset > 0) {
    let state = {};
    try {
      state = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
      if (!state || typeof state !== "object") state = {};
    } catch (_e) {
      state = {};
    }
    state.offset = nextOffset;
    state.updatedAt = new Date().toISOString();
    await fs.writeFile(queueStatePath, JSON.stringify(state), "utf8");
  }
  return relabeled;
}

async function collectClaudeMessageHashes(filePaths) {
  const hashes = new Set();
  for (const filePath of filePaths) {
    let stream;
    try {
      stream = fssync.createReadStream(filePath, { encoding: "utf8" });
    } catch (_e) {
      continue;
    }
    const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
    for await (const line of rl) {
      if (!line.includes('"usage"')) continue;
      let obj;
      try {
        obj = JSON.parse(line);
      } catch (_e) {
        continue;
      }
      const hash = claudeMessageDedupKey(obj);
      if (hash) hashes.add(hash);
    }
    rl.close();
    stream.close?.();
  }
  return hashes;
}

module.exports = {
  CLAUDE_GROUND_TRUTH_REPAIR_KEY,
  CLAUDE_MEM_OBSERVER_PATH_SEGMENT,
  CLAUDE_MEM_OBSERVER_REINCLUDE_KEY,
  reincludeClaudeMemObserverFiles,
  repairClaudeQueueFromGroundTruth,
};
