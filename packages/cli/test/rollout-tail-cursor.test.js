"use strict";

// Incremental cursor discipline for append-only session logs. A sync racing a
// producer's write must never commit a cursor past a trailing line that is not
// yet complete:
//   - a partial trailing line (no LF, invalid JSON) is not counted and does not
//     advance the committed offset — the next sync re-reads it whole;
//   - completing the line counts it exactly once;
//   - a final unterminated line that already parses as complete JSON is
//     accepted (a producer flush without the trailing newline);
//   - truncating a file below the committed offset restarts the scan from
//     zero, and the persistent codex event store keeps that rescan idempotent.
//
// The codex path always had this discipline (physicalJsonlRecords +
// committedEndOffset). parseClaudeFile and the kimi/kimi-code wire readers
// used readline + stat-size commits and would permanently lose a record whose
// line was completed after a sync raced its write.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  parseRolloutIncremental,
  parseClaudeIncremental,
  parseKimiIncremental,
} = require("../src/lib/rollout");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-tail-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function codexTokenCountLine({ ts, input, output }) {
  const usage = {
    input_tokens: input,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: output,
    reasoning_output_tokens: 0,
    total_tokens: input + output,
  };
  return JSON.stringify({
    timestamp: ts,
    type: "event_msg",
    payload: {
      type: "token_count",
      info: { total_token_usage: usage, last_token_usage: usage },
    },
  });
}

function claudeAssistantLine({ id, ts, input, output }) {
  return JSON.stringify({
    type: "assistant",
    timestamp: ts,
    requestId: `req_${id}`,
    message: {
      id,
      role: "assistant",
      model: "claude-tail-test",
      usage: { input_tokens: input, output_tokens: output },
    },
  });
}

function kimiStatusLine({ id, tsEpochSec, input, output }) {
  return JSON.stringify({
    timestamp: tsEpochSec,
    message: {
      type: "StatusUpdate",
      payload: {
        message_id: id,
        token_usage: { input_other: input, output, input_cache_read: 0, input_cache_creation: 0 },
      },
    },
  });
}

test("codex rollout: a trailing partial line is not committed until complete", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const file = path.join(tmpDir, "rollout-2026-11-21.jsonl");
  const completeLine = codexTokenCountLine({ ts: "2026-11-21T10:00:00.000Z", input: 10, output: 5 }) + "\n";
  const partialLine = '{"timestamp":"2026-11-21T10:05:00.000Z","type":"event_msg","payload":{"type":"token_cou';
  fs.writeFileSync(file, completeLine + partialLine);

  const cursors = { files: {} };
  const seenEvents = new Set();
  const first = await parseRolloutIncremental({
    rolloutFiles: [file],
    cursors,
    codexEventStore: seenEvents,
    queuePath,
    source: "codex",
  });
  assert.equal(first.eventsAggregated, 1);
  assert.equal(
    cursors.files[file].offset,
    Buffer.byteLength(completeLine),
    "cursor stops at the last LF-terminated record, not stat.size",
  );

  // The producer finishes the line and a new usage turn lands after it.
  const grownLine = codexTokenCountLine({ ts: "2026-11-21T10:05:00.000Z", input: 20, output: 8 }) + "\n";
  const thirdLine = codexTokenCountLine({ ts: "2026-11-21T10:10:00.000Z", input: 30, output: 12 }) + "\n";
  fs.writeFileSync(file, completeLine + grownLine + thirdLine);

  const second = await parseRolloutIncremental({
    rolloutFiles: [file],
    cursors,
    codexEventStore: seenEvents,
    queuePath,
    source: "codex",
  });
  assert.equal(second.eventsAggregated, 2, "the completed line and the new turn are both counted");
  assert.equal(cursors.files[file].offset, Buffer.byteLength(completeLine + grownLine + thirdLine));
});

test("codex rollout: a final complete-JSON line without LF is accepted", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const file = path.join(tmpDir, "rollout-2026-11-21.jsonl");
  const line1 = codexTokenCountLine({ ts: "2026-11-21T10:00:00.000Z", input: 10, output: 5 }) + "\n";
  const line2 = codexTokenCountLine({ ts: "2026-11-21T10:05:00.000Z", input: 15, output: 6 }); // no trailing LF
  fs.writeFileSync(file, line1 + line2);

  const cursors = { files: {} };
  const result = await parseRolloutIncremental({
    rolloutFiles: [file],
    cursors,
    codexEventStore: new Set(),
    queuePath,
    source: "codex",
  });
  assert.equal(result.eventsAggregated, 2, "complete JSON without the trailing newline is counted");
  assert.equal(cursors.files[file].offset, Buffer.byteLength(line1 + line2));
});

