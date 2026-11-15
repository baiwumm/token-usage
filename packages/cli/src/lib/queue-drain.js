"use strict";

// Queue drain + batch reading, split out of commands/sync.js: one upload pass
// over queue.jsonl (bounded by batches, bytes and wall clock), the reject-strike
// accounting that quarantines a batch the backend keeps refusing, and the
// shared batch reader.

const {
  readJson,
  safeStatSize,
  writeJson,
} = require("./fs");
const {
  fetchFunctionResponse,
  functionUrlFor,
} = require("./function-url");
const {
  sanitizeBucketForUpload,
} = require("./ingest-sanitize");
const {
  normalizeQueueRow,
} = require("./queue-row-normalize");
const {
  iterateQueueLines,
  sessionSnapshotMs,
} = require("./upload-queue");
const {
  parseRetryAfterMs,
} = require("./upload-throttle");
const fs = require("node:fs/promises");
const path = require("node:path");

const UPLOAD_BUDGET_MS = 90_000;
const INGEST_SLUG = "token-usage-ingest";
const MAX_INGEST_BUCKETS = 500;

async function drainQueueToCloud({ baseUrl, anonKey, deviceToken, queuePath, queueStatePath, maxBatches = 5, batchSize = 200, maxDurationMs = UPLOAD_BUDGET_MS, canUpload = () => true, fetchImpl = fetch }) {
  const state = (await readJson(queueStatePath)) || { offset: 0 };
  let offset = Number(state.offset || 0);
  let inserted = 0;
  let skipped = 0;
  let batches = 0;
  let tokensIngested = 0;
  let creditsIngested = 0;
  let cloudAccess = null;
  let rejectStrikes = readRejectStrikes(state);
  const uploadId = crypto.randomUUID();
  const deadline = Date.now() + maxDurationMs;
  let batchBudget = Math.min(maxBatches, 100);
  let requestSignal = null;
  const resultSoFar = () => ({ inserted, skipped, batches, tokens: tokensIngested, credits: creditsIngested, ...(cloudAccess?.next_allowed_at ? { cloudAccess } : {}) });

  const queueSize = await safeStatSize(queuePath);
  const limit = Math.min(Math.max(1, Math.floor(Number(batchSize || 200))), MAX_INGEST_BUCKETS);

  try {
    for (let batch = 0; batch < batchBudget; batch++) {
      if (Date.now() >= deadline) break;
      if (offset >= queueSize) break;
      const result = await readQueueBatch(queuePath, offset, limit);
      // A states-only tail (e.g. a retry batch whose bucket rows already
      // uploaded) is still a meaningful upload: it advances the canonical
      // session corrections cloud-side.
      if (result.buckets.length === 0 && result.sessionStates.length === 0) {
        // Complete ignored control/malformed rows need no cloud request, but
        // must not leave a permanent pending tail. Incomplete bytes stay put.
        if (result.nextOffset > offset) {
          offset = result.nextOffset;
          state.offset = offset;
          state.updatedAt = new Date().toISOString();
          await writeJson(queueStatePath, state);
        }
        break;
      }

      const root = baseUrl.replace(/\/$/, "");
      const headers = {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${deviceToken}`,
      };
      if (anonKey) headers.apikey = anonKey;
      // Re-read after parsing/each batch so switching off stops an active drain.
      if (!canUpload()) break;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      requestSignal = AbortSignal.timeout(Math.max(1, Math.ceil(remainingMs)));
      const res = await fetchFunctionResponse(functionUrlFor(root, INGEST_SLUG), {
        method: "POST",
        headers,
        signal: requestSignal,
        body: JSON.stringify({
          upload_id: uploadId,
          hourly: result.buckets,
          ...(result.sessionStates.length > 0
            ? { account_session_states: result.sessionStates }
            : {}),
        }),
      }, fetchImpl);

      const rawText = await res.text();
      let data = {};
      try { data = JSON.parse(rawText); } catch { data = {}; }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}: ${rawText.substring(0, 500)}`);
        err.status = res.status;
        err.code = res.status === 401 ? "CLOUD_DEVICE_TOKEN_REJECTED"
          : typeof data?.code === "string" ? data.code
            : res.status === 403 ? "CLOUD_UPLOAD_FORBIDDEN" : "CLOUD_UPLOAD_FAILED";
        const retryAfter = res.headers?.get?.("Retry-After") ?? null;
        const retryAfterMs = parseRetryAfterMs(retryAfter);
        if (retryAfterMs !== null) err.retryAfterMs = retryAfterMs;
        // 400/413 are deterministic client-shape rejections: retrying the
        // identical batch can never succeed, and the offset only moves on
        // success. Count strikes per offset (persisted, so the count survives
        // process exits between scheduled syncs); after three, quarantine the
        // batch and advance past it — a loud, inspectable drop instead of a
        // silent stall. Quarantined rows stay in queue.jsonl, so
        // `tokenusage reconcile` keeps reporting them as drift for a human
        // to judge.
        if (err.status === 400 || err.status === 413) {
          const strikes = rejectStrikes.offset === offset ? rejectStrikes.count + 1 : 1;
          rejectStrikes = { count: strikes, offset };
          if (strikes >= REJECT_VALVE_LIMIT) {
            const quarantinePath = `${queuePath}.quarantine.jsonl`;
            const quarantined = await quarantineBatchAt({ queuePath, offset, limit, quarantinePath });
            offset = quarantined.nextOffset;
            state.offset = offset;
            delete state.reject;
            state.updatedAt = new Date().toISOString();
            await writeJson(queueStatePath, state);
            process.stderr.write(
              `Upload escape valve: HTTP ${err.status} rejected the same batch ${strikes} times; ` +
              `quarantined ${quarantined.rows} row(s) to ${quarantinePath} and advanced past them. ` +
              `Inspect the quarantine file — \`tokenusage reconcile\` will flag these keys as drift.\n`,
            );
            continue;
          }
          state.reject = { count: strikes, offset };
          state.updatedAt = new Date().toISOString();
          await writeJson(queueStatePath, state);
        }
        throw err;
      }

      if (!isConfirmedIngestResponse(data)) {
        const err = new Error(
          `Unconfirmed ingest response (HTTP ${res.status}): ${rawText.substring(0, 300)}`,
        );
        err.status = res.status;
        err.code = "CLOUD_UPLOAD_UNCONFIRMED";
        throw err;
      }
      cloudAccess = data;
      if (data.upload_scope === "community") batchBudget = Math.min(batchBudget, 10);
      inserted += Number(data?.inserted || 0);
      skipped += Number(data?.skipped || 0);
      // Client-side §2.11 telemetry: the total_tokens of the buckets this
      // request carried (a larger replay may last-wins-override them later;
      // this figure never participates in reconciliation). Credits sum the
      // same way — the display-only dimension (docs/sources-capture-audit.md
      // §2) — rounded to 6 decimals to keep float noise out of the ledger.
      for (const bucketRow of result.buckets) {
        tokensIngested += Number(bucketRow?.total_tokens) || 0;
        creditsIngested =
          Math.round((creditsIngested + (Number(bucketRow?.credits) || 0)) * 1e6) / 1e6;
      }
      batches += 1;

      offset = result.nextOffset;
      state.offset = offset;
      delete state.reject;
      state.updatedAt = new Date().toISOString();
      await writeJson(queueStatePath, state);
    }
  } catch (error) {
    // A bounded drain can finish partially without discarding successful
    // offsets or the server cooldown. Other failures retain their retry path.
    const requestTimedOut = requestSignal?.aborted && requestSignal.reason?.name === "TimeoutError" &&
      (error === requestSignal.reason || error.name === "TimeoutError" || error.name === "AbortError");
    if (!requestTimedOut || batches === 0) {
      error.uploadResult = resultSoFar();
      throw error;
    }
  }
  return resultSoFar();
}

