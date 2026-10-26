"use strict";

// Golden tests for the session metadata upload against the ingest contract
// (docs/cli-contract.md §2.4 `sessions`): field whitelist, token identity,
// account-level sources, batching/ordering and watermark semantics. The wire
// shape asserted here is what the server validates — any drift on either side
// must fail one of these tests.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  basenameKey,
  buildSessionUploadRows,
  loadWatermarks,
  mapSessionRow,
  MAX_SESSIONS_PER_BATCH,
  selectSessionsForUpload,
  uploadSessions,
} = require("../src/lib/session-upload");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-session-upload-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function validRow(overrides = {}) {
  return {
    session_id: "abc-123",
    source: "claude",
    started_at: "2026-10-25T01:00:00.000Z",
    ended_at: "2026-10-25T02:00:00.000Z",
    project_key: "token-usage",
    // Sidecar shape: counters nested in row.tokens, total mirrored on top.
    tokens: {
      input_tokens: 100,
      cached_input_tokens: 10,
      cache_creation_input_tokens: 5,
      output_tokens: 50,
      reasoning_output_tokens: 20,
      total_tokens: 165, // 100 + 10 + 5 + 50
    },
    total_tokens: 165,
    model_usage: [
      {
        model: "glm-5.3",
        input_tokens: 100,
        cached_input_tokens: 10,
        cache_creation_input_tokens: 5,
        output_tokens: 50,
        reasoning_output_tokens: 20,
        total_tokens: 165,
      },
    ],
    // Fields that must NEVER reach the wire:
    title: "secret agent-authored title",
    project_ref: "/home/user/secret-cwd",
    _cache_key: "sha:whatever",
    ...overrides,
  };
}

function rowsOnly(request) {
  return request.body.sessions;
}

test("maps a valid row onto the contract whitelist", () => {
  const { rows, skipped } = buildSessionUploadRows([validRow()]);
  assert.equal(skipped, 0);
  assert.equal(rows.length, 1);
  const row = rows[0];
  assert.deepEqual(Object.keys(row).sort(), [
    "billable_total_tokens",
    "cache_creation_input_tokens",
    "cached_input_tokens",
    "ended_at",
    "input_tokens",
    "models",
    "output_tokens",
    "project_key",
    "reasoning_output_tokens",
    "session_id",
    "source",
    "started_at",
    "total_tokens",
  ]);
  assert.equal(row.total_tokens, 165);
  assert.equal(row.billable_total_tokens, null);
  assert.deepEqual(row.models, [
    {
      model: "glm-5.3",
      input_tokens: 100,
      cached_input_tokens: 10,
      cache_creation_input_tokens: 5,
      output_tokens: 50,
      reasoning_output_tokens: 20,
      total_tokens: 165,
    },
  ]);
});

test("privacy: title, project_ref and cache keys never reach the payload", () => {
  const { rows } = buildSessionUploadRows([validRow()]);
  const json = JSON.stringify(rows);
  assert.ok(!json.includes("secret agent-authored title"));
  assert.ok(!json.includes("/home/user/secret-cwd"));
  assert.ok(!json.includes("sha:whatever"));
});

test("drops account-level sources entirely", () => {
  const { rows } = buildSessionUploadRows([
    validRow({ source: "cursor", session_id: "c1" }),
    validRow({ source: "TRAE-CN ", session_id: "t1" }),
    validRow({ source: "claude", session_id: "c2" }),
  ]);
  assert.deepEqual(rows.map((r) => r.session_id), ["c2"]);
});

