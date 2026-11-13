#!/usr/bin/env node
"use strict";

/**
 * Seed one device's historical queue into Supabase (token_* tables).
 *
 * Run once before switching that collector's CLI to the new backend. Keep each
 * collector's queue separate and pass the device row that belongs to it.
 *
 *   node scripts/selfhost/seed-queue.cjs \
 *     --queue "$HOME/.tokentracker/tracker/queue.jsonl" \
 *     --user-id <supabase-auth-user-uuid> \
 *     --device-id <token-devices-uuid>
 *
 * Add --dry-run to calculate the last-wins total without writing.
 *
 * Required environment (new Supabase key system, legacy names accepted):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * The last-wins parsing here is the reconciliation baseline: the bucket map's
 * total must equal what the new tables hold after seeding, and what
 * token-usage-account-summary reports for the account.
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const args = process.argv.slice(2);
function readArg(name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : null;
}

const dryRun = args.includes("--dry-run");
const queuePath = path.resolve(
  readArg("--queue") || path.join(os.homedir(), ".tokentracker", "tracker", "queue.jsonl"),
);
const userId = String(readArg("--user-id") || "").trim();
const deviceId = String(readArg("--device-id") || "").trim();
// Current Supabase key system first, legacy names as fallback.
const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
const serviceKey = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();

function safeInt(value) {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

/**
 * Parse the queue file into last-wins buckets + session states.
 * The local readers use the latest queue row per bucket key; preserve that
 * semantic here instead of summing every append-only emission.
 */
function parseQueue(text) {
  const lines = String(text).split(/\r?\n/);
  const buckets = new Map();
  const states = new Map();
  let malformed = 0;

  for (const line of lines) {
    if (!line.trim()) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      malformed += 1;
      continue;
    }
    if (row?.kind === "account_session_state") {
      const source = String(row.source || "").trim().toLowerCase();
      const sessionId = String(row.session_id || "").trim();
      if (source !== "trae-cn" || !sessionId) continue;
      const bucketStart = new Date(String(row.bucket_start || ""));
      const verifiedAt = new Date(String(row.snapshot_verified_at || ""));
      if (!Number.isFinite(bucketStart.getTime()) || !Number.isFinite(verifiedAt.getTime())) {
        malformed += 1;
        continue;
      }
      const state = {
        source,
        session_id: sessionId,
        model: String(row.model || "").trim().slice(0, 200) || "unknown",
        bucket_start: bucketStart.toISOString(),
        snapshot_verified_at: verifiedAt.toISOString(),
        input_tokens: safeInt(row.input_tokens),
        cached_input_tokens: safeInt(row.cached_input_tokens),
        cache_creation_input_tokens: safeInt(row.cache_creation_input_tokens),
        output_tokens: safeInt(row.output_tokens),
        reasoning_output_tokens: safeInt(row.reasoning_output_tokens),
        total_tokens: safeInt(row.total_tokens),
      };
      states.set(`${source}|${sessionId}`, state);
      continue;
    }
    if (row?.kind === "account_sync_watermark") continue;

    const hourStart = new Date(String(row?.hour_start || ""));
    if (!Number.isFinite(hourStart.getTime())) {
      malformed += 1;
      continue;
    }
    const source = String(row.source || "").trim().toLowerCase() || "unknown";
    const model = String(row.model || "").trim() || "unknown";
    const bucket = {
      hour_start: hourStart.toISOString(),
      source,
      model,
      input_tokens: safeInt(row.input_tokens),
      cached_input_tokens: safeInt(row.cached_input_tokens),
      cache_creation_input_tokens: safeInt(row.cache_creation_input_tokens),
      output_tokens: safeInt(row.output_tokens),
      reasoning_output_tokens: safeInt(row.reasoning_output_tokens),
      total_tokens: safeInt(row.total_tokens),
      billable_total_tokens: row.billable_total_tokens == null ? null : safeInt(row.billable_total_tokens),
      conversations: safeInt(row.conversation_count ?? row.conversations ?? 0),
      total_cost_usd: Math.max(0, Number(row.total_cost_usd) || 0),
    };
    buckets.set(`${bucket.hour_start}|${source}|${model}`, bucket);
  }

  return {
    buckets: [...buckets.values()],
    states: [...states.values()],
    malformed,
  };
}

async function upsert(table, rows, onConflict) {
  const batchSize = 400;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const response = await fetch(`${url}/rest/v1/${table}?on_conflict=${onConflict}`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(batch),
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`${table} HTTP ${response.status}: ${text.slice(0, 500)}`);
    }
    process.stdout.write(`\r${table}: ${Math.min(index + batchSize, rows.length)}/${rows.length}`);
  }
  process.stdout.write("\n");
}

async function main() {
  if (!userId || !deviceId) {
    console.error("Usage: node scripts/selfhost/seed-queue.cjs --queue <path> --user-id <uuid> --device-id <uuid> [--dry-run]");
    process.exit(1);
  }
  if (!dryRun && (!url || !serviceKey)) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY), or use --dry-run");
    process.exit(1);
  }
  if (!fs.existsSync(queuePath)) {
    console.error(`Queue not found: ${queuePath}`);
    process.exit(1);
  }

  const { buckets, states, malformed } = parseQueue(fs.readFileSync(queuePath, "utf8"));
  const totalTokens = buckets.reduce((sum, row) => sum + row.total_tokens, 0);
  console.log(`Queue: ${queuePath}`);
  console.log(`Buckets: ${buckets.length} (last-wins total ${totalTokens})`);
  console.log(`Account session states: ${states.length}`);
  if (malformed > 0) console.log(`Skipped malformed rows: ${malformed}`);

  if (dryRun) {
    console.log("Dry run: nothing written");
    return;
  }

  const now = new Date().toISOString();
  await upsert(
    "token_usage_hourly",
    buckets.map((bucket) => ({ ...bucket, user_id: userId, device_id: deviceId, updated_at: now })),
    "user_id,device_id,hour_start,source,model",
  );
  if (states.length > 0) {
    await upsert(
      "token_account_session_states",
      states.map((state) => ({ ...state, user_id: userId, updated_at: now })),
      "user_id,source,session_id",
    );
  }
  console.log("Seed complete");
}

module.exports = { parseQueue, safeInt };

if (require.main === module) {
  main().catch((error) => {
    console.error(`\n${error.message}`);
    process.exit(1);
  });
}
