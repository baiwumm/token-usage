"use strict";

// Upload-path guards against a permanently stalled queue head (2026-11 audit
// P0): the ingest edge 400s the WHOLE batch on one invalid row and 413s bodies
// over 1 MiB (docs/cli-contract.md §1.2/§2.4), while the queue offset only
// advances on a confirmed success — so a poison or oversized batch used to
// retry identically forever. Defense in depth, layered:
//   1. sanitizeBucketForUpload rebuilds rows from the contract whitelist
//      (producer extras never reach the wire) and clamps counters to
//      Number.MAX_SAFE_INTEGER;
//   2. readQueueBatch cuts batches on a raw-byte budget like the sessions
//      channel already did;
//   3. drainQueueToCloud counts persisted 400/413 strikes per offset and, at
//      three, quarantines the batch (queue.quarantine.jsonl) and advances.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const { sanitizeBucketForUpload } = require("../src/lib/ingest-sanitize");
const { readQueueBatch, drainQueueToCloud } = require("../src/commands/sync");
const { buildSessionUploadRows } = require("../src/lib/session-upload");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-upload-guards-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function validBucket(overrides = {}) {
  return {
    hour_start: "2026-10-26T01:00:00.000Z",
    source: "claude",
    model: "claude-x",
    input_tokens: 10,
    cached_input_tokens: 2,
    cache_creation_input_tokens: 3,
    output_tokens: 4,
    reasoning_output_tokens: 1,
    total_tokens: 19,
    billable_total_tokens: 19,
    conversation_count: 1,
    total_cost_usd: 0.5,
    ...overrides,
  };
}

function writeQueue(name, rows) {
  const queuePath = path.join(tmpDir, name);
  fs.writeFileSync(queuePath, rows.map((row) => JSON.stringify(row)).join("\n") + "\n");
  return queuePath;
}

// ---------------------------------------------------------------------------
// 1. whitelist rebuild + safe-integer clamp
// ---------------------------------------------------------------------------

test("sanitizeBucketForUpload drops producer-private fields from the wire row", () => {
  const out = sanitizeBucketForUpload(validBucket({
    queuedKey: "claude|claude-x|2026-10-26T01:00:00.000Z",
    pad: "x".repeat(4096),
    api_duration_ms: 1234,
    model_calls: 3,
  }));
  assert.ok(out, "row survives");
  assert.equal(out.queuedKey, undefined);
  assert.equal(out.pad, undefined);
  assert.equal(out.api_duration_ms, undefined);
  assert.equal(out.model_calls, undefined);
  // Contract fields are intact.
  assert.equal(out.total_tokens, 19);
  assert.equal(out.conversation_count, 1);
  assert.equal(out.total_cost_usd, 0.5);
  // The wire row is smaller than the queue row (whitelist, not spread).
  assert.ok(JSON.stringify(out).length < JSON.stringify({ ...validBucket(), pad: "x".repeat(4096) }).length);
});

test("sanitizeBucketForUpload clamps counters to Number.MAX_SAFE_INTEGER", () => {
  const out = sanitizeBucketForUpload(validBucket({ total_tokens: 1e21, input_tokens: 5e18 }));
  assert.equal(out.total_tokens, Number.MAX_SAFE_INTEGER);
  assert.equal(out.input_tokens, Number.MAX_SAFE_INTEGER);
});

test("sanitizeBucketForUpload keeps a wire-shaped row byte-identical in content", () => {
  const row = validBucket({ credits: 0.642, project_key: "proj", conversations: 2 });
  const out = sanitizeBucketForUpload(row);
  assert.deepEqual(out, row);
});

// ---------------------------------------------------------------------------
// 2. byte budget in readQueueBatch
// ---------------------------------------------------------------------------

test("readQueueBatch cuts the batch before a row that would overflow the byte budget", async () => {
  const small = validBucket({ hour_start: "2026-10-26T01:00:00.000Z" });
  const bloated = validBucket({
    hour_start: "2026-10-26T02:00:00.000Z",
    pad: "x".repeat(768 * 1024), // raw line alone exceeds the 512 KiB budget
  });
  const queuePath = writeQueue("queue.jsonl", [small, bloated]);
  const first = await readQueueBatch(queuePath, 0, 500);

  assert.equal(first.buckets.length, 1, "batch stops before the oversized row");
  assert.equal(first.buckets[0].hour_start, small.hour_start);
  const sizeOf = (row) => JSON.stringify(row).length + 1;
  assert.equal(first.nextOffset, sizeOf(small), "offset sits exactly after the consumed row");

  // The next batch admits the oversized line (a single row cannot be split)
  // and the whitelist keeps its wire shape small.
  const second = await readQueueBatch(queuePath, first.nextOffset, 500);
  assert.equal(second.buckets.length, 1);
  assert.equal(second.buckets[0].hour_start, bloated.hour_start);
  assert.equal(second.buckets[0].pad, undefined, "whitelist strips the bloat");
  assert.ok(JSON.stringify(second.buckets[0]).length < 64 * 1024);
  assert.equal(second.nextOffset, fs.statSync(queuePath).size);
});

