"use strict";

// Freebuff account-level usage: opt-in flag, credential probing (absent /
// malformed / non-keychain → null, never an error), the keychain read's
// failure-is-null contract, the fetch auth-retry path, and the day-series →
// bucket transform (exact rows, changed-day-only appends, absence never
// zeroes).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  isFreebuffUsageEnabled,
  resolveFreebuffCredentialsPath,
  readFreebuffCredentials,
  credReadTarget,
  readFreebuffKeychainToken,
  fetchFreebuffUsageSummary,
  fetchFreebuffUsageWithAuth,
  FREEBUFF_USAGE_ENV,
} = require("../src/lib/freebuff-config");
const {
  buildFreebuffDayRows,
  parseFreebuffUsageSummary,
  isFreebuffConfigured,
} = require("../src/lib/freebuff-usage");

let tmpDir;
let env;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-freebuff-"));
  env = { TOKENUSAGE_FREEBUFF_HOME: tmpDir };
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeCredentials(body) {
  fs.mkdirSync(path.join(tmpDir, ".config", "manicode"), { recursive: true });
  fs.writeFileSync(
    path.join(tmpDir, ".config", "manicode", "credentials.json"),
    typeof body === "string" ? body : JSON.stringify(body),
    "utf8",
  );
}

const VALID_CREDENTIALS = {
  default: {
    id: "00000000-0000-0000-0000-000000000001",
    name: "operator",
    email: "operator@example.com",
    fingerprintId: "fp-123",
    fingerprintHash: "ab".repeat(32),
    tokenStore: "keychain",
  },
};

const SAMPLE_SUMMARY = {
  timeZone: "Asia/Shanghai",
  todayDateKey: "2026-11-25",
  lifetime: {
    totalTokens: 1000,
    costUsd: 12.5,
    days: [
      { date: "2026-11-23", tokens: 300 },
      { date: "2026-11-24", tokens: 0 },
      { date: "2026-11-25", tokens: 700 },
    ],
  },
};

test("opt-in flag accepts only 1/true", () => {
  assert.equal(isFreebuffUsageEnabled({ [FREEBUFF_USAGE_ENV]: "1" }), true);
  assert.equal(isFreebuffUsageEnabled({ [FREEBUFF_USAGE_ENV]: "true" }), true);
  assert.equal(isFreebuffUsageEnabled({ [FREEBUFF_USAGE_ENV]: "0" }), false);
  assert.equal(isFreebuffUsageEnabled({ [FREEBUFF_USAGE_ENV]: "yes" }), false);
  assert.equal(isFreebuffUsageEnabled({}), false);
});

test("credentials probe: absent / malformed / non-keychain → null", () => {
  assert.equal(readFreebuffCredentials({ env, home: os.homedir() }), null);
  assert.equal(isFreebuffConfigured({ env, home: os.homedir() }), false);

  writeCredentials("{ not json");
  assert.equal(readFreebuffCredentials({ env, home: os.homedir() }), null);
  assert.equal(isFreebuffConfigured({ env, home: os.homedir() }), false);

  writeCredentials({ default: { ...VALID_CREDENTIALS.default, tokenStore: "plaintext" } });
  assert.equal(readFreebuffCredentials({ env, home: os.homedir() }), null);
  assert.equal(isFreebuffConfigured({ env, home: os.homedir() }), false);

  writeCredentials(VALID_CREDENTIALS);
  const credentials = readFreebuffCredentials({ env, home: os.homedir() });
  assert.equal(credentials.fingerprintId, "fp-123");
  assert.equal(
    credentials.credentialsPath,
    resolveFreebuffCredentialsPath({ env, home: os.homedir() }),
  );
  assert.equal(isFreebuffConfigured({ env, home: os.homedir() }), true);
});

