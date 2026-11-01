"use strict";

// `tokenusage reconcile` — the read-only comparison of queue.jsonl's last-wins
// baseline (AGENTS hard rule 8) against the device rows from
// docs/cli-contract.md §2.13. These tests pin:
//   * window parsing (UTC day boundaries, --days default, 366-day clamp),
//   * the local baseline pipeline (same normalize/sanitize as the upload path,
//     control records excluded, last-wins per (hour_start, source, model)),
//   * drift classification (missing_on_server / server_only / mismatch),
//   * paging, auth semantics (401/403/no token) and the exit code.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { describe, test, beforeEach, afterEach } = require("node:test");

const {
  cmdReconcile,
  compareBuckets,
  parseArgs,
  readLocalBaseline,
  readPendingBuckets,
  resolveWindow,
} = require("../src/commands/reconcile");
const { isUsageError } = require("../src/lib/cli-errors");

const HOUR_MS = 3_600_000;
const BASE_URL = "https://reconcile.test";
const FAKE_ANON_KEY = `anon_${"a".repeat(64)}`;
const FAKE_DEVICE_TOKEN = "recon-token-123";
const SAVED_ENV = {};

let sandbox;

beforeEach(() => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-reconcile-"));
  sandbox = {
    root,
    home: path.join(root, "home"),
    trackerDir: path.join(root, "home", ".tokenusage", "tracker"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
  fs.mkdirSync(sandbox.trackerDir, { recursive: true });

  for (const name of ["TOKENUSAGE_BASE_URL", "TOKENUSAGE_ANON_KEY", "TOKENUSAGE_DEVICE_TOKEN"]) {
    SAVED_ENV[name] = process.env[name];
  }
  process.env.TOKENUSAGE_BASE_URL = BASE_URL;
  process.env.TOKENUSAGE_ANON_KEY = FAKE_ANON_KEY;
  process.env.TOKENUSAGE_DEVICE_TOKEN = FAKE_DEVICE_TOKEN;
  delete process.env.TOKENUSAGE_INSFORGE_BASE_URL;
  delete process.env.TOKENUSAGE_INSFORGE_ANON_KEY;
});

afterEach(() => {
  process.exitCode = 0;
  for (const [name, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
  sandbox.cleanup();
});

// cmdReconcile writes through an output seam instead of process.stdout: the
// node test runner sends its own protocol over stdout, so tests must not
// replace the writer.
function collect() {
  const chunks = [];
  return {
    write: (chunk) => chunks.push(String(chunk)),
    text: () => chunks.join(""),
  };
}

// `uploadedThrough` = how many leading rows queue.state.json's offset already
// covers (default: the whole file). Reconcile reports the rest as pending.
function writeQueue(rows, { uploadedThrough } = {}) {
  const queuePath = path.join(sandbox.trackerDir, "queue.jsonl");
  const lines = rows.map((row) => (typeof row === "string" ? row : JSON.stringify(row)));
  const body = lines.length ? `${lines.join("\n")}\n` : "";
  fs.writeFileSync(queuePath, body);

  let offset = body.length;
  if (uploadedThrough != null) {
    offset = 0;
    for (let i = 0; i < Math.min(uploadedThrough, lines.length); i++) {
      offset += Buffer.byteLength(`${lines[i]}\n`, "utf8");
    }
  }
  fs.writeFileSync(
    path.join(sandbox.trackerDir, "queue.state.json"),
    JSON.stringify({ offset, updatedAt: "2026-10-31T00:00:00.000Z" }),
  );
  return queuePath;
}

function dropUploadState() {
  fs.rmSync(path.join(sandbox.trackerDir, "queue.state.json"), { force: true });
}

function bucket(overrides = {}) {
  return {
    hour_start: "2026-10-31T14:00:00.000Z",
    source: "claude",
    model: "claude-opus-4-5",
    input_tokens: 100,
    output_tokens: 20,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 120,
    // Real queue rows use the wire alias; the cloud column is `conversations`.
    conversation_count: 1,
    ...overrides,
  };
}

function serverRow(local, overrides = {}) {
  return {
    hour_start: local.hour_start,
    source: local.source,
    model: local.model,
    input_tokens: local.input_tokens || 0,
    cached_input_tokens: local.cached_input_tokens || 0,
    cache_creation_input_tokens: local.cache_creation_input_tokens || 0,
    output_tokens: local.output_tokens || 0,
    reasoning_output_tokens: local.reasoning_output_tokens || 0,
    total_tokens: local.total_tokens || 0,
    billable_total_tokens: null,
    conversations: local.conversation_count ?? local.conversations ?? 0,
    credits: 0,
    ...overrides,
  };
}

function response(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    text: async () => JSON.stringify(body ?? {}),
    json: async () => body ?? {},
  };
}

/** Fake backend: serves `rows` sorted + paged exactly like §2.13 describes. */
function fakeServer(rows, { status = 200, deviceId = "dev-1", hooks = [] } = {}) {
  const sorted = [...rows].sort(
    (a, b) =>
      a.hour_start.localeCompare(b.hour_start) ||
      a.source.localeCompare(b.source) ||
      a.model.localeCompare(b.model),
  );
  const calls = [];
  const fetchImpl = async (url, init) => {
    const parsed = new URL(url);
    calls.push({ url: parsed, init });
    hooks.forEach((hook) => hook(parsed, init, calls.length));
    const offset = Number(parsed.searchParams.get("offset") || 0);
    const limit = Math.min(Math.max(Number(parsed.searchParams.get("limit") || 1000), 1), 2000);
    const page = sorted.slice(offset, offset + limit);
    return response(status, {
      from: parsed.searchParams.get("from"),
      to: parsed.searchParams.get("to"),
      device_id: deviceId,
      limit,
      offset,
      buckets: page,
    });
  };
  return { fetchImpl, calls, sorted };
}

function run(argv, options = {}) {
  return cmdReconcile(argv, {
    home: sandbox.home,
    now: Date.parse("2026-11-01T00:00:00.000Z"),
    ...options,
  });
}

function windowFromArgs(args) {
  const opts = parseArgs(args);
  return resolveWindow(opts, Date.parse("2026-11-01T00:00:00.000Z"));
}

describe("argument + window parsing", () => {
  test("rejects unknown options and flags without a value", () => {
    for (const args of [["--bogus"], ["--days"], ["--from"], ["--limit"]]) {
      assert.throws(() => parseArgs(args), (error) => isUsageError(error) && error.exitCode === 2);
    }
  });

  test("default window is the last 7 days ending now", () => {
    const window = windowFromArgs([]);
    assert.equal(window.toMs, Date.parse("2026-11-01T00:00:00.000Z"));
    assert.equal(window.fromMs, window.toMs - 7 * 24 * HOUR_MS);
    assert.equal(window.clamped, false);
  });

  test("--days widens/--from narrows the window without changing `to`", () => {
    const window = windowFromArgs(["--days", "30"]);
    assert.equal(window.fromMs, window.toMs - 30 * 24 * HOUR_MS);

    const explicit = windowFromArgs(["--from", "2026-10-20"]);
    assert.equal(explicit.fromMs, Date.parse("2026-10-20T00:00:00.000Z"));
    assert.equal(explicit.toMs, Date.parse("2026-11-01T00:00:00.000Z"));
  });

  test("a bare --to date includes the whole end day (exclusive next midnight)", () => {
    const window = windowFromArgs(["--from", "2026-10-31", "--to", "2026-10-31"]);
    assert.equal(window.fromMs, Date.parse("2026-10-31T00:00:00.000Z"));
    assert.equal(window.toMs, Date.parse("2026-11-01T00:00:00.000Z"));
  });

  test("ISO instants are taken verbatim as an exclusive end", () => {
    const window = windowFromArgs([
      "--from", "2026-10-31T06:00:00.000Z",
      "--to", "2026-10-31T12:00:00.000Z",
    ]);
    assert.equal(window.fromMs, Date.parse("2026-10-31T06:00:00.000Z"));
    assert.equal(window.toMs, Date.parse("2026-10-31T12:00:00.000Z"));
  });

  test("widens cannot exceed the server's 366-day ceiling", () => {
    const window = windowFromArgs(["--from", "2020-01-01", "--to", "2026-10-31"]);
    assert.equal(window.clamped, true);
    assert.equal(window.fromMs, window.toMs - 366 * 24 * HOUR_MS);
  });

  test("invalid windows fail as usage errors", () => {
    assert.throws(() => windowFromArgs(["--from", "2026-11-02"]), (error) => isUsageError(error));
    assert.throws(() => windowFromArgs(["--from", "not-a-date"]), (error) => isUsageError(error));
    assert.throws(() => windowFromArgs(["--days", "0"]), (error) => isUsageError(error));
    assert.throws(() => windowFromArgs(["--days", "400"]), (error) => isUsageError(error));
  });
});

describe("local baseline", () => {
  const fromMs = Date.parse("2026-10-25T00:00:00.000Z");
  const toMs = Date.parse("2026-11-01T00:00:00.000Z");

  test("keeps the LAST row per key and drops control/malformed/out-of-window rows", async () => {
    const queuePath = writeQueue([
      bucket(),
      { kind: "account_session_state", source: "trae-cn", session_id: "s-1", bucket_start: "2026-10-31T14:00:00.000Z" },
      "not json at all",
      bucket({ total_tokens: 150, output_tokens: 50 }),
      bucket({ hour_start: "2026-10-01T00:00:00.000Z" }),
      bucket({ hour_start: "2026-10-31T15:00:00.000Z", source: "cursor", model: "default", total_tokens: 30 }),
    ]);

    const rows = await readLocalBaseline({ queuePath, fromMs, toMs });
    assert.equal(rows.size, 2, "one key per (hour, source, model) inside the window");
    const claude = [...rows.values()].find((row) => row.source === "claude");
    assert.equal(claude.total_tokens, 150, "the later line wins");
    assert.equal(claude.output_tokens, 50);
    const cursor = [...rows.values()].find((row) => row.source === "cursor");
    assert.equal(cursor.total_tokens, 30);
  });

  test("applies the same read-time repairs as the upload path", async () => {
    // Legacy inclusive Codex row: input already contains cached reads.
    const queuePath = writeQueue([
      bucket({
        source: "codex",
        model: "gpt-5",
        input_tokens: 300,
        cached_input_tokens: 200,
        output_tokens: 100,
        total_tokens: 400,
      }),
      // Legacy Cursor row whose billable was dropped to 0.
      bucket({
        hour_start: "2026-10-31T15:00:00.000Z",
        source: "cursor",
        model: "default",
        total_tokens: 40,
        billable_total_tokens: 0,
      }),
    ]);

    const rows = await readLocalBaseline({ queuePath, fromMs, toMs });
    const codex = [...rows.values()].find((row) => row.source === "codex");
    assert.equal(codex.input_tokens, 100, "cached reads are stripped from input");
    const cursor = [...rows.values()].find((row) => row.source === "cursor");
    assert.equal(cursor.billable_total_tokens, 40);
  });

  test("aliases the queue's conversation_count to the cloud's conversations column", async () => {
    // Real parsers write `conversation_count`; the hourly table stores it as
    // `conversations` (docs/cli-contract.md §2.4). Comparing raw field names
    // would report every such row as 0-vs-N drift.
    const queuePath = writeQueue([bucket({ conversation_count: 7 })]);
    const rows = await readLocalBaseline({ queuePath, fromMs, toMs });
    const localRow = [...rows.values()][0];
    assert.equal(localRow.conversation_count, 7, "the baseline keeps the queued wire shape");

    const mapKey = JSON.stringify([localRow.hour_start, localRow.source, localRow.model]);
    const matched = compareBuckets({
      local: new Map([[mapKey, localRow]]),
      server: new Map([[mapKey, serverRow(localRow)]]),
    });
    assert.equal(matched.counts.mismatch, 0, "the alias is compared, not the raw field name");

    const drifted = compareBuckets({
      local: new Map([[mapKey, localRow]]),
      server: new Map([[mapKey, serverRow(localRow, { conversations: 9 })]]),
    });
    assert.deepEqual(drifted.mismatch[0].fields, ["conversations"]);
    assert.equal(drifted.mismatch[0].server.conversations, 9);
  });

  test("a missing queue.jsonl is an empty baseline", async () => {
    const rows = await readLocalBaseline({
      queuePath: path.join(sandbox.trackerDir, "queue.jsonl"),
      fromMs,
      toMs,
    });
    assert.equal(rows.size, 0);
  });

  test("readPendingBuckets returns only the rows past the upload offset", async () => {
    const first = bucket({ hour_start: "2026-10-31T13:00:00.000Z" });
    const second = bucket({ hour_start: "2026-10-31T14:00:00.000Z", total_tokens: 150, output_tokens: 50 });
    const queuePath = writeQueue([first, second], { uploadedThrough: 1 });
    const offset = Buffer.byteLength(`${JSON.stringify(first)}\n`, "utf8");

    const pending = await readPendingBuckets({ queuePath, offset, fromMs, toMs });
    assert.equal(pending.size, 1, "the uploaded row is not pending");
    assert.equal([...pending.values()][0].total_tokens, 150);
    assert.equal([...pending.values()][0].hour_start, "2026-10-31T14:00:00.000Z");

    const uploadedAll = await readPendingBuckets({
      queuePath: writeQueue([first, second]),
      offset: Buffer.byteLength(`${JSON.stringify(first)}\n${JSON.stringify(second)}\n`, "utf8"),
      fromMs,
      toMs,
    });
    assert.equal(uploadedAll.size, 0, "a fully uploaded queue has nothing pending");
  });
});

describe("drift classification", () => {
  const key = (row) => JSON.stringify([row.hour_start, row.source, row.model]);

  test("classifies missing_on_server, server_only and mismatched keys", () => {
    const localA = bucket({ hour_start: "2026-10-31T14:00:00.000Z", total_tokens: 150, output_tokens: 50 });
    const localB = bucket({ hour_start: "2026-10-31T15:00:00.000Z", source: "cursor", model: "default", total_tokens: 30 });
    const serverC = bucket({ hour_start: "2026-10-31T16:00:00.000Z", source: "grok", model: "grok-build", total_tokens: 10 });

    const local = new Map([
      [key(localA), localA],
      [key(localB), localB],
    ]);
    const server = new Map([
      [key(serverRow(localB)), serverRow(localB)],
      [key(serverC), serverRow(serverC)],
      [key(serverRow(localA, { total_tokens: 120, output_tokens: 20 })), serverRow(localA, { total_tokens: 120, output_tokens: 20 })],
    ]);

    const result = compareBuckets({ local, server });
    assert.deepEqual(result.counts, { missing_on_server: 0, server_only: 1, mismatch: 1, pending: 0 });
    assert.equal(result.drifted, 2);
    assert.deepEqual(result.server_only.map((row) => row.source), ["grok"]);
    const mismatch = result.mismatch[0];
    assert.deepEqual(mismatch.fields, ["output_tokens", "total_tokens"]);
    assert.equal(mismatch.local.total_tokens, 150);
    assert.equal(mismatch.server.total_tokens, 120);
  });

  test("billable null and 0 are different values; credits compare at 6dp", () => {
    const localRow = bucket({ billable_total_tokens: null });
    const stored = serverRow(localRow, { billable_total_tokens: 0, credits: 1.000001 });

    const result = compareBuckets({
      local: new Map([[key(localRow), localRow]]),
      server: new Map([[key(stored), stored]]),
    });
    assert.deepEqual(result.mismatch[0].fields, ["billable_total_tokens", "credits"]);

    localRow.credits = 1;
    const rounded = serverRow(localRow, { credits: 1 });
    assert.deepEqual(
      compareBuckets({
        local: new Map([[key(localRow), localRow]]),
        server: new Map([[key(rounded), rounded]]),
      }).counts,
      { missing_on_server: 0, server_only: 0, mismatch: 0, pending: 0 },
    );
  });

  test("a key past the upload offset is pending instead of missing or mismatched", () => {
    const localRow = bucket();
    const older = serverRow(localRow, { total_tokens: 110, output_tokens: 10 });

    const result = compareBuckets({
      local: new Map([[key(localRow), localRow]]),
      server: new Map([[key(older), older]]),
      pending: new Set([key(localRow)]),
    });
    assert.deepEqual(result.counts, { missing_on_server: 0, server_only: 0, mismatch: 0, pending: 1 });
    assert.equal(result.drifted, 0, "an unuploaded key cannot be drift: the cloud never saw it");
    assert.equal(result.pending[0].local.total_tokens, 120);
    assert.equal(result.pending[0].server.total_tokens, 110);

    const neverSent = compareBuckets({
      local: new Map([[key(localRow), localRow]]),
      server: new Map(),
      pending: new Set([key(localRow)]),
    });
    assert.equal(neverSent.counts.missing_on_server, 0, "a pending key with no cloud row is still pending");
    assert.equal(neverSent.pending[0].server, null);
  });
});

describe("cmdReconcile", () => {
  test("reports OK and leaves the exit code untouched when everything matches", async () => {
    const row = bucket();
    writeQueue([row]);
    const { fetchImpl, calls } = fakeServer([serverRow(row)]);

    const out = collect();
    const summary = await run(["--json"], { fetchImpl, output: out.write });
    assert.equal(summary.status, "ok");
    assert.equal(summary.drifted, 0);
    assert.equal(summary.local_buckets, 1);
    assert.equal(summary.cloud_buckets, 1);
    assert.ok(process.exitCode !== 1, "OK must not set a failing exit code");

    const parsed = JSON.parse(out.text());
    assert.equal(parsed.status, "ok");
    assert.equal(parsed.device_id, "dev-1");
    const request = calls[0];
    assert.equal(request.url.pathname, "/api/functions/token-usage-reconcile");
    assert.equal(request.url.searchParams.get("from"), "2026-10-25T00:00:00.000Z");
    assert.equal(request.url.searchParams.get("to"), "2026-11-01T00:00:00.000Z");
    assert.equal(request.url.searchParams.get("limit"), "1000");
    assert.equal(request.init.method, "GET");
    assert.equal(request.init.headers.Authorization, `Bearer ${FAKE_DEVICE_TOKEN}`);
  });

  test("reports every last-wins row that never reached the cloud and exits 1", async () => {
    writeQueue([bucket(), bucket({ total_tokens: 150, output_tokens: 50 })]);
    const { fetchImpl } = fakeServer([]);

    const out = collect();
    const summary = await run(["--json"], { fetchImpl, output: out.write });
    assert.equal(summary.status, "drift");
    assert.equal(summary.counts.missing_on_server, 1);
    assert.equal(summary.drift.missing_on_server[0].local.total_tokens, 150);
    assert.equal(process.exitCode, 1);
  });

  test("a queue tail past the upload offset is pending, not drift", async () => {
    const uploaded = bucket({ hour_start: "2026-10-31T13:00:00.000Z" });
    const queued = bucket({ hour_start: "2026-10-31T14:00:00.000Z", total_tokens: 150, output_tokens: 50 });
    writeQueue([uploaded, queued], { uploadedThrough: 1 });
    const { fetchImpl } = fakeServer([serverRow(uploaded)]);

    const out = collect();
    const summary = await run([], { fetchImpl, output: out.write });
    assert.equal(summary.status, "ok", "unuploaded rows must not read as drift");
    assert.equal(summary.drifted, 0);
    assert.equal(summary.counts.pending, 1);
    assert.equal(summary.pending[0].local.total_tokens, 150);
    assert.equal(summary.upload_offset, Buffer.byteLength(`${JSON.stringify(uploaded)}\n`, "utf8"));
    assert.ok(process.exitCode !== 1, "pending rows must not fail the gate");
    assert.match(out.text(), /pending upload/i);
    assert.match(out.text(), /tokenusage sync/);
  });

  test("a missing queue.state.json treats every bucket as pending", async () => {
    writeQueue([bucket()]);
    dropUploadState();
    const { fetchImpl } = fakeServer([serverRow(bucket())]);

    const summary = await run(["--json"], { fetchImpl, output: () => {} });
    assert.equal(summary.status, "ok");
    assert.equal(summary.upload_offset, 0, "no offset means nothing is known to be uploaded");
    assert.equal(summary.counts.pending, 1);
    assert.ok(process.exitCode !== 1);
  });

  test("drift still fails the gate while pending rows are reported alongside", async () => {
    const uploaded = bucket({ hour_start: "2026-10-31T13:00:00.000Z" });
    const staleUpload = bucket({ hour_start: "2026-10-31T14:00:00.000Z", total_tokens: 150, output_tokens: 50 });
    writeQueue([uploaded, staleUpload]);
    const { fetchImpl } = fakeServer([serverRow(uploaded, { total_tokens: 999 })]);
    // The stale row is already uploaded, so it is real drift, not pending.
    const out = collect();
    const summary = await run([], { fetchImpl, output: out.write });
    assert.equal(summary.status, "drift");
    assert.equal(summary.counts.mismatch, 1);
    assert.equal(summary.counts.pending, 0);
    assert.equal(process.exitCode, 1);
  });

  test("pages until the last short page and merges rows for comparison", async () => {
    const rows = [
      bucket({ hour_start: "2026-10-31T10:00:00.000Z" }),
      bucket({ hour_start: "2026-10-31T11:00:00.000Z" }),
      bucket({ hour_start: "2026-10-31T12:00:00.000Z" }),
    ];
    writeQueue(rows);
    const { fetchImpl, calls } = fakeServer(rows.map((row) => serverRow(row)));

    const summary = await run(["--limit", "2"], { fetchImpl, output: () => {} });
    assert.equal(summary.pages, 2);
    assert.equal(summary.cloud_buckets, 3);
    assert.equal(summary.drifted, 0);
    assert.equal(calls.length, 2, "one page per request, stopped on the short page");
    assert.equal(calls[1].url.searchParams.get("offset"), "2");
  });

  test("human output lists drift sections", async () => {
    writeQueue([bucket()]);
    const { fetchImpl } = fakeServer([
      serverRow(bucket({ hour_start: "2026-10-31T16:00:00.000Z", source: "grok", model: "grok-build" })),
    ]);

    const out = collect();
    const summary = await run([], { fetchImpl, output: out.write });
    assert.match(out.text(), /missing_on_server/);
    assert.match(out.text(), /server_only/);
    assert.match(out.text(), /never writes/);
    assert.equal(process.exitCode, 1);
    assert.equal(summary.status, "drift");
  });

  test("a rejected token maps to a device-login hint, not a stack trace", async () => {
    writeQueue([bucket()]);
    const { fetchImpl } = fakeServer([], { status: 401 });

    await assert.rejects(run([], { fetchImpl }), (error) => {
      assert.ok(isUsageError(error));
      assert.equal(error.code, "CLOUD_DEVICE_TOKEN_REJECTED");
      assert.match(error.hint, /device-login/);
      return true;
    });
  });

  test("a revoked device fails with the dedicated code", async () => {
    writeQueue([bucket()]);
    const { fetchImpl } = fakeServer([], { status: 403 });

    await assert.rejects(run([], { fetchImpl }), (error) => {
      assert.equal(error.code, "CLOUD_DEVICE_REVOKED");
      assert.match(error.hint, /device-login/);
      return true;
    });
  });

  test("an unpaired machine refuses before touching the queue or the network", async () => {
    delete process.env.TOKENUSAGE_DEVICE_TOKEN;
    const { fetchImpl, calls } = fakeServer([]);

    await assert.rejects(run([], { fetchImpl }), (error) => {
      assert.equal(error.code, "NO_DEVICE_TOKEN");
      assert.match(error.hint, /device-login/);
      return true;
    });
    assert.equal(calls.length, 0);
  });
});
