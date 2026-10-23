#!/usr/bin/env node
"use strict";

/**
 * M1 / post-deploy acceptance run against a LIVE Token Usage deployment.
 *
 * Exercises the whole contract surface end to end on the real Supabase
 * project, then reconciles a collector queue against the account aggregation
 * (the reconciliation baseline: queue.jsonl last-wins total == table
 * aggregation). Everything it creates is tagged `accept-m1` and removed at
 * the end (pass --keep to inspect instead).
 *
 *   node scripts/selfhost/accept-m1.cjs --base-url http://127.0.0.1:3000/api
 *   node scripts/selfhost/accept-m1.cjs --base-url ... --queue <path>
 *   node scripts/selfhost/accept-m1.cjs --cleanup-only
 *
 * Environment (new Supabase key system, legacy names accepted):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * via env or --env-file (defaults to apps/web/.env.local, then repo root).
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { parseQueue } = require("./seed-queue.cjs");

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

function loadEnv() {
  const webEnv = path.join(path.resolve(__dirname, "..", "..", "apps", "web"), ".env.local");
  const rootEnv = path.join(path.resolve(__dirname, "..", ".."), ".env.local");
  const envFile = readArg("--env-file") || (fs.existsSync(webEnv) ? webEnv : rootEnv);
  if (fs.existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnvFile(fs.readFileSync(envFile, "utf8")))) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !secret) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (legacy names accepted) via env or --env-file");
  }
  return { url, secret };
}

const STAMP = `accept-m1-${Date.now()}`;
const TAG = "accept-m1";

const TOKEN_KEYS = ["input_tokens", "cached_input_tokens", "cache_creation_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens"];

const failures = [];
const check = (ok, message) => {
  const mark = ok ? "PASS" : "FAIL";
  console.log(`  [${mark}] ${message}`);
  if (!ok) failures.push(message);
  return ok;
};

async function rest(url, secret, method, tablePath, body, prefer) {
  const response = await fetch(`${url}/rest/v1/${tablePath}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(prefer ? { Prefer: prefer } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: response.status, data };
}

async function api(base, slug, { method = "GET", body, token, query = "" } = {}) {
  const response = await fetch(`${base}/functions/token-usage-${slug}${query}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: response.status, data };
}

const sum = (rows) => rows.reduce((acc, r) => acc + (Number(r.total_tokens) || 0), 0);

function bucket(over) {
  return {
    hour_start: "2026-10-21T00:00:00.000Z",
    source: "codex",
    model: "accept-m1-unpriced-model",
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    conversation_count: 1,
    ...over,
  };
}

async function pairDevice(base, url, secret, userId, machineId, clientInfo) {
  const authorized = await api(base, "device-flow-authorize", { method: "POST", body: { client_info: clientInfo, machine_id: machineId } });
  check(authorized.status === 200, `authorize (${machineId}) -> 200`);
  const { device_code: deviceCode, user_code: userCode } = authorized.data || {};
  if (!deviceCode) throw new Error("authorize did not return device_code");

  const approved = await rest(url, secret, "PATCH",
    `token_device_codes?user_code=eq.${encodeURIComponent(userCode)}&status=eq.pending`,
    { status: "approved", user_id: userId, approved_at: new Date().toISOString() },
    "return=representation");
  check(approved.status === 200 && Array.isArray(approved.data) && approved.data.length === 1, `operator approve ${userCode}`);

  const poll = await api(base, "device-flow-poll", { method: "POST", body: { device_code: deviceCode } });
  check(poll.status === 200 && poll.data?.status === "approved", `poll (${machineId}) issues a device token`);
  return { token: poll.data?.device_token, deviceId: poll.data?.device_id };
}

async function cleanup(url, secret, deviceIds, userId) {
  for (const deviceId of deviceIds) {
    if (!deviceId) continue;
    await rest(url, secret, "DELETE", `token_usage_hourly?device_id=eq.${deviceId}`);
    await rest(url, secret, "DELETE", `token_device_tokens?device_id=eq.${deviceId}`);
    await rest(url, secret, "DELETE", `token_devices?id=eq.${deviceId}`);
  }
  await rest(url, secret, "DELETE", `token_device_codes?user_id=eq.${userId}`);
  await rest(url, secret, "DELETE", `token_account_session_states?user_id=eq.${userId}`);
  if (userId) {
    const response = await fetch(`${url}/auth/v1/admin/users/${userId}`, {
      method: "DELETE",
      headers: { apikey: secret, Authorization: `Bearer ${secret}` },
    });
    if (!response.ok && response.status !== 404) {
      console.log(`  [warn] delete test user ${userId}: HTTP ${response.status}`);
    }
  }
}

async function main() {
  const { url, secret } = loadEnv();
  const base = (readArg("--base-url") || process.env.TOKEN_USAGE_BASE_URL || "http://127.0.0.1:3000/api").replace(/\/$/, "");
  const keep = hasFlag("--keep");
  const cleanupOnly = hasFlag("--cleanup-only");
  const queuePath = readArg("--queue") || path.join(process.env.HOME || "", ".tokentracker", "tracker", "queue.jsonl");
  console.log(`Backend: ${base}`);
  console.log(`Project: ${url}`);
  console.log(`Tag: ${TAG} (stamp ${STAMP})\n`);

  // ---- 0. leftover cleanup from an interrupted run --------------------
  // Orphaned test users (a run may abort after admin-create but before any
  // device exists) plus leftover accept-m1 devices.
  const adminList = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: "application/json" },
  }).then((r) => r.json()).catch(() => null);
  for (const user of adminList?.users || []) {
    if (String(user.email || "").startsWith(TAG)) {
      console.log(`Cleaning leftover test user ${user.email}...`);
      await cleanup(url, secret, [], user.id);
    }
  }
  const stale = await rest(url, secret, "GET",
    `token_devices?select=id&machine_id=like.accept-m1-*&limit=50`);
  if (Array.isArray(stale.data) && stale.data.length > 0) {
    console.log(`Cleaning ${stale.data.length} leftover accept-m1 device(s)...`);
    for (const device of stale.data) {
      const owner = await rest(url, secret, "GET", `token_devices?select=user_id&id=eq.${device.id}`);
      await cleanup(url, secret, [device.id], owner.data?.[0]?.user_id);
    }
  }
  if (cleanupOnly) {
    console.log("Cleanup-only run complete.");
    process.exitCode = failures.length === 0 ? 0 : 1;
    return;
  }

  // ---- 1. connectivity ------------------------------------------------
  console.log("[0] connectivity");
  const config = await api(base, "public-config");
  check(config.status === 200, "public-config -> 200");
  check(config.data?.supabase_url === url, "public-config reports the configured project URL");
  check(String(config.data?.supabase_anon_key || "").startsWith("sb_publishable_")
    || config.data?.supabase_anon_key === "legacy-anon-placeholder"
    || String(config.data?.supabase_anon_key || "").length > 20,
    "public-config carries a publishable-class key under the frozen field");

  // ---- 2. test user via the Auth admin API ----------------------------
  console.log("\n[1] test user (Auth admin API)");
  const email = `${TAG}+${STAMP}@example.test`;
  const password = `${TAG}-${STAMP}-password`;
  const createUser = await fetch(`${url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createdUser = await createUser.json().catch(() => ({}));
  const userId = createdUser?.id;
  check(createUser.status === 200 && Boolean(userId), `admin create user ${email}`);
  if (!userId) throw new Error("could not create the test user — aborting before any usage write");

  // ---- 3. device flow + ingest on three synthetic devices -------------
  console.log("\n[2] device flow x3 + ingest");
  const deviceA = await pairDevice(base, url, secret, userId, `${STAMP}-a`, "tokentracker accept-m1 PC-A");
  const deviceB = await pairDevice(base, url, secret, userId, `${STAMP}-b`, "tokentracker accept-m1 PC-B");
  const deviceC = await pairDevice(base, url, secret, userId, `${STAMP}-c`, "tokentracker accept-m1 PC-C");

  const ingestA = await api(base, "ingest", {
    method: "POST",
    token: deviceA.token,
    body: {
      hourly: [
        bucket({ hour_start: "2026-10-21T00:00:00.000Z", source: "codex", total_tokens: 1000, input_tokens: 1000 }),
        bucket({ hour_start: "2026-10-21T02:00:00.000Z", source: "claude-code", total_tokens: 700, input_tokens: 700 }),
        bucket({ hour_start: "2026-10-21T03:00:00.000Z", source: "grok", model: "grok-code-fast-1", total_tokens: 2000, input_tokens: 2000, total_cost_usd: 0.5 }),
        // Two rows on the same bucket key: in-request dedup keeps the max.
        bucket({ hour_start: "2026-10-21T05:00:00.000Z", source: "cursor", model: "composer-1", total_tokens: 500, input_tokens: 500 }),
        bucket({ hour_start: "2026-10-21T05:00:00.000Z", source: "cursor", model: "composer-1", total_tokens: 900, input_tokens: 900 }),
      ],
    },
  });
  check(ingestA.status === 200 && ingestA.data?.inserted === 4, `ingest A dedupes in-request (inserted=4, got ${ingestA.data?.inserted})`);
  check(ingestA.data?.upload_scope === "private", "ingest reports upload_scope=private");

  const ingestB = await api(base, "ingest", {
    method: "POST",
    token: deviceB.token,
    body: {
      hourly: [
        // Same cursor bucket key as device A: account-level, must dedupe away.
        bucket({ hour_start: "2026-10-21T05:00:00.000Z", source: "cursor", model: "composer-1", total_tokens: 900, input_tokens: 900 }),
        // trae-cn hourly rows never enter the aggregation (session states do).
        bucket({ hour_start: "2026-10-21T07:00:00.000Z", source: "trae-cn", total_tokens: 424242 }),
      ],
      account_session_states: [{
        source: "trae-cn",
        session_id: `${STAMP}-s1`,
        model: "accept-m1-unpriced-model",
        bucket_start: "2026-10-21T07:00:00.000Z",
        snapshot_verified_at: "2026-10-21T08:00:00.000Z",
        input_tokens: 300, cached_input_tokens: 100, cache_creation_input_tokens: 50,
        output_tokens: 150, reasoning_output_tokens: 10, total_tokens: 600,
      }],
    },
  });
  check(ingestB.status === 200 && ingestB.data?.inserted === 2, `ingest B upserts (inserted=2, got ${ingestB.data?.inserted})`);

  const ingestC = await api(base, "ingest", {
    method: "POST", token: deviceC.token,
    body: { hourly: [bucket({ hour_start: "2026-10-21T09:00:00.000Z", total_tokens: 11111, input_tokens: 11111 })] },
  });
  check(ingestC.status === 200, "ingest C (device slated for revocation)");

  // ---- 4. account aggregation semantics -------------------------------
  console.log("\n[3] account aggregation (cursor dedupe, trae-cn session, revoked device)");
  const summary = await api(base, "account-summary", { token: deviceA.token });
  check(summary.status === 200, "account-summary (device token) -> 200");
  const expectedCombined = (1000 + 700 + 2000) + 900 + 600;
  check(summary.data?.totals?.total_tokens === expectedCombined,
    `combined total == machine ${3700} + cursor(deduped) 900 + session 600 = ${expectedCombined} (got ${summary.data?.totals?.total_tokens})`);
  check(Number(summary.data?.totals?.total_cost_usd) === 0.501125,
    `read-time cost == grok 0.5 + cursor pricing 0.001125 (got ${summary.data?.totals?.total_cost_usd})`);

  const byDevice = await api(base, "account-devices", { token: deviceA.token, query: "?from=2026-10-21&to=2026-10-21&tz_offset_minutes=0" });
  const deviceRows = byDevice.data?.devices || [];
  check(deviceRows.length === 2, `revoked-free device list (got ${deviceRows.length}, expect 2 active)`);
  const deviceAView = deviceRows.find((d) => d.id === deviceA.deviceId);
  check(deviceAView?.total_tokens === 3700, `device-view A total == 3700 machine rows (got ${deviceAView?.total_tokens})`);
  const accountSources = byDevice.data?.account_sources || [];
  const cursorSource = accountSources.find((s) => s.source === "cursor");
  check(cursorSource?.total_tokens === 900, `cursor counted once across devices (got ${cursorSource?.total_tokens})`);

  const summaryA = await api(base, "account-summary", { token: deviceA.token, query: `?device_id=${deviceA.deviceId}` });
  check(summaryA.data?.totals?.total_tokens === 3700,
    `device_id filter drops account-level sources (got ${summaryA.data?.totals?.total_tokens}, expect 3700)`);

  // ---- 5. rename + revoke ---------------------------------------------
  console.log("\n[4] rename + revoke semantics");
  const renamed = await api(base, "device-rename", {
    method: "POST", token: deviceA.token,
    body: { device_id: deviceA.deviceId, device_name: `Accept M1 ${STAMP}` },
  });
  check(renamed.status === 200 && renamed.data?.previous_name?.includes("PC-A"), "rename own device (device token scoping)");
  const clash = await api(base, "device-rename", {
    method: "POST", token: deviceA.token,
    body: { device_id: deviceB.deviceId, device_name: `Accept M1 ${STAMP}` },
  });
  check(clash.status === 409, "rename to a sibling's active name -> 409 device_name_taken");

  const revoked = await api(base, "device-revoke", { method: "POST", token: deviceA.token, body: { device_id: deviceC.deviceId } });
  check(revoked.status === 200 && revoked.data?.already_revoked === false && revoked.data?.revoked_tokens === 1,
    `revoke C (revoked_tokens=${revoked.data?.revoked_tokens})`);
  const revokedAgain = await api(base, "device-revoke", { method: "POST", token: deviceA.token, body: { device_id: deviceC.deviceId } });
  check(revokedAgain.data?.already_revoked === true, "revoke is idempotent (already_revoked)");
  const revokedTokenUse = await api(base, "ingest", {
    method: "POST", token: deviceC.token,
    body: { hourly: [bucket({ hour_start: "2026-10-21T10:00:00.000Z", total_tokens: 5 })] },
  });
  check(revokedTokenUse.status === 401, "revoked device token fails auth immediately (401)");
  const summaryAfterRevoke = await api(base, "account-summary", { token: deviceA.token });
  check(summaryAfterRevoke.data?.totals?.total_tokens === expectedCombined,
    `revoked device's machine rows leave the aggregation (still ${expectedCombined})`);

  // ---- 6. queue reconciliation (the acceptance baseline) --------------
  console.log("\n[5] queue.jsonl reconciliation");
  if (!fs.existsSync(queuePath)) {
    check(false, `queue not found: ${queuePath} (pass --queue)`);
  } else {
    const parsed = parseQueue(fs.readFileSync(queuePath, "utf8"));
    const queueTotal = sum(parsed.buckets);
    const queueMachineTotal = sum(parsed.buckets.filter((b) => b.source !== "cursor" && b.source !== "trae-cn"));
    console.log(`  queue: ${parsed.buckets.length} buckets, last-wins total ${queueTotal.toLocaleString("en-US")} (machine-only ${queueMachineTotal.toLocaleString("en-US")})`);

    const deviceD = await pairDevice(base, url, secret, userId, `${STAMP}-d`, "tokentracker accept-m1 PC-D");
    const seed = spawnSync(process.execPath, [
      path.join(__dirname, "seed-queue.cjs"),
      "--queue", queuePath,
      "--user-id", userId,
      "--device-id", deviceD.deviceId,
    ], { env: { ...process.env }, encoding: "utf8" });
    check(seed.status === 0, `seed-queue writes the queue into device D (${(seed.stderr || "").trim().slice(0, 120)})`);

    // Reconciliation: device-filtered aggregation == queue machine last-wins.
    const seeded = await api(base, "account-summary", {
      token: deviceA.token,
      query: `?device_id=${deviceD.deviceId}&from=2020-01-01&to=2030-01-01`,
    });
    check(seeded.data?.totals?.total_tokens === queueMachineTotal,
      `device-filtered aggregation ${seeded.data?.totals?.total_tokens} == queue machine last-wins ${queueMachineTotal}`);

    // Reconciliation: combined == injected fixture + full queue last-wins
    // (single collector: cursor copies dedupe to one; no trae-cn in queue).
    const seededCombined = await api(base, "account-summary", {
      token: deviceA.token,
      query: "?from=2020-01-01&to=2030-01-01",
    });
    check(seededCombined.data?.totals?.total_tokens === expectedCombined + queueTotal,
      `combined ${seededCombined.data?.totals?.total_tokens} == fixture ${expectedCombined} + queue last-wins ${queueTotal}`);

    // Idempotency: seeding again must not move anything.
    const reseed = spawnSync(process.execPath, [
      path.join(__dirname, "seed-queue.cjs"),
      "--queue", queuePath,
      "--user-id", userId,
      "--device-id", deviceD.deviceId,
    ], { env: { ...process.env }, encoding: "utf8" });
    const rechecked = await api(base, "account-summary", {
      token: deviceA.token,
      query: `?device_id=${deviceD.deviceId}&from=2020-01-01&to=2030-01-01`,
    });
    check(reseed.status === 0 && rechecked.data?.totals?.total_tokens === queueMachineTotal,
      "re-seeding is idempotent (upsert, totals unchanged)");
  }

  // ---- 7. dashboard sanity --------------------------------------------
  console.log("\n[6] dashboard payload");
  const dash = await api(base, "dashboard", { token: deviceA.token, query: "?from=2026-10-21T00:00:00.000Z&to=2026-10-22T00:00:00.000Z" });
  check(dash.status === 200 && dash.data?.totals?.total_tokens === expectedCombined,
    `dashboard range total == ${expectedCombined}`);
  check(Array.isArray(dash.data?.daily) && dash.data.daily.length >= 1, "dashboard daily series present");
  check((dash.data?.models || []).length <= 24, "dashboard models capped at 24");

  // ---- 8. cleanup ------------------------------------------------------
  console.log("\n[7] cleanup");
  if (keep) {
    console.log("  --keep given: accept-m1 rows left in place.");
  } else {
    await cleanup(url, secret, [deviceA.deviceId, deviceB.deviceId, deviceC.deviceId, (deviceD?.deviceId)], userId);
    const after = await rest(url, secret, "GET", `token_devices?select=id&machine_id=like.accept-m1-*`);
    check(Array.isArray(after.data) && after.data.length === 0, "all accept-m1 devices/users removed");
  }

  console.log(`\n${failures.length === 0 ? "ALL ACCEPTANCE CHECKS PASSED" : `ACCEPTANCE FAILED (${failures.length})`}`);
  if (failures.length > 0) {
    for (const failure of failures) console.log(`  - ${failure}`);
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