test("keychain read maps every failure to null and decodes success", () => {
  const credentialsPath = path.join(tmpDir, "credentials.json");
  // Regression (2026-11-26): the generated script must target the FULL
  // Credential Manager name — keychain service + "/" + credentials path —
  // not the bare credentials path (that entry does not exist, and the read
  // silently degraded to "not configured").
  let scriptTarget = null;
  readFreebuffKeychainToken({
    credentialsPath,
    spawnImpl: (_cmd, args) => {
      const encoded = args[args.indexOf("-EncodedCommand") + 1];
      const script = Buffer.from(encoded, "base64").toString("utf16le");
      scriptTarget = script.match(/ReadBlob\('([^']*)'\)/)?.[1] || null;
      return { status: 0, stdout: Buffer.from("tok", "utf8").toString("base64") };
    },
  });
  assert.equal(scriptTarget, credReadTarget(credentialsPath));
  assert.ok(scriptTarget.startsWith("freebuff-cli/"));

  // Simulated exit-3 (entry absent) and a spawn throw both yield null.
  assert.equal(
    readFreebuffKeychainToken({
      credentialsPath,
      spawnImpl: () => ({ status: 3, stdout: "" }),
    }),
    null,
  );
  assert.equal(
    readFreebuffKeychainToken({
      credentialsPath,
      spawnImpl: () => {
        throw new Error("powershell missing");
      },
    }),
    null,
  );
  // Non-zero stdout payload (garbage / whitespace) is rejected.
  assert.equal(
    readFreebuffKeychainToken({
      credentialsPath,
      spawnImpl: () => ({ status: 0, stdout: "not base64 !!\nsecond line" }),
    }),
    null,
  );
  assert.equal(
    readFreebuffKeychainToken({
      credentialsPath,
      spawnImpl: () => ({
        status: 0,
        stdout: Buffer.from("opaque-token-value", "utf8").toString("base64"),
      }),
    }),
    "opaque-token-value",
  );
});

function fetchJson(status, body) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

test("usage fetch: auth failures carry status, bad shape fails closed", async () => {
  const unauthorized = new Error("rejected");
  unauthorized.status = 401;
  const status401 = fetchJson(401, { error: "Unauthorized" });
  const fetchImpl = async () => {
    const response = await status401();
    const error = new Error(`Freebuff usage request rejected (${response.status}).`);
    error.status = response.status;
    throw error;
  };
  await assert.rejects(
    fetchFreebuffUsageSummary({ token: "tok", fetchImpl }),
    (err) => err.status === 401,
  );

  await assert.rejects(
    fetchFreebuffUsageSummary({ token: "tok", fetchImpl: fetchJson(200, { nope: true }) }),
    /missing lifetime\.days/,
  );
  await assert.rejects(fetchFreebuffUsageSummary({ token: "", fetchImpl }), /not configured/);

  const summary = await fetchFreebuffUsageSummary({
    token: "tok",
    fetchImpl: fetchJson(200, SAMPLE_SUMMARY),
  });
  assert.equal(summary.lifetime.days.length, 3);
});

test("auth retry: single re-read after 401, second rejection propagates", async () => {
  writeCredentials(VALID_CREDENTIALS);
  let tokenSeen = null;
  let calls = 0;
  let reads = 0;
  const fetchImpl = async (_url, options) => {
    calls += 1;
    tokenSeen = options.headers.Authorization;
    if (calls === 1) {
      const error = new Error("rejected");
      error.status = 401;
      throw error;
    }
    return {
      ok: true,
      status: 200,
      json: async () => SAMPLE_SUMMARY,
    };
  };
  const summary = await fetchFreebuffUsageWithAuth({
    fetchImpl,
    env,
    home: os.homedir(),
    readCredentials: () => ({ credentialsPath: "C:\\creds.json", fingerprintId: "fp" }),
    readKeychainToken: () => {
      reads += 1;
      return reads === 1 ? "tok" : "rotated-C:\\creds.json";
    },
  });
  assert.equal(calls, 2);
  assert.equal(reads, 2);
  assert.equal(tokenSeen, "Bearer rotated-C:\\creds.json");
  assert.equal(summary.lifetime.days.length, 3);

  await assert.rejects(
    fetchFreebuffUsageWithAuth({
      fetchImpl: async () => {
        const error = new Error("rejected");
        error.status = 403;
        throw error;
      },
      env,
      home: os.homedir(),
      readCredentials: () => ({ credentialsPath: "x", fingerprintId: "fp" }),
      readKeychainToken: () => "tok",
    }),
    (err) => err.status === 403,
  );

  // No keychain entry at all → "not configured", the silent-skip signal.
  await assert.rejects(
    fetchFreebuffUsageWithAuth({
      fetchImpl,
      env,
      home: os.homedir(),
      readCredentials: () => null,
      readKeychainToken: () => null,
    }),
    /not configured/,
  );
});

