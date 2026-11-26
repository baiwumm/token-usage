"use strict";

// Freebuff account-level usage → queue rows.
//
// The usage-summary API reports spend as ONE total per local-day (the
// console's account timezone), with no per-model or per-session split and no
// hourly granularity (2026-11-25 payload audit: lifetime.days[] carries
// {date, tokens} only; sessionsByModel counts sessions, not tokens). Rows are
// therefore written as ordinary hourly buckets pinned to the day's
// `T00:00:00.000Z` start — the contract explicitly allows non-aligned hour
// starts — with model "unknown" (the established value for unattributed
// models, cf. gemini) and the whole day total in input_tokens: the six-tuple
// identity total = input + cached + cache_creation + output stays intact and
// nothing is fabricated (a days[] entry simply has no output/cache split to
// report; splitting by the 7-day recent ratio would be an estimate, and this
// source reports exact figures only).
//
// Server-side totals per day are monotonic while the day is live and final
// once it passes, and the console serves a rolling 365-day window. Each sync
// diffs the fetched series against the last-queued per-day totals
// (`cursors.freebuff.days`) and appends a row only for days whose total
// changed — the bucket upsert key (user, device, hour_start, source, model)
// is last-wins, so re-sending an unchanged day is pure churn. A day that
// ages out of the window is NEVER zeroed: absence is not proven to mean
// deletion (same policy as Trae CN snapshots), and the window only moves
// forward so a re-appearing day is impossible in practice.
//
// Cost: lifetime.costUsd is the console's "saved vs list price" marketing
// figure, not spend, and per-day cost is not exposed; rows carry 0 and the
// pricing engine prices unknown models at 0.

const fs = require("node:fs/promises");
const fssync = require("node:fs");
const path = require("node:path");

const FREEBUFF_SOURCE = "freebuff";
const FREEBUFF_MODEL = "unknown";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Pure transform: usage-summary payload → day rows. Throws on any malformed
// entry (fail closed — a partially corrupt snapshot must not silently become
// the authoritative series).
function buildFreebuffDayRows(summary) {
  const days = summary?.lifetime?.days;
  if (!Array.isArray(days)) {
    throw new Error("Freebuff usage summary is missing lifetime.days.");
  }
  const seen = new Set();
  const rows = [];
  for (const entry of days) {
    const date = entry?.date;
    const tokens = entry?.tokens;
    if (typeof date !== "string" || !DATE_PATTERN.test(date)) {
      throw new Error(`Freebuff usage day has a malformed date: ${JSON.stringify(entry?.date)}`);
    }
    if (!Number.isSafeInteger(tokens) || tokens < 0) {
      throw new Error(`Freebuff usage day ${date} has a malformed token total: ${JSON.stringify(tokens)}`);
    }
    if (seen.has(date)) {
      throw new Error(`Freebuff usage summary repeats day ${date}.`);
    }
    seen.add(date);
    rows.push({
      source: FREEBUFF_SOURCE,
      model: FREEBUFF_MODEL,
      hour_start: `${date}T00:00:00.000Z`,
      input_tokens: tokens,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: tokens,
      billable_total_tokens: tokens,
      total_cost_usd: 0,
      conversation_count: 0,
    });
  }
  return rows;
}

// Diff the fetched series against the last-queued totals and append one
// authoritative row per CHANGED day. Returns the standard parser result
// shape; `cursors.freebuff` is mutated in place and persisted by the caller's
// cursor-store flush (same contract as every other parser).
async function parseFreebuffUsageSummary({ summary, cursors, queuePath }) {
  const rows = buildFreebuffDayRows(summary);

  if (!cursors || typeof cursors !== "object") {
    throw new Error("Freebuff usage parser requires a cursors store.");
  }
  if (!cursors.freebuff || typeof cursors.freebuff !== "object") cursors.freebuff = {};
  const state = cursors.freebuff;
  if (!state.days || typeof state.days !== "object") state.days = {};
  const lastQueued = state.days;

  const toAppend = [];
  const observed = {};
  for (const row of rows) {
    const date = row.hour_start.slice(0, 10);
    observed[date] = row.total_tokens;
    if (lastQueued[date] === row.total_tokens) continue;
    toAppend.push(JSON.stringify(row));
    lastQueued[date] = row.total_tokens;
  }
  // Days that aged out of the rolling window lose their state entry — they
  // can never re-appear, and their queued rows stay untouched on disk.
  for (const date of Object.keys(lastQueued)) {
    if (!(date in observed)) delete lastQueued[date];
  }

  let bucketsQueued = 0;
  if (toAppend.length > 0) {
    await fs.mkdir(path.dirname(queuePath), { recursive: true });
    await fs.appendFile(queuePath, `${toAppend.join("\n")}\n`, "utf8");
    bucketsQueued = toAppend.length;
  }
  state.updatedAt = new Date().toISOString();

  return {
    recordsProcessed: rows.length,
    eventsAggregated: rows.length,
    bucketsQueued,
  };
}

// Presence probe shared with the sync gate: freebuff is "installed" when a
// credentials.json with a keychain tokenStore exists (the token itself may
// still be missing — the fetch layer treats that as a silent skip).
function isFreebuffConfigured({ env, home, fsModule = fssync } = {}) {
  const credentialsPath = require("./freebuff-config").resolveFreebuffCredentialsPath({ env, home });
  try {
    if (!fsModule.existsSync(credentialsPath)) return false;
    const parsed = JSON.parse(fsModule.readFileSync(credentialsPath, "utf8"));
    const profile = parsed && typeof parsed === "object" ? parsed.default : null;
    return Boolean(profile && typeof profile === "object" && profile.tokenStore === "keychain");
  } catch {
    return false;
  }
}

module.exports = {
  FREEBUFF_SOURCE,
  FREEBUFF_MODEL,
  buildFreebuffDayRows,
  parseFreebuffUsageSummary,
  isFreebuffConfigured,
};