// A 200 is not proof the ingest committed: captive portals / reverse proxies
// return 200 HTML and maintenance pages return an empty body. Advancing the
// queue offset on those silently drops the batch forever, so the drain only
// accepts the contract's success shape (docs/cli-contract.md §2.4).
function isCount(value) {
  return (
    (typeof value === "number" || typeof value === "string") &&
    value !== "" &&
    Number.isFinite(Number(value))
  );
}

function isConfirmedIngestResponse(data) {
  return Boolean(data) && typeof data === "object" && !Array.isArray(data) &&
    isCount(data.inserted) && isCount(data.skipped);
}

// Consecutive client-shape rejections (400/413) tolerated for one batch
// offset before the escape valve quarantines it. Three strikes mean the batch
// failed across three separate sync passes — no transient server state
// explains it.
const REJECT_VALVE_LIMIT = 3;

function readRejectStrikes(state) {
  const raw = state && typeof state.reject === "object" && state.reject !== null
    ? state.reject
    : {};
  const count = Number(raw.count);
  const offset = Number(raw.offset);

  return {
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 0,
    offset: Number.isFinite(offset) ? offset : null,
  };
}

// Re-read the batch at `offset` through the exact same pipeline the upload
// used, append the rows verbatim to the quarantine file, and report where the
// offset should jump to. The queue itself is never rewritten: quarantined rows
// stay in queue.jsonl, so reconcile keeps flagging their keys as
// missing_on_server drift for a human to judge.
async function quarantineBatchAt({ queuePath, offset, limit, quarantinePath }) {
  const result = await readQueueBatch(queuePath, offset, limit);
  const rows = [...result.buckets, ...result.sessionStates];

  if (rows.length > 0) {
    const payload = rows.map((row) => JSON.stringify(row)).join("\n") + "\n";
    await fs.appendFile(quarantinePath, payload, "utf8");
  }

  return { rows: rows.length, nextOffset: result.nextOffset };
}

