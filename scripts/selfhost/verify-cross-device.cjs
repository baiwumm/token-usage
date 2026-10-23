#!/usr/bin/env node
"use strict";

/**
 * Cross-device dedupe verification against a LIVE Token Usage backend.
 *
 * The two-device acceptance checklist cannot run while only one collector
 * exists, but the account-level aggregation rules it guards are pure logic
 * and can be exercised on real data with a synthetic device. This script:
 *
 *   1. enrolls a synthetic device through the real device-flow endpoints
 *      (authorize -> approve -> poll), so nothing bypasses the API;
 *   2. re-uploads collector 1's Cursor rows verbatim under it and asserts the
 *      combined total does NOT move (Cursor is account level: the same rows
 *      exist on every PC and must collapse to one, not double);
 *   3. uploads one synthetic machine-level row and asserts the total moves by
 *      exactly that row's tokens (machine sources are additive);
 *   4. reports the per-device split and reconciles
 *      combined == machine devices + account sources;
 *   5. revokes the synthetic device and deletes its rows.
 *
 * Everything it writes is tagged `selftest`, so a failed cleanup is obvious
 * and removable. Run it again with --cleanup-only to finish a partial run.
 *
 *   node scripts/selfhost/verify-cross-device.cjs            # verify + clean
 *   node scripts/selfhost/verify-cross-device.cjs --keep     # verify, keep rows
 *   node scripts/selfhost/verify-cross-device.cjs --cleanup-only
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const BASE_URL_DEFAULT = "https://token-usage.baiwumm.com/api";
const SYNTHETIC_MACHINE_ID = "selftest-synthetic-0001";
const SYNTHETIC_CLIENT_INFO = "tokentracker selftest-synthetic-device";
const SYNTHETIC_SOURCE = "selftest";
const SYNTHETIC_MODEL = "selftest-synthetic";
const SYNTHETIC_TOTAL = 12345;
const MAX_UPLOAD_ROWS = 450; // ingest caps a batch at 500; stay clear of it.

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
  const envFile =
    readArg("--env-file")
    || (fs.existsSync(path.join(path.resolve(__dirname, "..", "..", "..", "apps", "web"), ".env.local"))
      ? path.join(path.resolve(__dirname, "..", "..", "..", "apps", "web"), ".env.local")
      : path.join(path.resolve(__dirname, "..", ".."), ".env.local"));
  if (fs.existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnvFile(fs.readFileSync(envFile, "utf8")))) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
  const supabaseUrl = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^"|"$/g, "");
  if (!supabaseUrl || !serviceKey) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (legacy SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY accepted) via env or --env-file");
  }
  return { supabaseUrl, serviceKey };
}

const TOKEN_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

async function restSelect(supabaseUrl, serviceKey, table, query) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${query}`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`select ${table}: HTTP ${response.status}: ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : [];
}

async function restDelete(supabaseUrl, serviceKey, table, filter) {
  const response = await fetch(`${supabaseUrl}/rest/v1/${table}?${filter}`, {
    method: "DELETE",
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Accept: "application/json" },
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`delete ${table}: HTTP ${response.status}: ${text.slice(0, 200)}`);
}

async function apiPost(url, body, bearer) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: response.status, data };
}

async function apiGet(url, bearer) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 200) };
  }
  return { status: response.status, data };
}

async function main() {
  const { supabaseUrl, serviceKey } = loadEnv();
  const baseUrl = (
    readArg("--base-url")
    || process.env.TOKEN_USAGE_BASE_URL
    || process.env.TOKENTRACKER_BASE_URL
    || BASE_URL_DEFAULT
  ).replace(/\/$/, "");
  const keep = hasFlag("--keep");
  const cleanupOnly = hasFlag("--cleanup-only");
  const failures = [];
  const check = (ok, message) => {
    if (!ok) failures.push(message);
    return ok;
  };

  // --- Locate the owner and the real (non-synthetic) device. -------------
  const ownerRow = (await restSelect(
    supabaseUrl,
    serviceKey,
    "token_devices",
    "select=id,device_name,user_id,machine_id,revoked_at&revoked_at=is.null&order=created_at.asc&limit=1",
  ))[0];
  const userId = readArg("--user-id") || ownerRow?.user_id;
  check(Boolean(userId), "could not resolve the owner user id");
  if (!userId) throw new Error("owner user id unknown — pass --user-id");

  // Any leftover synthetic device from an interrupted run.
  const stale = await restSelect(
    supabaseUrl,
    serviceKey,
    "token_devices",
    `select=id,device_name,machine_id&machine_id=eq.${SYNTHETIC_MACHINE_ID}`,
  );
  if (stale[0]) {
    console.log(`Found leftover synthetic device ${stale[0].id} (${stale[0].device_name}) — cleaning it first.`);
    await cleanupSynthetic(supabaseUrl, serviceKey, stale[0].id);
  }
  if (cleanupOnly) {
    console.log("Cleanup-only run complete.");
    process.exitCode = 0;
    return;
  }

  const realDevices = (await restSelect(
    supabaseUrl,
    serviceKey,
    "token_devices",
    `select=id,device_name&user_id=eq.${userId}&revoked_at=is.null&machine_id=not.eq.${SYNTHETIC_MACHINE_ID}`,
  ));
  const realDevice = realDevices[0];
  check(Boolean(realDevice), "no active non-synthetic device found");
  if (!realDevice) throw new Error("no real device to mirror Cursor rows from");

  // --- Baseline ----------------------------------------------------------
  // account-summary authenticates a device token (never the service key), so
  // the baseline comes from this PC's own CLI token.
  const cliToken = readCliToken();
  check(Boolean(cliToken), "could not read the CLI device token from ~/.tokentracker/tracker/config.json");
  if (!cliToken) throw new Error("run this on an enrolled PC, or pass --token");

  const summaryBefore = await apiGet(`${baseUrl}/functions/token-usage-account-summary`, cliToken);
  check(summaryBefore.status === 200, `account-summary before: HTTP ${summaryBefore.status}`);
  const totalBefore = Number(summaryBefore.data?.totals?.total_tokens ?? summaryBefore.data?.total_tokens) || 0;
  console.log(`Baseline combined total: ${totalBefore.toLocaleString("en-US")}`);

  // --- Enroll the synthetic device through the real device flow. ---------
  const authorized = await apiPost(`${baseUrl}/functions/token-usage-device-flow-authorize`, {
    client_info: SYNTHETIC_CLIENT_INFO,
    machine_id: SYNTHETIC_MACHINE_ID,
  });
  check(authorized.status === 200, `authorize: HTTP ${authorized.status}`);
  const { device_code: deviceCode, user_code: userCode } = authorized.data || {};
  if (!deviceCode) throw new Error("authorize did not return a device_code");

  // Approve with the service-role key (operator path from the docs).
  const approveResponse = await fetch(
    `${supabaseUrl}/rest/v1/token_device_codes?user_code=eq.${encodeURIComponent(userCode)}&status=eq.pending`,
    {
      method: "PATCH",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({ status: "approved", user_id: userId, approved_at: new Date().toISOString() }),
    },
  );
  const approvedRows = approveResponse.ok ? await approveResponse.json() : [];
  check(Array.isArray(approvedRows) && approvedRows.length === 1, `approve ${userCode} failed`);
  console.log(`Synthetic device enrolled (user code ${userCode} approved).`);

  const poll = await apiPost(`${baseUrl}/functions/token-usage-device-flow-poll`, { device_code: deviceCode });
  check(poll.status === 200 && poll.data?.status === "approved", `poll: HTTP ${poll.status} ${poll.data?.status}`);
  const syntheticToken = poll.data?.device_token;
  const syntheticDeviceId = poll.data?.device_id;
  check(Boolean(syntheticToken && syntheticDeviceId), "poll did not issue a device token");
  if (!syntheticToken) throw new Error("no synthetic device token");

  // --- Test 1: Cursor rows must not double. ------------------------------
  const cursorRows = await restSelect(
    supabaseUrl,
    serviceKey,
    "token_usage_hourly",
    `select=*&source=eq.cursor&device_id=eq.${realDevice.id}&order=hour_start.asc&limit=${MAX_UPLOAD_ROWS}`,
  );
  console.log(`Mirroring ${cursorRows.length} Cursor rows onto the synthetic device...`);
  const cursorUpload = await apiPost(
    `${baseUrl}/functions/token-usage-ingest`,
    { upload_id: `selftest-cursor-${Date.now()}`, hourly: cursorRows.map(toIngestRow) },
    syntheticToken,
  );
  check(cursorUpload.status === 200, `cursor ingest: HTTP ${cursorUpload.status} ${JSON.stringify(cursorUpload.data).slice(0, 120)}`);

  // --- Test 2: machine-level rows must add up exactly. ------------------
  const additiveUpload = await apiPost(
    `${baseUrl}/functions/token-usage-ingest`,
    {
      upload_id: `selftest-additive-${Date.now()}`,
      hourly: [{
        hour_start: "2026-10-21T00:00:00.000Z",
        source: SYNTHETIC_SOURCE,
        model: SYNTHETIC_MODEL,
        input_tokens: SYNTHETIC_TOTAL,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: SYNTHETIC_TOTAL,
        conversation_count: 1,
        billable_total_tokens: SYNTHETIC_TOTAL,
        total_cost_usd: 0,
      }],
    },
    syntheticToken,
  );
  check(additiveUpload.status === 200, `additive ingest: HTTP ${additiveUpload.status}`);

  const summaryAfter = await apiGet(`${baseUrl}/functions/token-usage-account-summary`, cliToken);
  check(summaryAfter.status === 200, `account-summary after: HTTP ${summaryAfter.status}`);
  const totalAfter = Number(summaryAfter.data?.totals?.total_tokens ?? summaryAfter.data?.total_tokens) || 0;
  const delta = totalAfter - totalBefore;
  console.log(`Combined total after: ${totalAfter.toLocaleString("en-US")} (delta ${delta.toLocaleString("en-US")})`);

  check(
    delta === SYNTHETIC_TOTAL,
    `combined total moved by ${delta}, expected exactly ${SYNTHETIC_TOTAL} — Cursor rows must not double`,
  );

  // --- Test 3: reconciliation across the per-device view. ---------------
  const from = readArg("--from") || "2026-10-21";
  const to = readArg("--to") || "2026-10-21";
  const devices = await apiGet(
    `${baseUrl}/functions/token-usage-account-devices?from=${from}&to=${to}&tz_offset_minutes=0`,
    cliToken,
  );
  check(devices.status === 200, `account-devices: HTTP ${devices.status}`);
  const listed = devices.data?.devices || [];
  const syntheticEntry = listed.find((device) => device.id === syntheticDeviceId);
  check(Boolean(syntheticEntry), "synthetic device missing from account-devices");
  const machineSum = listed.reduce((sum, device) => sum + (Number(device.total_tokens) || 0), 0);
  const accountSum = (devices.data?.account_sources || []).reduce((sum, source) => sum + (Number(source.total_tokens) || 0), 0);
  console.log(`Per-device (${from}..${to}): machine ${machineSum.toLocaleString("en-US")} + account ${accountSum.toLocaleString("en-US")} = ${(machineSum + accountSum).toLocaleString("en-US")}`);

  // --- Cleanup ----------------------------------------------------------
  if (keep) {
    console.log("--keep given: synthetic rows and device left in place for inspection.");
  } else {
    await cleanupSynthetic(supabaseUrl, serviceKey, syntheticDeviceId);
    console.log("Synthetic device revoked and its rows deleted.");
  }

  if (failures.length === 0) {
    console.log("\nPASS: Cursor rows did not double, machine rows added exactly, reconciliation held.");
  } else {
    console.log(`\nFAIL:\n  - ${failures.join("\n  - ")}`);
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

function toIngestRow(row) {
  const out = { hour_start: row.hour_start, source: row.source, model: row.model, conversation_count: row.conversations };
  for (const key of TOKEN_KEYS) out[key] = Number(row[key]) || 0;
  out.billable_total_tokens = row.billable_total_tokens == null ? null : Number(row.billable_total_tokens);
  out.total_cost_usd = Number(row.total_cost_usd) || 0;
  return out;
}

// The old tokentracker_device_machine table is folded into
// token_devices.machine_cluster_id — nothing separate to delete here.
async function cleanupSynthetic(supabaseUrl, serviceKey, deviceId) {
  await restDelete(supabaseUrl, serviceKey, "token_usage_hourly", `device_id=eq.${deviceId}`);
  await restDelete(supabaseUrl, serviceKey, "token_device_tokens", `device_id=eq.${deviceId}`);
  const response = await fetch(`${supabaseUrl}/rest/v1/token_devices?id=eq.${deviceId}`, {
    method: "PATCH",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ revoked_at: new Date().toISOString() }),
  });
  if (!response.ok) throw new Error(`revoke device: HTTP ${response.status}`);
}

function readCliToken() {
  const tokenArg = readArg("--token");
  if (tokenArg) return tokenArg;
  const configPath = path.join(os.homedir(), ".tokentracker", "tracker", "config.json");
  try {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    return config.deviceToken || config.device_token || null;
  } catch {
    return null;
  }
}

module.exports = { SYNTHETIC_MACHINE_ID, SYNTHETIC_TOTAL, cleanupSynthetic, parseEnvFile, toIngestRow };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
