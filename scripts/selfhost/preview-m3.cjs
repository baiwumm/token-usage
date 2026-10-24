#!/usr/bin/env node
"use strict";

/**
 * M3 dashboard preview seeder (operator review data, tag `m3-preview-`).
 *
 * Pairs two preview devices on the OPERATOR account and ingests ~30 days of
 * realistic usage (codex/claude-code/cursor/trae-cn mix, priced + unpriced
 * models) so the dashboard at / has charts to show. Preview data is KEPT for
 * the operator's visual acceptance; cleanup: pass --cleanup.
 *
 *   node scripts/selfhost/preview-m3.cjs            # seed + reconcile
 *   node scripts/selfhost/preview-m3.cjs --cleanup  # remove everything tagged m3-preview-
 *
 * Environment: apps/web/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
 * Base URL defaults to http://127.0.0.1:3000/api (--base-url overrides).
 */

const fs = require("node:fs");
const path = require("node:path");

const TAG = "m3-preview";
const OPERATOR_EMAIL = "me@baiwumm.com";

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

function loadEnv() {
  const envFile = path.join(path.resolve(__dirname, "..", "..", "apps", "web"), ".env.local");
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq > 0 && !process.env[t.slice(0, eq).trim()]) {
      process.env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
    }
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").replace(/\/$/, "");
  const secret = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "");
  if (!url || !secret) throw new Error("missing Supabase env");
  return { url, secret };
}

