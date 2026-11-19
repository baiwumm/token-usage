"use strict";

// TRAE 逐请求口径（cursor v3）：server_history_info 的每条 llm_default 行是
// 一次模型请求，chat_turn 只保留一轮里最后一次请求。这里固定三件事：
// 1) exact_* 计数按同一语义归一；2) 有逐请求行的会话不再叠加 chat_turn；
// 3) 没有可用逐请求行的会话回退到 chat_turn；4) 版本升级会重建旧桶。

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const { parseTraeIncremental } = require("../src/lib/rollout");
const { normalizeTraeRequestUsage } = require("../src/lib/trae-usage");

const SEMANTICS = "provider_raw_usage_completion_includes_reasoning";
const MODEL = "deepseek-v4.1-flash";
const HOUR_A = Date.UTC(2026, 10, 19, 2, 0, 0) / 1000;
const HOUR_B = Date.UTC(2026, 10, 19, 2, 30, 0) / 1000;
const bucketOf = (sec) => new Date(sec * 1000).toISOString();
const keyOf = (sec, model = MODEL) => `trae|${model}|${bucketOf(sec)}`;

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-trae-request-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function request(overrides = {}) {
  return {
    id: "req-1",
    session_id: "conv-a",
    created_at: HOUR_A,
    updated_at: HOUR_A,
    model: MODEL,
    usage: {
      prompt_tokens: "1000",
      completion_tokens: "200",
      reasoning_tokens: "50",
      total_tokens: "1200",
      semantics: SEMANTICS,
      usage_kind: "chat_completion",
    },
    ...overrides,
  };
}

function turn(overrides = {}) {
  return {
    id: "turn-1",
    turn_id: null,
    session_id: "conv-b",
    created_at: HOUR_B,
    updated_at: HOUR_B,
    model: MODEL,
    usage: {
      prompt_tokens: 100,
      completion_tokens: 10,
      reasoning_tokens: 0,
      total_tokens: 110,
      prompt_tokens_total: 0,
      completion_tokens_total: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
    ...overrides,
  };
}

function storeFile() {
  const file = path.join(tmpDir, "database.db");
  fs.writeFileSync(file, "");
  return file;
}

async function runParse({ cursors = {}, requests = [], turns = [] } = {}) {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const result = await parseTraeIncremental({
    dbPaths: [storeFile()],
    cursors,
    queuePath,
    readUsageRows: async () => ({ requests, turns, requestsAvailable: true }),
  });
  return { cursors, result };
}

test("normalizeTraeRequestUsage splits reasoning out of completion", () => {
  const totals = normalizeTraeRequestUsage({
    prompt_tokens: "1000",
    completion_tokens: "200",
    reasoning_tokens: "50",
    total_tokens: "1200",
    semantics: SEMANTICS,
    usage_kind: "chat_completion",
  }, { model: MODEL });

  assert.deepEqual(totals, {
    input_tokens: 1000,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 150,
    reasoning_output_tokens: 50,
    total_tokens: 1200,
  });
});

test("normalizeTraeRequestUsage rejects rows whose counters disagree", () => {
  const base = {
    prompt_tokens: "1000",
    completion_tokens: "200",
    reasoning_tokens: "0",
    total_tokens: "1200",
    semantics: SEMANTICS,
    usage_kind: "chat_completion",
  };
  assert.equal(normalizeTraeRequestUsage({ ...base, total_tokens: "1201" }, {}), null);
  assert.equal(normalizeTraeRequestUsage({ ...base, semantics: "other" }, {}), null);
  assert.equal(normalizeTraeRequestUsage({ ...base, usage_kind: "embedding" }, {}), null);
  assert.equal(normalizeTraeRequestUsage({ ...base, prompt_tokens: "12x" }, {}), null);
  assert.equal(normalizeTraeRequestUsage({ ...base, reasoning_tokens: "201" }, {}), null);
});

test("per-request rows replace chat_turn for the same conversation", async () => {
  const { cursors } = await runParse({
    requests: [request()],
    // The same conversation's last-request snapshot must not be added on top.
    turns: [turn({ id: "turn-a", session_id: "conv-a", created_at: HOUR_A, updated_at: HOUR_A,
      usage: { prompt_tokens: 9000, completion_tokens: 900, reasoning_tokens: 0, total_tokens: 9900,
        prompt_tokens_total: 0, completion_tokens_total: 0,
        cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } })],
  });

  const bucket = cursors.hourly.buckets[keyOf(HOUR_A)];
  assert.equal(bucket.totals.total_tokens, 1200);
  assert.equal(bucket.totals.input_tokens, 1000);
  assert.equal(bucket.totals.output_tokens, 150);
  assert.equal(bucket.totals.reasoning_output_tokens, 50);
  assert.equal(bucket.totals.conversation_count, 1);
  assert.equal(cursors.trae.version, 3);
});

test("a conversation without request rows still counts its chat_turn snapshot", async () => {
  const { cursors } = await runParse({
    requests: [request({ id: "req-invalid", usage: { prompt_tokens: null, total_tokens: null } })],
    turns: [turn()],
  });

  const bucket = cursors.hourly.buckets[keyOf(HOUR_B)];
  assert.equal(bucket.totals.total_tokens, 110);
  assert.equal(bucket.totals.conversation_count, 1);
});

test("version bump rebuilds trae buckets from the stores", async () => {
  const staleKey = "trae|stale-model|2020-01-01T00:00:00.000Z";
  const cursors = {
    trae: { version: 2, stores: [], databases: {}, turns: {} },
    hourly: {
      version: 3,
      buckets: {
        [staleKey]: {
          totals: {
            input_tokens: 5, cached_input_tokens: 0, cache_creation_input_tokens: 0,
            output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 10,
            billable_total_tokens: 10, total_cost_usd: 0, conversation_count: 1, credits: 0,
          },
          queuedKey: null,
        },
      },
      groupQueued: {},
    },
  };

  await runParse({ cursors, requests: [request()] });

  assert.equal(cursors.hourly.buckets[staleKey], undefined);
  assert.equal(cursors.hourly.buckets[keyOf(HOUR_A)].totals.total_tokens, 1200);
  assert.equal(cursors.trae.version, 3);
});
