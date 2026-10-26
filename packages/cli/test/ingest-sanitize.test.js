"use strict";

// Regression tests for the upload-path poison-row defense. The ingest edge
// validates every row before writing and rejects the WHOLE batch on the
// first contract-invalid row; the queue offset only advances on success, so
// one bad row would otherwise stall every source behind it forever. These
// tests pin: sanitizeBucketForUpload coerces buckets into the contract shape
// (docs/cli-contract.md §2.4), readQueueBatch drops rows it cannot repair,
// and a dropped row never occupies its dedup key.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const { sanitizeBucketForUpload } = require("../src/lib/ingest-sanitize");
const { readQueueBatch } = require("../src/commands/sync");
const { validSessionId } = require("../src/lib/session-upload");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-ingest-sanitize-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeQueue(lines) {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  fs.writeFileSync(queuePath, lines.map((line) => JSON.stringify(line)).join("\n") + "\n");
  return queuePath;
}

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

function validState(overrides = {}) {
  return {
    kind: "account_session_state",
    source: "trae-cn",
    session_id: "session-1",
    model: "kimi-k2",
    bucket_start: "2026-10-26T01:00:00.000Z",
    input_tokens: 100,
    output_tokens: 20,
    cached_input_tokens: 30,
    cache_creation_input_tokens: 10,
    reasoning_output_tokens: 5,
    total_tokens: 160,
    snapshot_verified_at: "2026-10-26T02:00:00.000Z",
    ...overrides,
  };
}

test("sanitizeBucketForUpload floors fractional counters and clamps negatives to 0", () => {
  const out = sanitizeBucketForUpload(validBucket({
    input_tokens: 10.75,
    output_tokens: -4,
    reasoning_output_tokens: Number.NaN,
    total_cost_usd: -0.5,
  }));
  assert.equal(out.input_tokens, 10);
  assert.equal(out.output_tokens, 0);
  assert.equal(out.reasoning_output_tokens, 0);
  assert.equal(out.total_cost_usd, 0);
});

test("sanitizeBucketForUpload keeps a valid row verbatim, incl. explicit billable null", () => {
  const row = validBucket({ billable_total_tokens: null });
  assert.deepEqual(sanitizeBucketForUpload(row), row);
});

test("sanitizeBucketForUpload drops rows without a parseable hour_start and non-objects", () => {
  assert.equal(sanitizeBucketForUpload(validBucket({ hour_start: "garbage" })), null);
  assert.equal(sanitizeBucketForUpload(validBucket({ hour_start: 17 })), null);
  assert.equal(sanitizeBucketForUpload(null), null);
  assert.equal(sanitizeBucketForUpload([validBucket()]), null);
});

test("sanitizeBucketForUpload fills missing counters with 0 and cost with 0", () => {
  const out = sanitizeBucketForUpload({
    hour_start: "2026-10-26T01:00:00.000Z",
    source: "x",
    model: "m",
    total_tokens: 5,
  });
  assert.equal(out.input_tokens, 0);
  assert.equal(out.total_tokens, 5);
  assert.equal(out.billable_total_tokens, null);
  assert.equal(out.total_cost_usd, 0);
});

test("readQueueBatch drops poison account_session_states and keeps the valid one", async () => {
  const tooLong = validState({ session_id: "s".repeat(300) });
  const brokenSum = validState({ session_id: "broken", total_tokens: 99 });
  const good = validState({ session_id: "good" });
  const queuePath = writeQueue([validBucket(), tooLong, brokenSum, good]);
  const result = await readQueueBatch(queuePath, 0, 500);
  assert.equal(result.buckets.length, 1);
  assert.equal(result.sessionStates.length, 1);
  assert.equal(result.sessionStates[0].session_id, "good");
  assert.equal(result.nextOffset, fs.statSync(queuePath).size);
});

test("a poison row does not occupy its dedup key — a later valid snapshot is admitted", async () => {
  const poison = validState({ total_tokens: 99 });
  const good = validState({ total_tokens: 160 });
  const queuePath = writeQueue([poison, good]);
  const result = await readQueueBatch(queuePath, 0, 500);
  assert.equal(result.sessionStates.length, 1);
  assert.equal(result.sessionStates[0].total_tokens, 160);
});

test("readQueueBatch drops hourly rows the edge would 400 and floors fractional counters", async () => {
  const badHour = validBucket({ hour_start: "garbage" });
  const fractional = validBucket({ hour_start: "2026-10-26T02:00:00.000Z", total_tokens: 19.5 });
  const good = validBucket({ hour_start: "2026-10-26T03:00:00.000Z" });
  const queuePath = writeQueue([badHour, fractional, good]);
  const result = await readQueueBatch(queuePath, 0, 500);
  assert.equal(result.buckets.length, 2);
  assert.equal(result.buckets.find((b) => b.hour_start === "2026-10-26T02:00:00.000Z").total_tokens, 19);
  assert.equal(result.buckets.find((b) => b.hour_start === "2026-10-26T03:00:00.000Z").total_tokens, 19);
  assert.equal(result.nextOffset, fs.statSync(queuePath).size);
});

test("a segment of only-poison rows reads empty with the offset advanced", async () => {
  const queuePath = writeQueue([
    validBucket({ hour_start: "garbage" }),
    validState({ total_tokens: 99 }),
  ]);
  const result = await readQueueBatch(queuePath, 0, 500);
  assert.deepEqual(result.buckets, []);
  assert.deepEqual(result.sessionStates, []);
  assert.equal(result.nextOffset, fs.statSync(queuePath).size);
});

test("validSessionId rejects the full Unicode Cc range (incl. C1), matching the server", () => {
  assert.equal(validSessionId("ok-id"), true);
  assert.equal(validSessionId("bad\u0085-id"), false); // NEL, C1
  assert.equal(validSessionId("bad\u001f-id"), false); // C0
  assert.equal(validSessionId("bad\u007f-id"), false); // DEL
  assert.equal(validSessionId("with/slash"), false);
  assert.equal(validSessionId("with\\slash"), false);
});
