"use strict";

// Qoder new-format JSONL (2026-11-05 upstream alignment):
//   - credits are the larger of credits / original_credits
//     (`??` would drop original_credits when credits is present-but-zero);
//   - billable:false + credits>0 rows are activity, not noise;
//   - a timestamp past the ECMAScript TimeClip limit is dropped per row
//     instead of throwing and aborting the whole source.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const { parseQoderNewIncremental } = require("../src/lib/rollout");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-qoder-new-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function assistant({ id, timestamp, usage, model = "qmodel_38max" }) {
  return {
    type: "assistant",
    sessionId: "session-1",
    timestamp,
    message: { id, role: "assistant", model, usage },
  };
}

test("Qoder JSONL: credits max, billable=false admission, timestamp clamp", async () => {
  const records = [
    // credits present-but-zero, original_credits holds the real value
    assistant({
      id: "m1",
      timestamp: "2026-11-04T10:05:00.000Z",
      usage: { input_tokens: 0, output_tokens: 0, credits: 0, original_credits: 2.5 },
    }),
    // Qoder 0.4.x credit-billed row
    assistant({
      id: "m2",
      timestamp: "2026-11-04T10:10:00.000Z",
      usage: { input_tokens: 0, output_tokens: 0, credits: 1.5, billable: false },
    }),
    // nanoseconds / clock garbage: must drop only this row
    assistant({
      id: "m3",
      timestamp: 1e17,
      usage: { input_tokens: 0, output_tokens: 0, credits: 9 },
    }),
    // ordinary token row
    assistant({
      id: "m4",
      timestamp: "2026-11-04T10:20:00.000Z",
      usage: { input_tokens: 10, output_tokens: 5 },
    }),
  ];

  const sessionFile = path.join(tmpDir, "session.jsonl");
  fs.writeFileSync(sessionFile, records.map((record) => JSON.stringify(record)).join("\n"));

  const queuePath = path.join(tmpDir, "queue.jsonl");
  const cursors = {};
  const result = await parseQoderNewIncremental({
    sessionFiles: [sessionFile],
    cursors,
    queuePath,
    sourceKey: "qoder",
    cursorKey: "qoderNew",
  });

  assert.equal(result.messagesProcessed, 3);
  assert.equal(Object.keys(cursors.qoderNew.messages).length, 3);

  const rows = fs
    .readFileSync(queuePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));

  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "qoder");
  assert.equal(rows[0].model, "qmodel_38max");
  assert.equal(rows[0].input_tokens, 10);
  assert.equal(rows[0].output_tokens, 5);
  assert.equal(rows[0].total_tokens, 15);
  assert.equal(rows[0].credits, 4);
  assert.equal(rows[0].conversation_count, 3);
});