test("drops rows failing the token identity instead of failing the batch", () => {
  const { rows, skipped } = buildSessionUploadRows([
    validRow({ total_tokens: 999, session_id: "bad-identity" }),
    validRow({ session_id: "good" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_id, "good");
  assert.equal(skipped, 1);
});

test("folds zcode/opencode reasoning-outside-output rows into the contract identity", () => {
  // Vendor shape (zcode/opencode): total includes reasoning, output does not.
  // The contract requires reasoning ⊆ output, so the mapper folds it in and
  // total_tokens survives untouched (185 = 100 + 10 + 5 + 50 + 20).
  const skewedTokens = {
    input_tokens: 100,
    cached_input_tokens: 10,
    cache_creation_input_tokens: 5,
    output_tokens: 50,
    reasoning_output_tokens: 20,
    total_tokens: 185,
  };
  const row = validRow({
    tokens: skewedTokens,
    total_tokens: 185,
    model_usage: [{ model: "glm-5.3", ...skewedTokens }],
  });
  const mapped = mapSessionRow(row);
  assert.ok(mapped, "skewed-but-reconcilable row must not be dropped");
  assert.equal(mapped.total_tokens, 185);
  assert.equal(mapped.output_tokens, 70);
  assert.equal(mapped.reasoning_output_tokens, 20);
  assert.equal(mapped.models.length, 1);
  assert.equal(mapped.models[0].output_tokens, 70);
  assert.equal(mapped.models[0].total_tokens, 185);

  // An unreconcilable skew (total matches neither identity shape) still drops.
  assert.equal(
    mapSessionRow(validRow({ total_tokens: 186, session_id: "bad-skew" })),
    null
  );
});

test("drops rows with missing/invalid identity fields", () => {
  const badTokens = (patch) => ({ tokens: { ...validRow().tokens, ...patch } });
  const cases = [
    validRow({ session_id: "  " }),
    validRow({ session_id: "a/b".repeat(200) }), // path separators + too long
    validRow({ session_id: "line\nbreak" }),
    validRow({ started_at: "not-a-date" }),
    validRow({ ended_at: "" }),
    validRow({ started_at: "2026-10-25T03:00:00Z" }), // ended before started
    validRow(badTokens({ input_tokens: -1 })),
    validRow(badTokens({ input_tokens: 1.5 })),
    validRow({ total_tokens: null }),
  ];
  for (const row of cases) {
    assert.equal(mapSessionRow(row), null, JSON.stringify(row.session_id || row));
  }
});

test("falls back to the stable session_hash when no vendor session_id exists", () => {
  const { rows } = buildSessionUploadRows([
    validRow({ session_id: undefined, session_hash: "af80fc70a69f557" }),
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].session_id, "af80fc70a69f557");
  // And a row with neither identifier is dropped.
  const none = buildSessionUploadRows([validRow({ session_id: undefined })]);
  assert.equal(none.rows.length, 0);
});

test("project_key falls back to basename and handles empty forms", () => {
  assert.equal(basenameKey("/home/u/proj/"), "proj");
  assert.equal(basenameKey("C:\\home\\u\\proj\\"), "proj");
  assert.equal(basenameKey("."), null);
  assert.equal(basenameKey(".."), null);
  assert.equal(basenameKey(""), null);

  const { rows } = buildSessionUploadRows([validRow({ project_key: "/a/b/c" })]);
  assert.equal(rows[0].project_key, "c");
  const empty = buildSessionUploadRows([validRow({ project_key: "." })]).rows[0];
  assert.equal(empty.project_key, null);
});

test("models are omitted when the sum disagrees with the session total", () => {
  const row = validRow({
    model_usage: [
      { model: "a", input_tokens: 50, cached_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 25, reasoning_output_tokens: 0, total_tokens: 75 },
      { model: "b", input_tokens: 50, cached_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 25, reasoning_output_tokens: 0, total_tokens: 90 },
    ],
  });
  const mapped = mapSessionRow(row);
  assert.equal(mapped.models, undefined);
});

test("elided zero-value counters on model rows fill as 0 (fresh sidecars omit them)", () => {
  // zcode sidecar rows drop cache_creation/reasoning keys entirely; the
  // identity still holds and the wire must carry explicit zeros.
  const row = validRow({
    model_usage: [
      {
        model: "glm-5.3",
        input_tokens: 100,
        cached_input_tokens: 15,
        output_tokens: 50,
        total_tokens: 165,
      },
    ],
  });
  const mapped = mapSessionRow(row);
  assert.equal(mapped.models.length, 1);
  assert.equal(mapped.models[0].cache_creation_input_tokens, 0);
  assert.equal(mapped.models[0].reasoning_output_tokens, 0);
  assert.equal(mapped.models[0].total_tokens, 165);
});

test("sessions with more than 32 models omit the models array (contract cannot accept a partial sum)", () => {
  const usage = Array.from({ length: 40 }, (_, i) => ({
    model: `model-${i}`,
    input_tokens: i + 1,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: i + 1,
  }));
  const row = validRow({
    tokens: {
      input_tokens: 820, // sum of 1..40
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 820,
    },
    total_tokens: 820,
    model_usage: usage,
  });
  const mapped = mapSessionRow(row);
  assert.equal(mapped.models, undefined);
});

test("watermarks skip equal/older snapshots and admit strictly newer ones", () => {
  const watermarkPath = path.join(tmpDir, "watermarks.json");
  fs.writeFileSync(
    watermarkPath,
    JSON.stringify({ "claude|abc-123": "2026-10-25T02:00:00.000Z" }),
  );
  const watermarks = loadWatermarks(watermarkPath);
  const pending = selectSessionsForUpload(
    [
      validRow(), // equal ended_at → skip
      validRow({ ended_at: "2026-10-25T01:00:00.000Z" }), // older → skip
      validRow({ ended_at: "2026-10-25T03:00:00.000Z", session_id: "abc-123" }),
      validRow({ session_id: "other" }),
    ],
    watermarks,
  );
  assert.deepEqual(pending.map((r) => r.session_id + "@" + r.ended_at), [
    "other@2026-10-25T02:00:00.000Z",
    "abc-123@2026-10-25T03:00:00.000Z",
  ]);
});

test("upload batches at 200 ascending by ended_at and advances watermarks only on success", async () => {
  const watermarkPath = path.join(tmpDir, "watermarks.json");
  const sessions = [];
  for (let i = 0; i < MAX_SESSIONS_PER_BATCH + 50; i++) {
    sessions.push(validRow({
      session_id: `s-${String(i).padStart(4, "0")}`,
      started_at: "2026-10-25T00:00:00.000Z",
      ended_at: new Date(Date.parse("2026-10-25T00:00:00.000Z") + i * 1000).toISOString(),
    }));
  }

  const requests = [];
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push({ url, body });
    return {
      ok: true,
      json: async () => ({ inserted: 0, sessions_upserted: body.sessions.length, sessions_skipped: 0 }),
    };
  };

  const result = await uploadSessions({
    baseUrl: "https://example.test",
    anonKey: null,
    deviceToken: "token-1",
    sessions,
    watermarkPath,
    fetchImpl,
  });

  assert.equal(result.pending, MAX_SESSIONS_PER_BATCH + 50);
  assert.equal(result.uploaded, MAX_SESSIONS_PER_BATCH + 50);
  assert.equal(requests.length, 2);
  assert.ok(requests[0].url.endsWith("/api/functions/token-usage-ingest"));
  assert.equal(rowsOnly(requests[0]).length, MAX_SESSIONS_PER_BATCH);
  assert.equal(rowsOnly(requests[1]).length, 50);
  // Ascending ended_at across the whole upload.
  const all = [...rowsOnly(requests[0]), ...rowsOnly(requests[1])];
  for (let i = 1; i < all.length; i++) {
    assert.ok(all[i - 1].ended_at <= all[i].ended_at);
  }
  assert.equal(requests[0].body.upload_id, requests[1].body.upload_id);

  const marks = loadWatermarks(watermarkPath);
  assert.equal(marks.size, MAX_SESSIONS_PER_BATCH + 50);
  assert.equal(marks.get("claude|s-0000"), all[0].ended_at);
});

test("a failed batch keeps earlier watermark advances and reports progress", async () => {
  const watermarkPath = path.join(tmpDir, "watermarks.json");
  const sessions = [
    validRow({ session_id: "ok-1" }),
    validRow({ session_id: "ok-2" }),
    validRow({ session_id: "doomed" }),
  ];
  let call = 0;
  const fetchImpl = async () => {
    call += 1;
    if (call === 3) return { ok: false, status: 400, text: async () => '{"error":"Invalid session"}' };
    return { ok: true, json: async () => ({ inserted: 0, sessions_upserted: 1, sessions_skipped: 0 }) };
  };

  await assert.rejects(
    uploadSessions({
      baseUrl: "https://example.test", deviceToken: "t", sessions, watermarkPath, fetchImpl, batchSize: 1,
    }),
    (error) => error.status === 400 && error.uploaded === 2,
  );

  const marks = loadWatermarks(watermarkPath);
  assert.equal(marks.size, 2);
  assert.ok(marks.has("claude|ok-1"));
  assert.ok(marks.has("claude|ok-2"));
  assert.ok(!marks.has("claude|doomed"));
});

test("batches cut on the 1 MiB body limit as well as the row cap", () => {
  const { buildBatches } = require("../src/lib/session-upload");
  // Rows padded past 500 KiB each force one row per batch regardless of the
  // 200-row cap (a real batch of model-heavy sessions hit 413 this way).
  const fatRow = (i) => validRow({
    session_id: `fat-${i}`,
    project_key: "x".repeat(300 * 1024),
  });
  const batches = buildBatches([fatRow(1), fatRow(2), fatRow(3)], 200);
  assert.equal(batches.length, 3);
  for (const batch of batches) assert.equal(batch.length, 1);

  // Small rows still group up to the row cap.
  const small = Array.from({ length: 250 }, (_, i) => validRow({ session_id: `s-${i}` }));
  const grouped = buildBatches(small, 200);
  assert.deepEqual(grouped.map((b) => b.length), [200, 50]);
});

test("uploadSessions maps RAW sidecar rows internally (no unmapped field ever reaches the wire)", async () => {
  const watermarkPath = path.join(tmpDir, "watermarks.json");
  const rawSidecarRow = {
    ...validRow(),
    tokens: validRow().tokens, // counters nested (raw shape)
    title: "secret title",
    project_ref: "/home/u/secret",
    _cache_key: "sha:abc",
  };
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(JSON.parse(init.body));
    return { ok: true, json: async () => ({ inserted: 0, sessions_upserted: 1 }) };
  };
  const result = await uploadSessions({
    baseUrl: "https://example.test", deviceToken: "t",
    sessions: [rawSidecarRow], watermarkPath, fetchImpl,
  });
  assert.equal(result.uploaded, 1);
  const payload = seen[0].sessions[0];
  assert.equal(payload.input_tokens, 100); // unnested
  assert.ok(!("title" in payload));
  assert.ok(!("project_ref" in payload));
  assert.ok(!("_cache_key" in payload));
  assert.ok(!("tokens" in payload));
});

test("nothing is sent when every row is already watermarked", async () => {
  const watermarkPath = path.join(tmpDir, "watermarks.json");
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return { ok: true, json: async () => ({}) };
  };
  const { rows } = buildSessionUploadRows([validRow()]);
  fs.writeFileSync(watermarkPath, JSON.stringify({ [`claude|${rows[0].session_id}`]: rows[0].ended_at }));
  const result = await uploadSessions({
    baseUrl: "https://example.test", deviceToken: "t", sessions: rows, watermarkPath, fetchImpl,
  });
  assert.equal(called, 0);
  assert.equal(result.uploaded, 0);
});