async function readQueueBatch(queuePath, startOffset, maxBuckets) {
  const st = await fs.stat(queuePath).catch(() => null);
  if (!st || !st.isFile()) return { buckets: [], sessionStates: [], nextOffset: startOffset };
  if (startOffset >= st.size) return { buckets: [], sessionStates: [], nextOffset: startOffset };

  const handle = await fs.open(queuePath, "r");

  const bucketMap = new Map();
  // Account session states (kind: "account_session_state") are queue
  // control records, not usage rows: collect them separately so they ride
  // the same upload (after the bucket rows in file order) without entering
  // the bucket stream. Keyed by (source, session_id), use the strictly newer
  // snapshot_verified_at and retain the first row on ties, matching account
  // truth even after a clock rollback. Only one observation per session may
  // reach the ingest batch (duplicates would affect one ON CONFLICT row twice).
  // snapshot_verified_at rides along verbatim from the ORIGINAL fetch, so a
  // transport retry never fakes logical freshness.
  //
  // Batching: session-state records count toward the SAME per-batch record
  // cap (maxBuckets) as bucket rows. The ingest edge rejects a request with
  // more than 500 states (HTTP 400); before they counted, a states-heavy
  // queue (a fresh device's first 30-day TRAE sync appends one record per
  // observed session) was read in ONE uncapped batch - the 400 left the
  // queue offset untouched and every retry re-read the identical oversized
  // request, a permanent upload failure. With the default batchSize of 200
  // (and the MAX_INGEST_BUCKETS=500 clamp above), every request stays under
  // the edge cap while batching follows the existing design.
  const sessionStateMap = new Map();
  const sessionStateStamps = new Map();
  let offset = startOffset;
  let linesRead = 0;
  try {
    let batchBytes = 0;
    for await (const record of iterateQueueLines(handle, startOffset, st.size)) {
      // A producer may still be writing the last row; retry it once complete.
      if (!record.complete) break;
      // Byte budget: cut before the row that would overflow, never on the
      // batch's first row (a single oversized line cannot be split anyway,
      // and the whitelist keeps its wire shape small).
      if (linesRead > 0 && batchBytes + record.bytes.length > MAX_BATCH_BYTES) break;
      const line = record.bytes.toString("utf8");
      offset += record.bytes.length;
      batchBytes += record.bytes.length;
      if (!line.trim()) continue;
      let bucket;
      try {
        bucket = JSON.parse(line);
      } catch (_e) {
        continue;
      }
      if (bucket?.kind === "account_session_state") {
        if (typeof bucket.source === "string" && typeof bucket.session_id === "string" && bucket.session_id.trim()) {
          const verifiedMs = sessionSnapshotMs(bucket);
          // The edge validates before writing and 400s the WHOLE batch on one
          // invalid state ("Invalid account session state"); the offset only
          // advances on success, so uploading a poison row would stall the
          // queue head-of-line forever. Drop it here instead — nothing is
          // recorded for the key, so a later, valid snapshot for the same
          // session is still admitted.
          if (verifiedMs === null) continue;
          const ssSource = bucket.source.trim().toLowerCase();
          const stateKey = ssSource + "|" + bucket.session_id.trim();
          const sessionState = {
            source: ssSource,
            session_id: bucket.session_id.trim(),
            model: typeof bucket.model === "string" ? bucket.model : "",
            bucket_start: typeof bucket.bucket_start === "string" ? bucket.bucket_start : "",
            input_tokens: Number(bucket.input_tokens) || 0,
            output_tokens: Number(bucket.output_tokens) || 0,
            cached_input_tokens: Number(bucket.cached_input_tokens) || 0,
            cache_creation_input_tokens: Number(bucket.cache_creation_input_tokens) || 0,
            reasoning_output_tokens: Number(bucket.reasoning_output_tokens) || 0,
            total_tokens: Number(bucket.total_tokens) || 0,
            ...(typeof bucket.snapshot_verified_at === "string" && bucket.snapshot_verified_at
              ? { snapshot_verified_at: bucket.snapshot_verified_at }
              : {}),
          };
          const priorState = sessionStateMap.get(stateKey);
          const priorVerifiedMs = sessionStateStamps.get(stateKey) ?? null;
          if (!priorState || priorVerifiedMs === null || verifiedMs > priorVerifiedMs) {
            sessionStateMap.set(stateKey, sessionState);
            sessionStateStamps.set(stateKey, verifiedMs);
          }
          // Counted like a bucket row: the record rides THIS batch and its
          // bytes are covered by nextOffset, so the next batch resumes right
          // after it.
          linesRead += 1;
          if (linesRead >= maxBuckets) break;
        }
        continue;
      }
      // Pre-release watermark records from this feature branch's dev queues
      // are obsolete control records: drop them instead of letting them enter
      // the bucket stream (they carry no hour_start and would be skipped
      // downstream anyway, but be explicit).
      if (bucket?.kind === "account_sync_watermark") continue;
      const hourStart = typeof bucket?.hour_start === "string" ? bucket.hour_start : null;
      if (!hourStart || !Number.isFinite(Date.parse(hourStart))) continue;
      const source = (typeof bucket?.source === "string" ? bucket.source.trim().toLowerCase() : "") || "codex";
      const model = (typeof bucket?.model === "string" ? bucket.model.trim() : "") || "unknown";
      bucket.source = source;
      bucket.model = model;
      // Apply the same legacy-row corrections every local reader applies (the
      // project queue and the wrapped aggregator use this module too). Without
      // this the cloud permanently kept the RAW legacy values — e.g. old Codex
      // rows whose input_tokens still include cached tokens (6-7x inflated) —
      // while local readers showed corrected numbers.
      bucket = normalizeQueueRow(bucket);
      // Contract-shape coercion, poison-row drop (see lib/ingest-sanitize.js):
      // a fractional Grok counter or a negative OpenCode repair delta would
      // otherwise 400 the whole ingest batch and stall the queue.
      const sanitized = sanitizeBucketForUpload(bucket);
      if (!sanitized) continue;
      // Contract v2: project_key is part of the bucket identity. Split hours
      // carry several rows with the same (source, model, hour) under different
      // project keys (plus the '' residual); omitting it here collapsed them
      // to the last row and then advanced the offset past the rest, losing the
      // attributed usage permanently. New queue rows already carry the
      // server-normalized basename (rollout's appendProjectSplitRows); old
      // owner/repo rows stay distinct here and let the server's own basename
      // dedupe pick the larger total instead of collapsing them locally.
      const projectKey =
        typeof sanitized.project_key === "string" ? sanitized.project_key.trim() : "";
      bucketMap.set(`${source}|${model}|${hourStart}|${projectKey}`, sanitized);
      linesRead += 1;
      if (linesRead >= maxBuckets) break;
    }

  } finally {
    await handle.close();
  }
  return {
    buckets: Array.from(bucketMap.values()),
    sessionStates: Array.from(sessionStateMap.values()),
    nextOffset: offset,
  };
}

const MAX_BATCH_BYTES = 512 * 1024;

module.exports = {
  INGEST_SLUG,
  MAX_INGEST_BUCKETS,
  UPLOAD_BUDGET_MS,
  drainQueueToCloud,
  readQueueBatch,
};
