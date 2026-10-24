#!/usr/bin/env node
"use strict";

/**
 * M4 wrapped preview seeder — backfills Jan..Sep of the current year (BEFORE
 * the M3 preview window, so the M3 reconciliation stays intact) into the
 * operator account with the shared `m3-preview-` tag. Cleanup for everything
 * tagged m3-preview- remains: node scripts/selfhost/preview-m3.cjs --cleanup
 *
 *   node scripts/selfhost/preview-m4.cjs --base-url http://127.0.0.1:3000/api
 *
 * Environment: apps/web/.env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY).
 */

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const TAG = "m3-preview";
const OPERATOR_EMAIL = "me@baiwumm.com";
const YEAR = new Date().getUTCFullYear();

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

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

function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

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
  const token = crypto.randomBytes(32).toString("hex");
  const tokenRow = await rest(url, secret, "POST", "token_device_tokens", {
    user_id: userId,
    device_id: device.data[0].id,
    token_hash: sha256Hex(token),
  });
  if (tokenRow.status !== 201) throw new Error(`token insert failed: HTTP ${tokenRow.status}`);
  return { token, deviceId: device.data[0].id };
}

function makeRng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
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

// Jan 5 .. Sep 24 of YEAR (inclusive) — stops before the M3 window.
function buildHistoryBuckets(rng) {
  const hourly = [];
  const sessionStates = [];
  const endMs = Date.UTC(YEAR, 8, 24); // Sep 24
  let cursor = Date.UTC(YEAR, 0, 5);

  while (cursor <= endMs) {
    const day = new Date(cursor).toISOString().slice(0, 10);
    const weekend = [0, 6].includes(new Date(cursor).getUTCDay());
    const sessions = weekend ? 2 : 3 + Math.floor(rng() * 3);

    for (let i = 0; i < sessions; i++) {
      const hour = 9 + Math.floor(rng() * 8);
      const hourStart = `${day}T${String(hour).padStart(2, "0")}:00:00.000Z`;
      const roll = rng();

      if (roll < 0.2) {
        hourly.push(bucket(hourStart, {
          source: "cursor", model: "composer-1",
          input_tokens: 6000 + Math.floor(rng() * 7000), output_tokens: 900 + Math.floor(rng() * 1100),
        }));
      } else if (roll < 0.45) {
        hourly.push(bucket(hourStart, {
          source: "claude-code", model: "test-unpriced-model",
          input_tokens: 4000 + Math.floor(rng() * 8000), cached_input_tokens: 2000 + Math.floor(rng() * 5000),
          output_tokens: 700 + Math.floor(rng() * 1500),
        }));
      } else {
        const inTok = 3000 + Math.floor(rng() * 10000);
        const outTok = 400 + Math.floor(rng() * 1800);
        hourly.push(bucket(hourStart, {
          source: "codex", model: "grok-code-fast-1",
          input_tokens: inTok, output_tokens: outTok,
          total_cost_usd: Number((inTok * 0.000002 + outTok * 0.000008).toFixed(6)),
        }));
      }
    }

    // trae-cn session most days.
    if (rng() < 0.7) {
      const input = 1500 + Math.floor(rng() * 3500);
      const cached = 300 + Math.floor(rng() * 800);
      const creation = 80 + Math.floor(rng() * 200);
      const output = 500 + Math.floor(rng() * 1200);
      sessionStates.push({
        source: "trae-cn",
        session_id: `${TAG}-hist-${day}`,
        model: "test-unpriced-model",
        bucket_start: `${day}T21:00:00.000Z`,
        snapshot_verified_at: `${day}T22:00:00.000Z`,
        input_tokens: input, cached_input_tokens: cached, cache_creation_input_tokens: creation,
        output_tokens: output, reasoning_output_tokens: 40,
        total_tokens: input + cached + creation + output,
      });
    }
    cursor += 86_400_000;
  }

  for (const row of hourly) {
    row.total_tokens =
      row.input_tokens + row.cached_input_tokens + row.cache_creation_input_tokens + row.output_tokens + row.reasoning_output_tokens;
  }

  return { hourly, sessionStates };
}

async function main() {
  const { url, secret } = loadEnv();
  const base = (readArg("--base-url") || "http://127.0.0.1:3000/api").replace(/\/$/, "");

  const users = await fetch(`${url}/auth/v1/admin/users?per_page=200`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, Accept: "application/json" },
  }).then((r) => r.json());
  const operator = (users.users || []).find((u) => u.email === OPERATOR_EMAIL);
  if (!operator) throw new Error(`operator account ${OPERATOR_EMAIL} not found`);
  console.log(`Operator: ${OPERATOR_EMAIL} (${operator.id})`);
  console.log(`Backend:  ${base}\n`);

  // Idempotent: drop the history device if a previous run left it.
  const stale = await rest(url, secret, "GET", `token_devices?select=id&machine_id=eq.${TAG}-history-a`);
  for (const device of stale.data || []) {
    await rest(url, secret, "DELETE", `token_usage_hourly?device_id=eq.${device.id}`);
    await rest(url, secret, "DELETE", `token_device_tokens?device_id=eq.${device.id}`);
    await rest(url, secret, "DELETE", `token_devices?id=eq.${device.id}`);
  }

  const device = await provisionDevice(url, secret, operator.id, `${TAG}-history-a`, "M3 Preview History");
  const rng = makeRng(20260101);
  const { hourly, sessionStates } = buildHistoryBuckets(rng);

  for (let i = 0; i < hourly.length; i += 400) {
    const chunk = hourly.slice(i, i + 400);
    const r = await api(base, "ingest", {
      method: "POST",
      token: device.token,
      body: { hourly: chunk, ...(i === 0 ? { account_session_states: sessionStates } : {}) },
    });
    if (r.status !== 200) throw new Error(`ingest failed: HTTP ${r.status} ${JSON.stringify(r.data)}`);
  }
  console.log(`Ingested history: ${hourly.length} buckets + ${sessionStates.length} sessions (${YEAR}-01-05 .. ${YEAR}-09-24).`);

  // Sanity: monthly series for the year.
  const monthly = await api(base, "account-monthly", {
    token: device.token,
    query: `?from=${YEAR}-01-01&to=${YEAR}-12-31`,
  });
  const months = (monthly.data?.data || []).filter((m) => m.total_tokens > 0);
  console.log(`Monthly series: ${months.length} non-empty months; yearly total ${months.reduce((a, m) => a + m.total_tokens, 0)}.`);
  console.log("Done — wrapped at /wrapped now has a full year of preview data.");
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
