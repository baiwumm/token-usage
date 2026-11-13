#!/usr/bin/env node
/**
 * Legacy history replay for token-usage (docs/launch-runbook.md 新 CLI 迁移).
 *
 * Replays a bucket-rows JSON file (produced by the legacy migration export)
 * into the token-usage ingest on behalf of THIS machine's paired device.
 * Idempotent: the server upserts whole rows, so re-running is safe and only
 * raises values when a larger snapshot arrives.
 *
 * Usage (run ON the machine whose device identity should own the history):
 *   node scripts/replay-legacy-history.mjs company-legacy-hourly.json
 *   node scripts/replay-legacy-history.mjs file.json --base-url https://token-usage.baiwumm.com
 *
 * Reads the paired device token from ~/.tokenusage/tracker/config.json
 * (pair first: `tokenusage device-login`). Only aggregate bucket data rides
 * on the request — no prompts, paths or session content (privacy boundary).
 */

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const baseUrlArg = args.includes("--base-url") ? args[args.indexOf("--base-url") + 1] : null;
const BASE_URL = (baseUrlArg || "https://token-usage.baiwumm.com").replace(/\/$/, "");
const BATCH = 400; // contract caps hourly at 500; stay under

if (!file) {
  console.error("usage: node scripts/replay-legacy-history.mjs <buckets.json> [--base-url <url>]");
  process.exit(1);
}

let token = null;
try {
  const config = JSON.parse(readFileSync(join(homedir(), ".tokenusage/tracker/config.json"), "utf8"));
  token = config.deviceToken || null;
} catch {
  // fall through to the error below
}
if (!token) {
  console.error("No paired device token found. Run `tokenusage device-login` first.");
  process.exit(1);
}

const rows = JSON.parse(readFileSync(file, "utf8"));
if (!Array.isArray(rows) || rows.length === 0) {
  console.error("Input file has no rows.");
  process.exit(1);
}

// Per-key max merge with time normalization (+00:00 vs .000Z are the same
// instant; comparing the raw strings would split keys and let the smaller
// duplicate overwrite the larger one after server-side normalization).
const best = new Map();
for (const r of rows) {
  const key = `${new Date(r.hour_start).toISOString()}|${r.source}|${r.model}`;
  const prev = best.get(key);
  if (!prev || Number(r.total_tokens) > Number(prev.total_tokens)) best.set(key, r);
}
const buckets = [...best.values()].sort((a, b) => a.hour_start.localeCompare(b.hour_start));
const totalTokens = buckets.reduce((sum, r) => sum + Number(r.total_tokens || 0), 0);

console.log(`replaying ${buckets.length} bucket rows (${(totalTokens / 1e9).toFixed(3)}B tokens) → ${BASE_URL}`);
let inserted = 0;
for (let i = 0; i < buckets.length; i += BATCH) {
  const batch = buckets.slice(i, i + BATCH);
  const res = await fetch(`${BASE_URL}/api/functions/token-usage-ingest`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ upload_id: randomUUID(), hourly: batch }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`batch ${i} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    process.exit(1);
  }
  const data = await res.json().catch(() => ({}));
  inserted += Number(data.inserted || 0);
  console.log(`  batch ${i}: ok (inserted ${data.inserted ?? "?"})`);
}
console.log(`done. inserted ${inserted} rows. Open ${BASE_URL}/ and check the dashboard totals.`);
