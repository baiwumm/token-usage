"use strict";

// Codex repair family, split out of commands/sync.js: the cold-scan
// double-count repair, the fork-replay inflation repair and the interleaved
// usage-lineage repair, plus the snapshot/lineage scanners and the max-totals
// helpers they share. All are one-shot corrections keyed by cursors.migrations.

const fs = require("node:fs");
const fssync = require("node:fs");
const path = require("node:path");
const {
  extractTokenCount,
} = require("../lib/codex-rollout-parser");
const {
  consumeUsageDelta,
  createUsageDeltaState,
} = require("../lib/codex-token-usage");
const {
  isCodexSessionCursorPath,
} = require("../lib/cursor-store");
const {
  ensureDir,
} = require("../lib/fs");
const {
  physicalJsonlRecords,
} = require("../lib/jsonl-lines");
const {
  codexSessionIdFromPath,
  parseDroidIncremental,
  parseRolloutIncremental,
  readCodexRolloutSnapshot,
} = require("../lib/rollout");

const CODEX_RESCAN_DEDUP_REPAIR_KEY = "codexRescanDedupRepair_2026_06";
const CODEX_FORK_REPLAY_REPAIR_KEY = "codexForkReplayRepair_2026_07";
const CODEX_USAGE_LINEAGE_REPAIR_KEY = "codexUsageLineageRepair_2026_07_v2";