// ---------------------------------------------------------------------------
// 3. reject-strike escape valve in drainQueueToCloud
// ---------------------------------------------------------------------------

function fakeResponse({ ok, status, body }) {
  return {
    ok,
    status,
    headers: { get: () => null },
    text: async () => (body === undefined ? "" : JSON.stringify(body)),
  };
}

function poisonDrainFixture() {
  const rows = [
    validBucket({ hour_start: "2026-10-26T01:00:00.000Z" }),
    validBucket({ hour_start: "2026-10-26T02:00:00.000Z" }),
  ];
  const queuePath = writeQueue("queue.jsonl", rows);
  const queueStatePath = path.join(tmpDir, "queue.state.json");
  return { rows, queuePath, queueStatePath };
}

test("drain persists 400 strikes for the same offset and throws on the first two", async () => {
  const { queuePath, queueStatePath } = poisonDrainFixture();
  const calls = [];
  const fetchImpl = async () => {
    calls.push(1);
    return fakeResponse({ ok: false, status: 400, body: { error: "Invalid usage bucket" } });
  };

  await assert.rejects(
    () => drainQueueToCloud({
      baseUrl: "https://example.test/api",
      deviceToken: "d".repeat(64),
      queuePath,
      queueStatePath,
      maxBatches: 2,
      maxDurationMs: 5_000,
      fetchImpl,
    }),
    /HTTP 400/,
  );
  let state = JSON.parse(fs.readFileSync(queueStatePath, "utf8"));
  assert.equal(state.reject.count, 1);
  assert.equal(state.reject.offset, 0);
  assert.ok(!fs.existsSync(path.join(tmpDir, "queue.quarantine.jsonl")), "nothing quarantined yet");

  await assert.rejects(
    () => drainQueueToCloud({
      baseUrl: "https://example.test/api",
      deviceToken: "d".repeat(64),
      queuePath,
      queueStatePath,
      maxBatches: 2,
      maxDurationMs: 5_000,
      fetchImpl,
    }),
    /HTTP 400/,
  );
  state = JSON.parse(fs.readFileSync(queueStatePath, "utf8"));
  assert.equal(state.reject.count, 2, "strikes survive process exits via queue.state.json");
});

test("the third 400 quarantines the batch, advances the offset, and drains on", async () => {
  const { rows, queuePath, queueStatePath } = poisonDrainFixture();
  const quarantinePath = `${queuePath}.quarantine.jsonl`;
  const state = JSON.parse(fs.existsSync(queueStatePath) ? fs.readFileSync(queueStatePath, "utf8") : "{}");
  // Seed two strikes from the previous passes; the next 400 is the third.
  state.reject = { count: 2, offset: 0 };
  fs.writeFileSync(queueStatePath, JSON.stringify(state));

  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    if (calls <= 1) return fakeResponse({ ok: false, status: 400, body: { error: "Invalid usage bucket" } });
    return fakeResponse({ ok: true, status: 200, body: { inserted: 1, skipped: 0, upload_scope: "private" } });
  };

  const warnings = [];
  const originalWrite = process.stderr.write.bind(process.stderr);
  process.stderr.write = (chunk) => {
    warnings.push(String(chunk));
    return true;
  };
  try {
    const result = await drainQueueToCloud({
      baseUrl: "https://example.test/api",
      deviceToken: "d".repeat(64),
      queuePath,
      queueStatePath,
      maxBatches: 3,
      batchSize: 1, // one row per batch: the poison row quarantines alone
      maxDurationMs: 5_000,
      fetchImpl,
    });
    assert.equal(result.inserted, 1, "the healthy batch after the quarantine uploaded");
    assert.equal(result.batches, 1);
  } finally {
    process.stderr.write = originalWrite;
  }

  const quarantined = fs.readFileSync(quarantinePath, "utf8").trim().split("\n");
  assert.equal(quarantined.length, 1, "the rejected batch was quarantined");
  assert.equal(JSON.parse(quarantined[0]).hour_start, rows[0].hour_start);
  const savedState = JSON.parse(fs.readFileSync(queueStatePath, "utf8"));
  assert.equal(savedState.reject, undefined, "strike counter cleared after the valve fired");
  assert.equal(savedState.offset, fs.statSync(queuePath).size, "offset advanced past the poison batch");
  assert.ok(warnings.join("").includes("escape valve"), "the drop is loud");
});

