"use strict";

// Kiro CLI 的 token 有两个来源：session 文件里的真实计数，以及 SQLite /
// 字符回退得到的 chars/4 估算。估算行必须带 usage_precision=estimated，
// 否则界面无法区分近似值与真实值（docs/sources-capture-audit.md §4 #4）。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { parseKiroCliIncremental } = require("../src/lib/rollout");

let DatabaseSync;
try { ({ DatabaseSync } = require("node:sqlite")); } catch { /* older Node */ }

function makeDb(dir) {
  const dbPath = path.join(dir, "data.sqlite3");
  const db = new DatabaseSync(dbPath);
  db.exec("CREATE TABLE conversations_v2 (conversation_id TEXT, value TEXT)");
  const value = JSON.stringify({
    model_info: { model_id: "claude-sonnet-4-20250514" },
    user_turn_metadata: {
      continuation_id: "conv-1",
      requests: [{
        request_id: "req-1",
        user_prompt_length: 400,
        response_size: 40,
        model_id: "claude-sonnet-4-20250514",
        request_start_timestamp_ms: Date.UTC(2026, 10, 19, 2, 5),
      }],
    },
  });
  db.prepare("INSERT INTO conversations_v2 (conversation_id, value) VALUES (?, ?)")
    .run("conv-1", value);
  db.close();
  return dbPath;
}

test("kiro cli rows derived from character lengths are marked estimated", { skip: !DatabaseSync }, async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-kiro-cli-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const dbPath = makeDb(dir);
  const queuePath = path.join(dir, "queue.jsonl");
  const cursors = {};

  await parseKiroCliIncremental({
    cursors,
    queuePath,
    env: { KIRO_CLI_DB_PATH: dbPath, HOME: dir, KIRO_HOME: path.join(dir, ".kiro") },
  });

  const rows = fs.readFileSync(queuePath, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.equal(row.source, "kiro");
  assert.equal(row.input_tokens, 100);
  assert.equal(row.output_tokens, 10);
  assert.equal(row.total_tokens, 110);
  assert.equal(row.hour_start, "2026-11-19T02:00:00.000Z");
  assert.equal(row.usage_precision, "estimated");
  assert.equal(cursors.kiroCli.requests["req-1"].estimated, true);
});