async function repairCodexRescanInflation({
  cursors,
  queuePath,
  queueStatePath,
  projectQueuePath,
  projectQueueStatePath,
  rolloutFiles,
  expectedCodexFileSnapshots = null,
  // The fork-replay repair (#169 follow-up) re-runs this exact rebuild under
  // its own key: the rebuild always uses the CURRENT parser, so any parser fix
  // shipped since the last run is applied to the rebuilt history.
  migrationKey = CODEX_RESCAN_DEDUP_REPAIR_KEY,
  uploadNote = "reset_after_codex_rescan_dedup_2026_06",
}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  // A COMPLETED run writes an ISO-string timestamp (final — never re-run). A
  // prior SKIP writes an object {skipped:true} and MUST be retried: the skip
  // condition can clear in a later version (e.g. v0.53.4 started scanning
  // archived_sessions/, so a session that was "unscanned" under v0.53.3 is now
  // found). Treating the skip sentinel as "done" is what left users like #187
  // permanently stuck on the inflated value after upgrading (the key was truthy
  // so the guard never got a second chance).
  const priorRepair = migrations[migrationKey];
  if (priorRepair && !(typeof priorRepair === "object" && priorRepair.skipped)) return false;

  // Codex session files THIS sync discovered (source === "codex").
  const codexFiles = [];
  for (const entry of Array.isArray(rolloutFiles) ? rolloutFiles : []) {
    const fp = typeof entry === "string" ? entry : entry?.path;
    const src = typeof entry === "string" ? "codex" : String(entry?.source || "codex");
    if (fp && src === "codex") codexFiles.push(fp);
  }
  const codexFileSet = new Set(codexFiles);
  const projectRepairEnabled = typeof projectQueuePath === "string" && projectQueuePath.length > 0;

  // GUARD (data-loss prevention, ref the v6 ground-truth-repair incident): the
  // rebuild can only reproduce buckets from the files this sync re-parses
  // (codexFiles, now covering sessions/ AND archived_sessions/). If a session
  // that previously contributed can no longer be reproduced, skip entirely —
  // the forward dedup fix still stops NEW double-counting; only this historical
  // correction defers.
  //
  // Reproducibility is keyed on the session UUID, NOT the exact cursor path:
  // Codex-Manager MOVES a file sessions/ -> archived_sessions/ (path changes,
  // UUID does not). A path-based check false-positives on every moved file as
  // "missing" and skips forever (issue #187, easonlee05). Genuinely deleted
  // sessions (no file with that UUID anywhere in the scan) still defer.
  const scannedSessionIds = new Set();
  for (const fp of codexFiles) {
    const id = codexSessionIdFromPath(fp);
    if (id) scannedSessionIds.add(id);
  }
  if (cursors.files && typeof cursors.files === "object") {
    for (const fp of Object.keys(cursors.files)) {
      if (!isCodexSessionCursorPath(fp)) continue;
      if (codexFileSet.has(fp)) continue; // exact file re-scanned this run
      const id = codexSessionIdFromPath(fp);
      if (id && scannedSessionIds.has(id)) continue; // same session scanned elsewhere (moved)
      migrations[migrationKey] = {
        skipped: true,
        reason: "codex_session_unreproducible",
        at: new Date().toISOString(),
      };
      return false;
    }
  }

  // ATOMIC REBUILD into a THROWAWAY cursors + queue: never touch the live
  // buckets/queue until the rebuild has fully succeeded. If anything throws we
  // return WITHOUT mutating any persistent state and the migration retries next
  // sync (the key is not set). This is the crucial difference from a
  // "clear-then-rely-on-the-later-parse" design: the later parse's failure is
  // swallowed (warnProviderParseFailure) and cursors are saved regardless, which
  // would permanently zero a user's codex history.
  let rebuilt;
  const tmpQueue = `${queuePath}.codexrebuild.${process.pid}.${Date.now()}`;
  const tmpProjectQueue = projectRepairEnabled
    ? `${projectQueuePath}.codexrebuild.${process.pid}.${Date.now()}`
    : null;
  try {
    const tmpCursors = {
      version: 1,
      files: {},
      hourly: { buckets: {}, groupQueued: {} },
      codexHashes: [],
    };
    await parseRolloutIncremental({
      rolloutFiles: codexFiles.map((p) => ({ path: p, source: "codex" })),
      cursors: tmpCursors,
      queuePath: tmpQueue,
      projectQueuePath: tmpProjectQueue,
      invalidRecordPolicy: "throw",
    });
    let tmpRaw = "";
    try {
      tmpRaw = await fs.readFile(tmpQueue, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    let tmpProjectRaw = "";
    if (tmpProjectQueue) {
      try {
        tmpProjectRaw = await fs.readFile(tmpProjectQueue, "utf8");
      } catch (e) {
        if (e?.code !== "ENOENT") throw e;
      }
    }
    rebuilt = {
      buckets: tmpCursors.hourly.buckets || {},
      groupQueued: tmpCursors.hourly.groupQueued || {},
      codexHashes: Array.isArray(tmpCursors.codexHashes) ? tmpCursors.codexHashes : [],
      codexCompactionResponseIds: Array.isArray(tmpCursors.codexCompactionResponseIds)
        ? tmpCursors.codexCompactionResponseIds
        : [],
      files: tmpCursors.files || {},
      queueRows: tmpRaw.split("\n").filter((l) => l.trim()),
      projectHourly: tmpCursors.projectHourly || null,
      projectQueueRows: tmpProjectRaw.split("\n").filter((l) => l.trim()),
    };
  } catch (e) {
    console.error(
      "[sync] codex rescan repair: rebuild failed, leaving all data untouched:",
      e?.message || e,
    );
    return false;
  } finally {
    await fs.rm(tmpQueue, { force: true }).catch(() => {});
    if (tmpProjectQueue) await fs.rm(tmpProjectQueue, { force: true }).catch(() => {});
  }

  // SANITY: codex files exist on disk but the rebuild produced no codex buckets
  // → treat as a failed rebuild and skip (do NOT clear live data, do NOT set the
  // key — retry next sync).
  const rebuiltCodexKeys = Object.keys(rebuilt.buckets).filter((k) => k.startsWith("codex|"));
  if (codexFiles.length > 0 && rebuiltCodexKeys.length === 0) {
    console.error(
      `[sync] codex rescan repair: rebuild produced 0 codex buckets from ${codexFiles.length} files — skipping to avoid data loss`,
    );
    return false;
  }
  if (projectRepairEnabled) {
    const malformedProjectRows = await countMalformedCodexProjectQueueRows(projectQueuePath);
    if (malformedProjectRows > 0) {
      console.error(
        `[sync] codex rescan repair: found ${malformedProjectRows} malformed codex project queue row(s) — skipping to avoid data loss`,
      );
      return false;
    }

    const existingProjectKeys = new Set([
      ...(await projectUsageKeysFromQueuePath(projectQueuePath, "codex")),
      ...projectUsageKeysFromState(cursors.projectHourly, "codex"),
    ]);
    const rebuiltProjectKeys = new Set([
      ...projectUsageKeysFromQueueRows(rebuilt.projectQueueRows, "codex"),
      ...projectUsageKeysFromState(rebuilt.projectHourly, "codex"),
    ]);
    const missingProjectKeys = [...existingProjectKeys].filter((key) => !rebuiltProjectKeys.has(key));
    if (missingProjectKeys.length > 0) {
      console.error(
        `[sync] codex rescan repair: project rebuild missed ${missingProjectKeys.length} existing codex project bucket(s) — skipping to avoid data loss`,
      );
      return false;
    }

    const existingProjectTotals = mergeMaxTotals(
      await projectUsageTotalsFromQueuePath(projectQueuePath, "codex"),
      projectUsageTotalsFromState(cursors.projectHourly, "codex"),
    );
    const rebuiltProjectTotals = mergeMaxTotals(
      projectUsageTotalsFromQueueRows(rebuilt.projectQueueRows, "codex"),
      projectUsageTotalsFromState(rebuilt.projectHourly, "codex"),
    );
    const existingMainHourTotals = mergeMaxTotals(
      await mainUsageHourTotalsFromQueuePath(queuePath, "codex"),
      mainUsageHourTotalsFromState(cursors.hourly, "codex"),
    );
    const rebuiltMainHourTotals = mergeMaxTotals(
      mainUsageHourTotalsFromQueueRows(rebuilt.queueRows, "codex"),
      mainUsageHourTotalsFromState({ buckets: rebuilt.buckets }, "codex"),
    );
    const partialProjectKeys = [];
    for (const [key, existingTotal] of existingProjectTotals.entries()) {
      const rebuiltTotal = rebuiltProjectTotals.get(key);
      if (!Number.isFinite(rebuiltTotal) || rebuiltTotal >= existingTotal) continue;
      const [, source, hourStart] = key.split("|");
      const mainKey = `${source}|${hourStart}`;
      const existingMainTotal = existingMainHourTotals.get(mainKey) || 0;
      const rebuiltMainTotal = rebuiltMainHourTotals.get(mainKey) || 0;
      if (rebuiltMainTotal >= existingMainTotal) partialProjectKeys.push(key);
    }
    if (partialProjectKeys.length > 0) {
      console.error(
        `[sync] codex rescan repair: project rebuild lowered ${partialProjectKeys.length} existing codex project bucket(s) without a matching main-bucket repair — skipping to avoid data loss`,
      );
      return false;
    }
  }

  const rebuildValidation = expectedCodexFileSnapshots instanceof Map
    ? await validateCodexRebuildFileSnapshots(rebuilt.files, expectedCodexFileSnapshots)
    : { ok: true };
  if (!rebuildValidation.ok) {
    console.error(
      `[sync] codex rescan repair: ${rebuildValidation.reason} — skipping to avoid data loss`,
    );
    return false;
  }

  // COMMIT (only after a verified rebuild). A crash partway just leaves the
  // migration to re-run next sync — re-rebuild + re-strip + re-commit converges.
  //
  // 1. queue.jsonl: drop the inflated codex rows, append the clean rebuilt ones
  //    (atomic tmp+rename). With no old-high codex rows left, the cloud ingest's
  //    within-batch MAX keeps nothing larger and its overwrite-upsert replaces
  //    the inflated cloud rows on the next upload.
  if (typeof queuePath === "string" && queuePath) {
    let raw = "";
    try {
      raw = await fs.readFile(queuePath, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    const kept = [];
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch (_e) {
        kept.push(line);
        continue;
      }
      if (row?.source === "codex") continue;
      kept.push(line);
    }
    await ensureDir(path.dirname(queuePath));
    const tmp = `${queuePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmp, kept.concat(rebuilt.queueRows).join("\n") + "\n", "utf8");
    await fs.rename(tmp, queuePath);
  }

  // 2. Swap the live codex hourly state for the rebuilt one, and install the
  //    rebuilt per-file cursors (offset at EOF) so the later parse in THIS sync
  //    does not re-read codex (which would re-inflate project buckets).
  const hourly = (cursors.hourly ||= { buckets: {}, groupQueued: {} });
  hourly.buckets ||= {};
  hourly.groupQueued ||= {};
  for (const k of Object.keys(hourly.buckets)) {
    if (k.startsWith("codex|")) delete hourly.buckets[k];
  }
  for (const k of Object.keys(hourly.groupQueued)) {
    if (k.startsWith("codex|")) delete hourly.groupQueued[k];
  }
  for (const [k, v] of Object.entries(rebuilt.buckets)) {
    if (k.startsWith("codex|")) hourly.buckets[k] = v;
  }
  for (const [k, v] of Object.entries(rebuilt.groupQueued)) {
    if (k.startsWith("codex|")) hourly.groupQueued[k] = v;
  }
  cursors.files ||= {};
  for (const fp of Object.keys(cursors.files)) {
    if (isCodexSessionCursorPath(fp)) delete cursors.files[fp];
  }
  for (const [fp, v] of Object.entries(rebuilt.files)) {
    cursors.files[fp] = v;
  }
  cursors.codexHashes = rebuilt.codexHashes;
  cursors.codexCompactionResponseIds = rebuilt.codexCompactionResponseIds;

  // 3. Project usage mirrors the main Codex repair: drop inflated Codex project
  //    rows, append the rebuilt rows, and swap only Codex project buckets. Project
  //    metadata is merged so visibility/purge state from non-Codex sources stays.
  if (projectRepairEnabled) {
    let projectRaw = "";
    try {
      projectRaw = await fs.readFile(projectQueuePath, "utf8");
    } catch (e) {
      if (e?.code !== "ENOENT") throw e;
    }
    const keptProjectRows = [];
    for (const line of projectRaw.split("\n")) {
      if (!line.trim()) continue;
      let row;
      try {
        row = JSON.parse(line);
      } catch (_e) {
        keptProjectRows.push(line);
        continue;
      }
      if (row?.source === "codex") continue;
      keptProjectRows.push(line);
    }
    await ensureDir(path.dirname(projectQueuePath));
    const tmp = `${projectQueuePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(
      tmp,
      keptProjectRows.concat(rebuilt.projectQueueRows).join("\n") + "\n",
      "utf8",
    );
    await fs.rename(tmp, projectQueuePath);

    const projectHourly = (cursors.projectHourly ||= { version: 2, buckets: {}, projects: {} });
    projectHourly.version = 2;
    projectHourly.buckets ||= {};
    projectHourly.projects ||= {};
    for (const [key, bucket] of Object.entries(projectHourly.buckets)) {
      const source = typeof bucket?.source === "string" ? bucket.source : key.split("|")[1];
      if (source === "codex") delete projectHourly.buckets[key];
    }
    const rebuiltProjectHourly = rebuilt.projectHourly || {};
    for (const [key, bucket] of Object.entries(rebuiltProjectHourly.buckets || {})) {
      const source = typeof bucket?.source === "string" ? bucket.source : key.split("|")[1];
      if (source === "codex") projectHourly.buckets[key] = bucket;
    }
    for (const [key, meta] of Object.entries(rebuiltProjectHourly.projects || {})) {
      if (meta && typeof meta === "object") projectHourly.projects[key] = meta;
    }
    projectHourly.updatedAt = new Date().toISOString();
  }

  // 4. Reset the cloud upload offset so the corrected queue re-uploads. Other
  //    sources re-upsert idempotently (last emission per key wins).
  if (typeof queueStatePath === "string" && queueStatePath) {
    let uploadState = {};
    try {
      uploadState = JSON.parse(await fs.readFile(queueStatePath, "utf8"));
    } catch (_e) {
      uploadState = {};
    }
    uploadState.offset = 0;
    uploadState.updatedAt = new Date().toISOString();
    uploadState.note = uploadNote;
    await fs.writeFile(queueStatePath, JSON.stringify(uploadState));
  }
  if (projectRepairEnabled && typeof projectQueueStatePath === "string" && projectQueueStatePath) {
    let uploadState = {};
    try {
      uploadState = JSON.parse(await fs.readFile(projectQueueStatePath, "utf8"));
    } catch (_e) {
      uploadState = {};
    }
    uploadState.offset = 0;
    uploadState.updatedAt = new Date().toISOString();
    uploadState.note = uploadNote;
    await fs.writeFile(projectQueueStatePath, JSON.stringify(uploadState));
  }

  migrations[migrationKey] = new Date().toISOString();
  return true;
}

// #169 follow-up: repair the historical inflation left by same-day forked
// Codex rollout replays (see CODEX_FORK_REPLAY_REPAIR_KEY). Delegates to the
// #187 guarded rebuild with the fork-repair key.
async function repairCodexForkReplayInflation({
  cursors,
  queuePath,
  queueStatePath,
  projectQueuePath,
  projectQueueStatePath,
  rolloutFiles,
  // True when the #187 repair ran its rebuild earlier in THIS sync: that
  // rebuild already used the fork-aware parser, so the history is clean and a
  // second rebuild would be pure waste.
  legacyRepairRan = false,
}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  // Same completed-vs-skipped semantics as the #187 repair: an ISO string is
  // final, a {skipped:true} sentinel retries (the skip condition can clear).
  const prior = migrations[CODEX_FORK_REPLAY_REPAIR_KEY];
  if (prior && !(typeof prior === "object" && prior.skipped)) return false;

  if (legacyRepairRan) {
    migrations[CODEX_FORK_REPLAY_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  // Pre-gate: fork phantom can only exist on installs that have (or had) a
  // forked rollout. Scanning file heads is cheap; the rebuild re-parses every
  // codex file. Files forked AFTER the parser fix shipped never accrue
  // phantom, so a definitive "no forks" verdict may finalize — but ONLY when
  // this scan can actually stand for the install's whole codex history:
  //   1. every candidate head was readable (an unreadable candidate could be
  //      the one forked rollout), AND
  //   2. every codex session recorded in cursors is covered by THIS scan's
  //      file list (same UUID-keyed reproducibility rule as the #187 guard).
  //      A forked rollout can be real yet absent from one run's rolloutFiles —
  //      WSL/native split probing, a temporarily missing ~/.codex, a deleted
  //      file whose phantom is already in history — and finalizing off such a
  //      partial view would permanently foreclose the repair this migration
  //      exists to perform, while the guarded repair itself would only have
  //      deferred retryably.
  // Either failure defers with the retryable {skipped:true} sentinel.
  const forkScan = await scanForForkedCodexRollout(rolloutFiles);
  if (!forkScan.forked) {
    if (forkScan.indeterminate) {
      migrations[CODEX_FORK_REPLAY_REPAIR_KEY] = {
        skipped: true,
        reason: "fork_scan_indeterminate",
        at: new Date().toISOString(),
      };
      return false;
    }
    const scannedSessionIds = new Set();
    const scannedPaths = new Set();
    for (const entry of Array.isArray(rolloutFiles) ? rolloutFiles : []) {
      const fp = typeof entry === "string" ? entry : entry?.path;
      const src = typeof entry === "string" ? "codex" : String(entry?.source || "codex");
      if (!fp || src !== "codex") continue;
      scannedPaths.add(fp);
      const id = codexSessionIdFromPath(fp);
      if (id) scannedSessionIds.add(id);
    }
    if (cursors.files && typeof cursors.files === "object") {
      for (const fp of Object.keys(cursors.files)) {
        if (!isCodexSessionCursorPath(fp)) continue;
        if (scannedPaths.has(fp)) continue;
        const id = codexSessionIdFromPath(fp);
        if (id && scannedSessionIds.has(id)) continue;
        migrations[CODEX_FORK_REPLAY_REPAIR_KEY] = {
          skipped: true,
          reason: "codex_history_not_covered",
          at: new Date().toISOString(),
        };
        return false;
      }
    }
    migrations[CODEX_FORK_REPLAY_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  return repairCodexRescanInflation({
    cursors,
    queuePath,
    queueStatePath,
    projectQueuePath,
    projectQueueStatePath,
    rolloutFiles,
    migrationKey: CODEX_FORK_REPLAY_REPAIR_KEY,
    uploadNote: "reset_after_codex_fork_replay_2026_07",
  });
}

// Rebuild historical Codex usage only when a rollout proves that the old
// single-baseline parser crossed cumulative SessionState lineages. Detection is
// based on the token counter stream itself, not multi_agent_version metadata:
// affected legacy rollouts can predate that marker or carry it only in the
// middle of a large file. Every contributing rollout must also be valid and
// stable before the atomic rebuild can replace live history.
async function repairCodexInterleavedUsageInflation({
  cursors,
  queuePath,
  queueStatePath,
  projectQueuePath,
  projectQueueStatePath,
  rolloutFiles,
  // Either older guarded repair rebuilt every Codex file with the current
  // parser earlier in this sync, so a second full rebuild is unnecessary.
  legacyRepairRan = false,
  maxLineageScanBytes = Infinity,
}) {
  if (!cursors || typeof cursors !== "object") return false;
  const migrations = (cursors.migrations ||= {});
  const prior = migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY];
  if (prior && !(typeof prior === "object" && prior.skipped)) return false;

  if (legacyRepairRan) {
    migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  const scan = await scanForInterleavedCodexUsage(rolloutFiles, {
    maxLineageScanBytes,
  });
  if (scan.indeterminate) {
    migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY] = {
      skipped: true,
      reason: "usage_lineage_scan_indeterminate",
      at: new Date().toISOString(),
    };
    return false;
  }

  if (!scan.affected) {
    if (!isCodexHistoryCovered(cursors, rolloutFiles)) {
      migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY] = {
        skipped: true,
        reason: "codex_history_not_covered",
        at: new Date().toISOString(),
      };
      return false;
    }
    migrations[CODEX_USAGE_LINEAGE_REPAIR_KEY] = new Date().toISOString();
    return false;
  }

  return repairCodexRescanInflation({
    cursors,
    queuePath,
    queueStatePath,
    projectQueuePath,
    projectQueueStatePath,
    rolloutFiles,
    expectedCodexFileSnapshots: scan.fileSnapshots,
    migrationKey: CODEX_USAGE_LINEAGE_REPAIR_KEY,
    uploadNote: "reset_after_codex_usage_lineage_2026_07_v2",
  });
}

async function scanForInterleavedCodexUsage(
  rolloutFiles,
  { maxLineageScanBytes = Infinity } = {},
) {
  let affected = false;
  let remainingBytes = Number.isFinite(maxLineageScanBytes)
    ? Math.max(0, maxLineageScanBytes)
    : Infinity;
  const fileSnapshots = new Map();
  const seenPaths = new Set();

  for (const entry of Array.isArray(rolloutFiles) ? rolloutFiles : []) {
    const fp = typeof entry === "string" ? entry : entry?.path;
    const src = typeof entry === "string" ? "codex" : String(entry?.source || "codex");
    if (!fp || src !== "codex" || seenPaths.has(fp)) continue;
    seenPaths.add(fp);

    const lineage = await scanCodexUsageLineages(fp, remainingBytes);
    if (lineage.indeterminate) {
      return { affected: false, indeterminate: true, fileSnapshots: new Map() };
    }
    affected ||= lineage.affected;
    fileSnapshots.set(fp, lineage.fileSnapshot);
    if (Number.isFinite(remainingBytes)) {
      remainingBytes = Math.max(0, remainingBytes - lineage.bytesRead);
    }
  }
  return { affected, indeterminate: false, fileSnapshots };
}

async function scanCodexUsageLineages(filePath, maxBytes = Infinity) {
  let stream = null;
  try {
    const before = await readCodexFileSnapshot(filePath);
    const state = createUsageDeltaState();
    const byteLimit = Number.isFinite(maxBytes) ? Math.max(0, maxBytes) : Infinity;
    let bytesRead = 0;
    let affected = false;
    const isCompressed = typeof filePath === "string" && /\.jsonl\.zstd?$/i.test(filePath);
    if (isCompressed) {
      // Honor the background-sync lineage budget against compressed size so a
      // pending repair with large archives stays bounded and returns
      // indeterminate until a full sync can finish the scan.
      if (!(byteLimit > 0) || before.size > byteLimit) {
        return { affected: false, indeterminate: true };
      }
      const snapshot = await readCodexRolloutSnapshot(filePath);
      if (!snapshot) return { affected: false, indeterminate: true };
      for (const raw of snapshot.lines) {
        const line = typeof raw === "string" ? raw : "";
        if (!line.trim()) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch (_e) {
          return { affected: false, indeterminate: true };
        }
        const token = extractTokenCount(obj);
        const info = token?.info;
        if (!info || typeof info !== "object") continue;
        consumeUsageDelta(state, info.last_token_usage, info.total_token_usage);
        if (state.sawInterleaved || state.sawDivergentCumulative) {
          affected = true;
        }
      }
      bytesRead = snapshot.size;
    } else {
      stream = fssync.createReadStream(filePath, { highWaterMark: 32 * 1024 });
      for await (const record of physicalJsonlRecords(stream, {
        maxPhysicalBytes: byteLimit,
      })) {
        const { line } = record;
        bytesRead += record.physicalBytes;
        if (bytesRead > byteLimit) return { affected: false, indeterminate: true };
        if (!line.trim()) continue;
        let obj;
        try {
          obj = JSON.parse(line);
        } catch (_e) {
          return { affected: false, indeterminate: true };
        }
        const token = extractTokenCount(obj);
        const info = token?.info;
        if (!info || typeof info !== "object") continue;
        consumeUsageDelta(state, info.last_token_usage, info.total_token_usage);
        if (state.sawInterleaved || state.sawDivergentCumulative) {
          affected = true;
        }
      }
    }
    const after = await readCodexFileSnapshot(filePath);
    if (!sameCodexFileSnapshot(before, after)) {
      return { affected: false, indeterminate: true };
    }
    return {
      affected,
      indeterminate: false,
      bytesRead,
      fileSnapshot: after,
    };
  } catch (_e) {
    return { affected: false, indeterminate: true };
  } finally {
    if (stream) stream.destroy();
  }
}

async function readCodexFileSnapshot(filePath) {
  const stat = await fs.stat(filePath);
  return {
    size: Number(stat.size),
    mtimeMs: Number(stat.mtimeMs),
    ctimeMs: Number(stat.ctimeMs),
    ino: Number(stat.ino),
    dev: Number(stat.dev),
  };
}

function sameCodexFileSnapshot(left, right) {
  return Boolean(
    left &&
      right &&
      left.size === right.size &&
      left.mtimeMs === right.mtimeMs &&
      left.ctimeMs === right.ctimeMs &&
      left.ino === right.ino &&
      left.dev === right.dev
  );
}

async function validateCodexRebuildFileSnapshots(rebuiltFiles, expectedSnapshots) {
  for (const [filePath, expected] of expectedSnapshots) {
    let actual;
    try {
      actual = await readCodexFileSnapshot(filePath);
    } catch (_e) {
      return { ok: false, reason: "a scanned rollout became unreadable during rebuild" };
    }
    if (!sameCodexFileSnapshot(expected, actual)) {
      return { ok: false, reason: "a scanned rollout changed during rebuild" };
    }
    const rebuiltCursor = rebuiltFiles?.[filePath];
    if (!rebuiltCursor) {
      return { ok: false, reason: "the rebuild omitted a scanned rollout cursor" };
    }
    if (Number(rebuiltCursor.offset) !== expected.size) {
      return { ok: false, reason: "the rebuild did not consume a scanned rollout through EOF" };
    }
  }
  return { ok: true };
}

function isCodexHistoryCovered(cursors, rolloutFiles) {
  const scannedPaths = new Set();
  const scannedSessionIds = new Set();
  for (const entry of Array.isArray(rolloutFiles) ? rolloutFiles : []) {
    const fp = typeof entry === "string" ? entry : entry?.path;
    const src = typeof entry === "string" ? "codex" : String(entry?.source || "codex");
    if (!fp || src !== "codex") continue;
    scannedPaths.add(fp);
    const id = codexSessionIdFromPath(fp);
    if (id) scannedSessionIds.add(id);
  }
  if (!cursors.files || typeof cursors.files !== "object") return true;
  for (const fp of Object.keys(cursors.files)) {
    if (!isCodexSessionCursorPath(fp)) continue;
    if (scannedPaths.has(fp)) continue;
    const id = codexSessionIdFromPath(fp);
    if (id && scannedSessionIds.has(id)) continue;
    return false;
  }
  return true;
}

// Scans codex rollout heads for the fork marker. The child session_meta (with
// forked_from_id) is the FIRST line of a forked rollout — observed at byte
// offset ≤169 across every local sample — so a bounded head read is
// sufficient. 64KB leaves ample margin for long base_instructions preceding
// it; a substring false positive (the marker quoted in unrelated head content)
// only costs one redundant guarded rebuild, never data. Tri-state result:
// {forked:true} on a hit, {forked:false, indeterminate:false} only when every
// candidate was inspected, {forked:false, indeterminate:true} when any head
// read failed — the caller must not finalize "no forks" off a failed read.
async function scanForForkedCodexRollout(rolloutFiles) {
  const HEAD_BYTES = 65536;
  let indeterminate = false;
  for (const entry of Array.isArray(rolloutFiles) ? rolloutFiles : []) {
    const fp = typeof entry === "string" ? entry : entry?.path;
    const src = typeof entry === "string" ? "codex" : String(entry?.source || "codex");
    if (!fp || src !== "codex") continue;
    let fh = null;
    try {
      if (typeof fp === "string" && /\.jsonl\.zstd?$/i.test(fp)) {
        const snapshot = await readCodexRolloutSnapshot(fp);
        if (!snapshot) {
          indeterminate = true;
          continue;
        }
        // Fork marker is in early session_meta; scan a bounded prefix of lines.
        let head = "";
        for (const raw of snapshot.lines) {
          head += (typeof raw === "string" ? raw : "") + "\n";
          if (head.length >= HEAD_BYTES) break;
        }
        if (head.includes('"forked_from_id"')) {
          return { forked: true, indeterminate: false };
        }
        continue;
      }
      fh = await fs.open(fp, "r");
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
      if (buf.toString("utf8", 0, bytesRead).includes('"forked_from_id"')) {
        return { forked: true, indeterminate: false };
      }
    } catch (_e) {
      indeterminate = true;
    } finally {
      if (fh) await fh.close().catch(() => {});
    }
  }
  return { forked: false, indeterminate };
}

async function projectUsageKeysFromQueuePath(queuePath, source) {
  if (typeof queuePath !== "string" || !queuePath) return [];
  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
    return [];
  }
  return projectUsageKeysFromQueueRows(raw.split("\n").filter((line) => line.trim()), source);
}

function projectUsageKeysFromQueueRows(rows, source) {
  const keys = [];
  for (const line of Array.isArray(rows) ? rows : []) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      continue;
    }
    const key = projectUsageKeyFromFields({
      projectKey: row?.project_key,
      source: row?.source,
      hourStart: row?.hour_start,
    });
    if (key && row?.source === source) keys.push(key);
  }
  return keys;
}

function projectUsageKeysFromState(projectState, source) {
  const buckets =
    projectState && typeof projectState === "object" && projectState.buckets
      ? projectState.buckets
      : {};
  const keys = [];
  for (const [key, bucket] of Object.entries(buckets)) {
    const bucketSource = typeof bucket?.source === "string" ? bucket.source : key.split("|")[1];
    if (bucketSource !== source) continue;
    const usageKey =
      projectUsageKeyFromFields({
        projectKey: bucket?.project_key,
        source: bucketSource,
        hourStart: bucket?.hour_start,
      }) || key;
    keys.push(usageKey);
  }
  return keys;
}

function projectUsageKeyFromFields({ projectKey, source, hourStart }) {
  if (
    typeof projectKey !== "string" ||
    typeof source !== "string" ||
    typeof hourStart !== "string" ||
    !projectKey ||
    !source ||
    !hourStart
  ) {
    return null;
  }
  return `${projectKey}|${source}|${hourStart}`;
}

async function countMalformedCodexProjectQueueRows(queuePath) {
  if (typeof queuePath !== "string" || !queuePath) return 0;
  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
    return 0;
  }
  let count = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      continue;
    }
    if (row?.source !== "codex") continue;
    const key = projectUsageKeyFromFields({
      projectKey: row?.project_key,
      source: row?.source,
      hourStart: row?.hour_start,
    });
    if (!key) count += 1;
  }
  return count;
}