test("a success clears persisted strikes and a 413 counts toward the same valve", async () => {
  const { rows, queuePath, queueStatePath } = poisonDrainFixture();
  const state = JSON.parse(fs.existsSync(queueStatePath) ? fs.readFileSync(queueStatePath, "utf8") : "{}");
  state.reject = { count: 2, offset: 0 };
  fs.writeFileSync(queueStatePath, JSON.stringify(state));

  // First call succeeds → the stale counter must reset, so a later 413 starts
  // from one, not three.
  let phase = 0;
  const fetchImpl = async () => {
    phase += 1;
    if (phase === 1) return fakeResponse({ ok: true, status: 200, body: { inserted: 1, skipped: 0, upload_scope: "private" } });
    return fakeResponse({ ok: false, status: 413, body: { error: "Upload too large" } });
  };

  await assert.rejects(
    () => drainQueueToCloud({
      baseUrl: "https://example.test/api",
      deviceToken: "d".repeat(64),
      queuePath,
      queueStatePath,
      maxBatches: 2,
      batchSize: 1, // batch 1 = row 1 (success), batch 2 = row 2 (413)
      maxDurationMs: 5_000,
      fetchImpl,
    }),
    /HTTP 413/,
  );
  const saved = JSON.parse(fs.readFileSync(queueStatePath, "utf8"));
  assert.equal(saved.reject.count, 1, "413 feeds the same valve; success had cleared the old strikes");
  assert.equal(saved.offset, JSON.stringify(rows[0]).length + 1, "the successful batch still advanced the offset");
  assert.ok(!fs.existsSync(path.join(tmpDir, "queue.quarantine.jsonl")));
});

test("401/403/5xx never trigger the valve — only 400/413 do", async () => {
  const { queuePath, queueStatePath } = poisonDrainFixture();
  const fetchImpl = async () => fakeResponse({ ok: false, status: 500, body: { error: "Internal server error" } });

  await assert.rejects(
    () => drainQueueToCloud({
      baseUrl: "https://example.test/api",
      deviceToken: "d".repeat(64),
      queuePath,
      queueStatePath,
      maxBatches: 1,
      maxDurationMs: 5_000,
      fetchImpl,
    }),
    /HTTP 500/,
  );
  // A 5xx never writes the strike counter — the normal retry path stands.
  assert.ok(!fs.existsSync(queueStatePath), "no reject state persisted for non-shape failures");
});

// ---------------------------------------------------------------------------
// 4. models-omitted visibility (P2)
// ---------------------------------------------------------------------------

test("buildSessionUploadRows counts sessions whose model detail was dropped", () => {
  const base = {
    source: "claude",
    session_id: "s1",
    started_at: "2026-10-26T01:00:00.000Z",
    ended_at: "2026-10-26T02:00:00.000Z",
    tokens: {
      input_tokens: 10,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 5,
      reasoning_output_tokens: 0,
      total_tokens: 15,
    },
    total_tokens: 15,
  };
  const withModels = {
    ...base,
    model_usage: [{
      model: "claude-x",
      input_tokens: 10,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 5,
      reasoning_output_tokens: 0,
      total_tokens: 15,
    }],
  };
  // >32 models: the contract cannot carry a valid array, so it is omitted.
  const tooManyModels = {
    ...base,
    session_id: "s2",
    model_usage: Array.from({ length: 33 }, (_, i) => ({
      model: `m${i}`,
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
    })),
  };
  const noModelRows = { ...base, session_id: "s3" };

  const result = buildSessionUploadRows([withModels, tooManyModels, noModelRows]);
  assert.equal(result.rows.length, 3);
  assert.equal(result.modelsOmitted, 1, "only the >32-model session is counted");
  // mapSessionRow omits the models key entirely when the array was dropped.
  assert.equal(result.rows.find((row) => row.session_id === "s2").models, undefined);
});