async function rest(url, secret, method, tablePath, body, prefer) {
  const r = await fetch(`${url}/rest/v1/${tablePath}`, {
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
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
  return { status: r.status, data };
}

async function api(base, slug, { method = "GET", body, token, query = "" } = {}) {
  const r = await fetch(`${base}/functions/token-usage-${slug}${query}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 200) }; }
  return { status: r.status, data };
}

function bucket(hourStart, over) {
  return {
    hour_start: hourStart,
    source: "codex",
    model: "grok-code-fast-1",
    input_tokens: 0, cached_input_tokens: 0, cache_creation_input_tokens: 0,
    output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0,
    billable_total_tokens: null,
    conversation_count: 1,
    total_cost_usd: 0,
    ...over,
  };
}

// Deterministic pseudo-random so re-runs stay comparable.
function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

function buildBuckets(days, deviceIdTag, rng) {
  const hourly = [];
  const sessionStates = [];
  const now = new Date();
  const todayUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  for (let dayOffset = days - 1; dayOffset >= 0; dayOffset--) {
    const dayMs = todayUtc - dayOffset * 86_400_000;
    const day = new Date(dayMs).toISOString().slice(0, 10);
    const weekend = [0, 6].includes(new Date(dayMs).getUTCDay());
    const sessions = weekend ? 2 : 4 + Math.floor(rng() * 3);

    for (let i = 0; i < sessions; i++) {
      const hour = 9 + Math.floor(rng() * 10);
      const hourStart = `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
      const sourceRoll = rng();

      if (sourceRoll < 0.15) {
        // Account-level cursor on BOTH devices (same bucket key) — the dedupe
        // exercise; priced via the LiteLLM snapshot.
        hourly.push(bucket(hourStart, {
          source: "cursor", model: "composer-1",
          input_tokens: 8000 + Math.floor(rng() * 6000), output_tokens: 1200 + Math.floor(rng() * 900),
          total_tokens: 0, // fixed below
          total_cost_usd: 0,
        }));
      } else if (sourceRoll < 0.35) {
        hourly.push(bucket(hourStart, {
          source: "claude-code", model: "test-unpriced-model",
          input_tokens: 5000 + Math.floor(rng() * 9000), cached_input_tokens: 3000 + Math.floor(rng() * 4000),
          output_tokens: 800 + Math.floor(rng() * 1600),
        }));
      } else {
        // grok reports its own cost (provider-authoritative).
        const inTok = 4000 + Math.floor(rng() * 12000);
        const outTok = 500 + Math.floor(rng() * 2200);
        hourly.push(bucket(hourStart, {
          source: "codex", model: "grok-code-fast-1",
          input_tokens: inTok, output_tokens: outTok,
          total_cost_usd: Number((inTok * 0.000002 + outTok * 0.000008).toFixed(6)),
        }));
      }
    }

    // trae-cn session state every other day (account-level via sessions).
    if (dayOffset % 2 === 0) {
      const input = 2000 + Math.floor(rng() * 3000);
      const cached = 400 + Math.floor(rng() * 900);
      const creation = 100 + Math.floor(rng() * 250);
      const output = 600 + Math.floor(rng() * 1400);
      sessionStates.push({
        source: "trae-cn",
        session_id: `${TAG}-${deviceIdTag}-${day}`,
        model: "test-unpriced-model",
        bucket_start: `${day}T21:00:00.000Z`,
        snapshot_verified_at: `${day}T22:00:00.000Z`,
        input_tokens: input, cached_input_tokens: cached, cache_creation_input_tokens: creation,
        output_tokens: output, reasoning_output_tokens: 50,
        total_tokens: input + cached + creation + output,
      });
    }
  }

  // Backfill total_tokens from the parts.
  for (const row of hourly) {
    row.total_tokens =
      row.input_tokens + row.cached_input_tokens + row.cache_creation_input_tokens + row.output_tokens + row.reasoning_output_tokens;
  }

  return { hourly, sessionStates };
}

const crypto = require("node:crypto");

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Direct provisioning (device rows + hashed token) instead of the device
// flow: seeding runs against the operator's dev server, which has no
// TOKEN_USAGE_DASHBOARD_URL — and authorize is the only endpoint that needs it.
async function provisionDevice(url, secret, userId, machineId, deviceName) {
  const device = await rest(url, secret, "POST", "token_devices", {
    user_id: userId,
    device_name: deviceName,
    platform: "cli-device-flow",
    machine_id: machineId,
    machine_cluster_id: machineId,
    default_device_name: deviceName,
  }, "return=representation");
  if (device.status !== 201) throw new Error(`device insert failed: HTTP ${device.status} ${JSON.stringify(device.data).slice(0, 200)}`);
  const deviceId = device.data[0].id;
  const token = crypto.randomBytes(32).toString("hex");
  const tokenRow = await rest(url, secret, "POST", "token_device_tokens", {
    user_id: userId,
    device_id: deviceId,
    token_hash: sha256Hex(token),
  });
  if (tokenRow.status !== 201) throw new Error(`token insert failed: HTTP ${tokenRow.status}`);
  return { token, deviceId };
}

async function main() {
  const { url, secret } = loadEnv();
  const base = (readArg("--base-url") || "http://127.0.0.1:3000/api").replace(/\/$/, "");
  const keep = hasFlag("--keep");
  const cleanupOnly = hasFlag("--cleanup");

  // Find the operator account.
  const users = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: "application/json" },
  }).then((r) => r.json());
  const operator = (users.users || []).find((u) => u.email === OPERATOR_EMAIL);
  if (!operator) throw new Error(`operator account ${OPERATOR_EMAIL} not found`);
  const userId = operator.id;
  console.log(`Operator: ${OPERATOR_EMAIL} (${userId})`);
  console.log(`Backend:  ${base}\n`);

  if (cleanupOnly || !keep) {
    // Wipe previous preview data (idempotent re-seed starts clean).
    const devices = await rest(url, secret, "GET", `token_devices?select=id&machine_id=like.${TAG}-*`);
    for (const device of devices.data || []) {
      await rest(url, secret, "DELETE", `token_usage_hourly?device_id=eq.${device.id}`);
      await rest(url, secret, "DELETE", `token_device_tokens?device_id=eq.${device.id}`);
      await rest(url, secret, "DELETE", `token_devices?id=eq.${device.id}`);
    }
    await rest(url, secret, "DELETE", `token_device_codes?machine_id=like.${TAG}-*`);
    await rest(url, secret, "DELETE", `token_account_session_states?session_id=like.${TAG}-%`);
    console.log(`Cleaned ${(devices.data || []).length} previous preview device(s).`);
    if (cleanupOnly) return;
  }

  // Provision two preview devices directly.
  const deviceA = await provisionDevice(url, secret, userId, `${TAG}-pc-a`, "M3 Preview PC-A");
  const deviceB = await provisionDevice(url, secret, userId, `${TAG}-pc-b`, "M3 Preview PC-B");
  console.log(`Provisioned: A=${deviceA.deviceId} (30d), B=${deviceB.deviceId} (7d)`);

  const rng = makeRng(20261024);
  const a = buildBuckets(30, "a", rng);
  const b = buildBuckets(7, "b", makeRng(7));

  // Ingest in chunks of 400 (contract cap 500).
  async function ingest(token, rows, states) {
    for (let i = 0; i < rows.length; i += 400) {
      const chunk = rows.slice(i, i + 400);
      const r = await api(base, "ingest", { method: "POST", token, body: { hourly: chunk, ...(i === 0 ? { account_session_states: states } : {}) } });
      if (r.status !== 200) throw new Error(`ingest failed: HTTP ${r.status} ${JSON.stringify(r.data)}`);
    }
  }

  await ingest(deviceA.token, a.hourly, a.sessionStates);
  await ingest(deviceB.token, b.hourly, b.sessionStates);
  console.log(`Ingested: A ${a.hourly.length} buckets + ${a.sessionStates.length} sessions; B ${b.hourly.length} buckets + ${b.sessionStates.length} sessions.`);

  // Reconcile: dashboard endpoint totals == seeded expectation.
  // Expectation math mirrors the CONTRACT: (1) in-request dedupe keeps the
  // max total per (hour_start|source|model) key; (2) cursor dedupes at
  // account level per (hour_start, model) key; (3) trae-cn hourly rows never
  // count — only session states do.
  const sum = (rows, key) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
  const dedupeBatch = (rows) => {
    const byKey = new Map();
    for (const r of rows) {
      const key = `${r.hour_start}|${r.source}|${r.model}`;
      const prev = byKey.get(key);
      if (!prev || r.total_tokens > prev.total_tokens) byKey.set(key, r);
    }
    return [...byKey.values()];
  };
  const batchA = dedupeBatch(a.hourly);
  const batchB = dedupeBatch(b.hourly);
  const sessionTotal = sum(a.sessionStates, "total_tokens");
  const traeB = sum(b.sessionStates, "total_tokens");

  const cursorByKey = new Map();
  for (const r of [...batchA, ...batchB].filter((r) => r.source === "cursor")) {
    const key = `${r.hour_start}|${r.model}`;
    const prev = cursorByKey.get(key) || 0;
    cursorByKey.set(key, Math.max(prev, r.total_tokens));
  }
  const cursorTotal = [...cursorByKey.values()].reduce((x, y) => x + y, 0);
  const machineTotal = sum(batchA.filter((r) => r.source !== "cursor"), "total_tokens")
    + sum(batchB.filter((r) => r.source !== "cursor"), "total_tokens");
  const expectedTotal = machineTotal + cursorTotal + sessionTotal + traeB;

  const earliest = Math.min(
    ...[...batchA, ...batchB].map((r) => Date.parse(r.hour_start)),
  );
  const fromIso = new Date(earliest).toISOString();
  const toIso = new Date(Date.now() + 86_400_000).toISOString();
  // The seeder has no browser JWT — the device token covers the dual-principal
  // read path (device tokens read the account the same way the UI's JWT does).
  const dash = await api(base, "dashboard", { token: deviceA.token, query: `?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}` });

  if (dash.status !== 200) {
    throw new Error(`dashboard fetch failed: HTTP ${dash.status} ${JSON.stringify(dash.data).slice(0, 200)}`);
  }

  console.log(`Expected account total: ${expectedTotal} (machine ${machineTotal} + cursor deduped ${cursorTotal} + trae sessions ${sessionTotal + traeB})`);
  console.log(`Dashboard range total:  ${dash.data.totals?.total_tokens}`);
  console.log(`Dashboard all-time:     ${dash.data.all_time?.total_tokens}`);
  console.log(`Devices in payload:     ${(dash.data.devices || []).length}, models: ${(dash.data.models || []).length}, daily rows: ${(dash.data.daily || []).length}`);

  if (dash.data.totals?.total_tokens === expectedTotal) {
    console.log("\nRECONCILIATION PASS — dashboard total == seeded account total.");
  } else {
    console.error("\nRECONCILIATION MISMATCH");
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