async function projectUsageTotalsFromQueuePath(queuePath, source) {
  if (typeof queuePath !== "string" || !queuePath) return new Map();
  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
    return new Map();
  }
  return projectUsageTotalsFromQueueRows(raw.split("\n").filter((line) => line.trim()), source);
}

function projectUsageTotalsFromQueueRows(rows, source) {
  const totals = new Map();
  for (const line of Array.isArray(rows) ? rows : []) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      continue;
    }
    const key = projectUsageKeyFromFields({
      projectKey: row?.project_key,
      source: row?.source,
      hourStart: row?.hour_start,
    });
    if (!key || row?.source !== source) continue;
    setMaxTotal(totals, key, Number(row.total_tokens || 0));
  }
  return totals;
}

function projectUsageTotalsFromState(projectState, source) {
  const buckets =
    projectState && typeof projectState === "object" && projectState.buckets
      ? projectState.buckets
      : {};
  const totals = new Map();
  for (const [key, bucket] of Object.entries(buckets)) {
    const bucketSource = typeof bucket?.source === "string" ? bucket.source : key.split("|")[1];
    if (bucketSource !== source) continue;
    const usageKey =
      projectUsageKeyFromFields({
        projectKey: bucket?.project_key,
        source: bucketSource,
        hourStart: bucket?.hour_start,
      }) || key;
    setMaxTotal(totals, usageKey, Number(bucket?.totals?.total_tokens || 0));
  }
  return totals;
}