test("codex rollout: truncation below the committed offset restarts from zero without double counting", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const file = path.join(tmpDir, "rollout-2026-11-21.jsonl");
  const line1 = codexTokenCountLine({ ts: "2026-11-21T10:00:00.000Z", input: 10, output: 5 }) + "\n";
  const line2 = codexTokenCountLine({ ts: "2026-11-21T10:05:00.000Z", input: 20, output: 8 }) + "\n";
  fs.writeFileSync(file, line1 + line2);

  const cursors = { files: {} };
  const seenEvents = new Set();
  await parseRolloutIncremental({
    rolloutFiles: [file],
    cursors,
    codexEventStore: seenEvents,
    queuePath,
    source: "codex",
  });
  assert.equal(cursors.files[file].offset, Buffer.byteLength(line1 + line2));

  // An external tool rewrites the file shorter (same inode, in-place write).
  fs.writeFileSync(file, line1);
  const after = await parseRolloutIncremental({
    rolloutFiles: [file],
    cursors,
    codexEventStore: seenEvents,
    queuePath,
    source: "codex",
  });
  assert.equal(after.eventsAggregated, 0, "the persistent event store keeps the rescan idempotent");
  assert.equal(cursors.files[file].offset, Buffer.byteLength(line1), "cursor re-reads the truncated file from zero");
});

test("claude session: a trailing partial line is not committed until complete", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const file = path.join(tmpDir, "session-1.jsonl");
  const completeLine = claudeAssistantLine({ id: "msg_1", ts: "2026-11-21T10:00:00.000Z", input: 10, output: 5 }) + "\n";
  const partialLine = '{"type":"assistant","timestamp":"2026-11-21T10:05:00.000Z","message":{"id":"msg_2","usage":{"input_tok';
  fs.writeFileSync(file, completeLine + partialLine);

  const cursors = { files: {} };
  const first = await parseClaudeIncremental({
    projectFiles: [file],
    cursors,
    queuePath,
    source: "claude",
  });
  assert.equal(first.eventsAggregated, 1);
  assert.equal(
    cursors.files[file].offset,
    Buffer.byteLength(completeLine),
    "cursor stops at the last LF-terminated record, not stat.size",
  );

  const grownLine = claudeAssistantLine({ id: "msg_2", ts: "2026-11-21T10:05:00.000Z", input: 20, output: 8 }) + "\n";
  fs.writeFileSync(file, completeLine + grownLine);
  const second = await parseClaudeIncremental({
    projectFiles: [file],
    cursors,
    queuePath,
    source: "claude",
  });
  assert.equal(second.eventsAggregated, 1, "the completed line is counted exactly once");
  assert.equal(cursors.files[file].offset, Buffer.byteLength(completeLine + grownLine));
});

test("kimi wire: a trailing partial line is not committed until complete", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const file = path.join(tmpDir, "wire.jsonl");
  const completeLine = kimiStatusLine({ id: "kim_1", tsEpochSec: 1763712000, input: 10, output: 5 }) + "\n";
  const partialLine = '{"timestamp":1763712060,"message":{"type":"StatusUpdate","payload":{"message_id":"kim_2","token_us';
  fs.writeFileSync(file, completeLine + partialLine);

  const cursors = { kimi: { seenIds: [], fileOffsets: {} } };
  const first = await parseKimiIncremental({
    wireFiles: [file],
    cursors,
    queuePath,
    model: "kimi-tail-test",
  });
  assert.equal(first.eventsAggregated, 1);
  assert.equal(
    cursors.kimi.fileOffsets[file].size,
    Buffer.byteLength(completeLine),
    "the committed size is the complete-record boundary, not the post-read stat size",
  );

  const grownLine = kimiStatusLine({ id: "kim_2", tsEpochSec: 1763712060, input: 20, output: 8 }) + "\n";
  fs.writeFileSync(file, completeLine + grownLine);
  const second = await parseKimiIncremental({
    wireFiles: [file],
    cursors,
    queuePath,
    model: "kimi-tail-test",
  });
  assert.equal(second.eventsAggregated, 1, "the completed line is counted exactly once");
  assert.equal(cursors.kimi.fileOffsets[file].size, Buffer.byteLength(completeLine + grownLine));
});