test("day rows: exact golden transform", () => {
  const rows = buildFreebuffDayRows(SAMPLE_SUMMARY);
  assert.deepEqual(rows, [
    {
      source: "freebuff",
      model: "unknown",
      hour_start: "2026-11-23T00:00:00.000Z",
      input_tokens: 300,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 300,
      billable_total_tokens: 300,
      total_cost_usd: 0,
      conversation_count: 0,
    },
    {
      source: "freebuff",
      model: "unknown",
      hour_start: "2026-11-24T00:00:00.000Z",
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
      billable_total_tokens: 0,
      total_cost_usd: 0,
      conversation_count: 0,
    },
    {
      source: "freebuff",
      model: "unknown",
      hour_start: "2026-11-25T00:00:00.000Z",
      input_tokens: 700,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 700,
      billable_total_tokens: 700,
      total_cost_usd: 0,
      conversation_count: 0,
    },
  ]);
});

test("day rows: malformed input fails closed", () => {
  assert.throws(() => buildFreebuffDayRows({}), /missing lifetime\.days/);
  assert.throws(
    () => buildFreebuffDayRows({ lifetime: { days: [{ date: "2026-1-3", tokens: 5 }] } }),
    /malformed date/,
  );
  assert.throws(
    () => buildFreebuffDayRows({ lifetime: { days: [{ date: "2026-11-25", tokens: 1.5 }] } }),
    /malformed token total/,
  );
  assert.throws(
    () => buildFreebuffDayRows({ lifetime: { days: [{ date: "2026-11-25", tokens: -1 }] } }),
    /malformed token total/,
  );
  assert.throws(
    () =>
      buildFreebuffDayRows({
        lifetime: {
          days: [
            { date: "2026-11-25", tokens: 1 },
            { date: "2026-11-25", tokens: 2 },
          ],
        },
      }),
    /repeats day/,
  );
});

function readQueue(queuePath) {
  const raw = fs.readFileSync(queuePath, "utf8");
  return raw
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line));
}

test("parse: appends changed days only, absence never zeroes", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const cursors = {};

  // First run queues the whole series.
  const first = await parseFreebuffUsageSummary({ summary: SAMPLE_SUMMARY, cursors, queuePath });
  assert.equal(first.bucketsQueued, 3);
  assert.deepEqual(
    readQueue(queuePath).map((row) => [row.hour_start, row.total_tokens]),
    [
      ["2026-11-23T00:00:00.000Z", 300],
      ["2026-11-24T00:00:00.000Z", 0],
      ["2026-11-25T00:00:00.000Z", 700],
    ],
  );

  // Identical re-fetch is a no-op.
  const second = await parseFreebuffUsageSummary({ summary: SAMPLE_SUMMARY, cursors, queuePath });
  assert.equal(second.bucketsQueued, 0);
  assert.equal(readQueue(queuePath).length, 3);

  // One day grows mid-session; unchanged days are not re-queued.
  const grown = {
    lifetime: {
      days: [
        { date: "2026-11-23", tokens: 300 },
        { date: "2026-11-24", tokens: 40 },
        { date: "2026-11-25", tokens: 950 },
      ],
    },
  };
  const third = await parseFreebuffUsageSummary({ summary: grown, cursors, queuePath });
  assert.equal(third.bucketsQueued, 2);
  assert.equal(readQueue(queuePath).length, 5);
  assert.deepEqual(
    readQueue(queuePath).slice(3).map((row) => [row.hour_start, row.total_tokens]),
    [
      ["2026-11-24T00:00:00.000Z", 40],
      ["2026-11-25T00:00:00.000Z", 950],
    ],
  );

  // The rolling window drops 11-23: no zero row is emitted for it, and its
  // state entry ages out (a stale-day re-appearance is impossible).
  const windowMoved = {
    lifetime: {
      days: [
        { date: "2026-11-24", tokens: 40 },
        { date: "2026-11-25", tokens: 950 },
      ],
    },
  };
  const fourth = await parseFreebuffUsageSummary({ summary: windowMoved, cursors, queuePath });
  assert.equal(fourth.bucketsQueued, 0);
  assert.equal(readQueue(queuePath).length, 5);
  assert.deepEqual(Object.keys(cursors.freebuff.days).sort(), ["2026-11-24", "2026-11-25"]);
});