async function mainUsageHourTotalsFromQueuePath(queuePath, source) {
  if (typeof queuePath !== "string" || !queuePath) return new Map();
  let raw = "";
  try {
    raw = await fs.readFile(queuePath, "utf8");
  } catch (e) {
    if (e?.code !== "ENOENT") throw e;
    return new Map();
  }
  return mainUsageHourTotalsFromQueueRows(raw.split("\n").filter((line) => line.trim()), source);
}

function mainUsageHourTotalsFromQueueRows(rows, source) {
  const modelTotals = new Map();
  for (const line of Array.isArray(rows) ? rows : []) {
    let row;
    try {
      row = JSON.parse(line);
    } catch (_e) {
      continue;
    }
    if (row?.source !== source || typeof row?.hour_start !== "string") continue;
    const model = typeof row?.model === "string" && row.model ? row.model : "unknown";
    setMaxTotal(modelTotals, `${row.source}|${model}|${row.hour_start}`, Number(row.total_tokens || 0));
  }
  return collapseModelTotalsByHour(modelTotals);
}

function mainUsageHourTotalsFromState(hourlyState, source) {
  const buckets =
    hourlyState && typeof hourlyState === "object" && hourlyState.buckets
      ? hourlyState.buckets
      : {};
  const modelTotals = new Map();
  for (const [key, bucket] of Object.entries(buckets)) {
    const parts = key.split("|");
    const bucketSource = typeof bucket?.source === "string" ? bucket.source : parts[0];
    if (bucketSource !== source) continue;
    const model = typeof bucket?.model === "string" && bucket.model ? bucket.model : parts[1] || "unknown";
    const hourStart =
      typeof bucket?.hour_start === "string" && bucket.hour_start ? bucket.hour_start : parts[2];
    if (typeof hourStart !== "string" || !hourStart) continue;
    setMaxTotal(modelTotals, `${bucketSource}|${model}|${hourStart}`, Number(bucket?.totals?.total_tokens || 0));
  }
  return collapseModelTotalsByHour(modelTotals);
}

function collapseModelTotalsByHour(modelTotals) {
  const totals = new Map();
  for (const [key, total] of modelTotals.entries()) {
    const [source, , hourStart] = key.split("|");
    const hourKey = `${source}|${hourStart}`;
    totals.set(hourKey, (totals.get(hourKey) || 0) + total);
  }
  return totals;
}

function mergeMaxTotals(...maps) {
  const merged = new Map();
  for (const map of maps) {
    if (!(map instanceof Map)) continue;
    for (const [key, total] of map.entries()) {
      setMaxTotal(merged, key, total);
    }
  }
  return merged;
}

function setMaxTotal(map, key, total) {
  if (!key || !Number.isFinite(total)) return;
  const prev = map.get(key);
  if (!Number.isFinite(prev) || total > prev) map.set(key, total);
}

// One-time repair (#204): when the SAME Droid session id existed in two folders
// under ~/.factory/sessions, parseDroidIncremental's cumulative-delta loop made the
// lower-count file look like a reset and re-emitted each duplicate's full total on
// EVERY sync, inflating one (droid, model, hour) bucket without bound (a real ~10M
// session showed as 40.06B). The forward fix is dedupeDroidSettingsFilesBySession
// inside the parser; this migration repairs already-polluted installs.
//
// SCOPE — strictly the duplicate sessions' buckets, and ONLY when duplicate files
// still exist on disk:
//   * A from-zero rebuild cannot reconstruct Droid's historical per-sync bucket
//     distribution — settings.json carries only the CURRENT mtime, not per-turn
//     timestamps like Codex's jsonl. So we rebuild over the DUPLICATE files only,
//     and overwrite only the bucket keys those files map to (pollutedKeys) plus
//     the duplicate sessions' cursor entries. Every other droid bucket and cursor
//     — clean sessions AND deleted-session history — is left byte-for-byte intact,
//     so healthy history is never collapsed into the current half-hour.
//   * No session id has >1 file on disk → this bug never fired here: set the
//     sentinel, touch nothing.
//   * Fire only when live > rebuilt over pollutedKeys (actual inflation), so a
//     fresh install (live empty) is left to the normal same-sync parse.
// Droid has no project dimension, so project.queue.jsonl is never involved.

module.exports = {
  CODEX_FORK_REPLAY_REPAIR_KEY,
  CODEX_RESCAN_DEDUP_REPAIR_KEY,
  CODEX_USAGE_LINEAGE_REPAIR_KEY,
  repairCodexForkReplayInflation,
  repairCodexInterleavedUsageInflation,
  repairCodexRescanInflation,
};
