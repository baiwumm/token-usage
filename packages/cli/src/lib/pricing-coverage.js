"use strict";

// Read-only pricing-coverage and unknown-model alignment analysis over the
// local last-wins queue baseline (queue.jsonl). Used by `doctor`
// (docs/upstream-comparison-plan.md §2 B3 + §3 C2 dry-run). This module never
// writes anything; the alignment preview is a dry-run projection only and does
// NOT change any bucket's stored or displayed model.

const fs = require("node:fs/promises");

const { iterateQueueLines } = require("./upload-queue");
const { normalizeQueueRow } = require("./queue-row-normalize");
const { getModelPricingInfo } = require("./pricing");

const DEFAULT_WINDOW_DAYS = 7;
const TOP_UNPRICED_LIMIT = 10;
const TOP_MOVES_LIMIT = 10;

// Same bucket identity as reconcile (hour_start|source|model last-wins), minus
// the upload sanitization: this is a local read-side analysis, not an upload.
async function readLastWinsBuckets({ queuePath, fromMs, toMs }) {
  let handle;
  try {
    handle = await fs.open(queuePath, "r");
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }
  const buckets = new Map();
  try {
    const stat = await handle.stat();
    for await (const record of iterateQueueLines(handle, 0, stat.size)) {
      // A producer may be mid-write; an incomplete tail is not yet queued data.
      if (!record.complete) break;
      const line = record.bytes.toString("utf8");
      if (!line.trim()) continue;
      let raw;
      try {
        raw = JSON.parse(line);
      } catch (_error) {
        continue;
      }
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      // Control records (account session states / watermarks) are not buckets.
      if (Object.hasOwn(raw, "kind")) continue;
      const hourMs = typeof raw.hour_start === "string" ? Date.parse(raw.hour_start) : NaN;
      if (!Number.isFinite(hourMs) || hourMs < fromMs || hourMs >= toMs) continue;
      const source = (typeof raw.source === "string" ? raw.source.trim().toLowerCase() : "") || "codex";
      const model = (typeof raw.model === "string" ? raw.model.trim() : "") || "unknown";
      const row = normalizeQueueRow({
        ...raw,
        source,
        model,
        hour_start: new Date(hourMs).toISOString(),
      });
      buckets.set(`${row.hour_start}|${source}|${model}`, {
        hour_start: row.hour_start,
        source,
        model,
        total_tokens: Number(row.total_tokens) || 0,
        conversation_count: Number(row.conversation_count) || 0,
      });
    }
  } finally {
    await handle.close();
  }
  return [...buckets.values()];
}

// "Covered" = priced or known-free (subscription/local); "unpriced" = the
// pricing engine has no entry for the model at all (the $0 that matters).
// Zero-token unpriced buckets (e.g. qoder-cn credits-only rows) are counted
// separately: they carry no cost error, so they must not crowd top_unpriced.
function analyzePricingCoverage(buckets) {
  let coveredBuckets = 0;
  let coveredTokens = 0;
  let totalTokens = 0;
  let zeroTokenUnpricedBuckets = 0;
  const unpricedByModel = new Map();
  for (const bucket of buckets) {
    const info = getModelPricingInfo(bucket.model, { source: bucket.source });
    const covered = info.status === "priced" || info.status === "free";
    totalTokens += bucket.total_tokens;
    if (covered) {
      coveredBuckets += 1;
      coveredTokens += bucket.total_tokens;
      continue;
    }
    if (bucket.total_tokens === 0) {
      zeroTokenUnpricedBuckets += 1;
      continue;
    }
    const entry = unpricedByModel.get(bucket.model) || {
      model: bucket.model,
      total_tokens: 0,
      buckets: 0,
      sources: new Set(),
    };
    entry.total_tokens += bucket.total_tokens;
    entry.buckets += 1;
    entry.sources.add(bucket.source);
    unpricedByModel.set(bucket.model, entry);
  }
  const topUnpriced = [...unpricedByModel.values()]
    .sort((a, b) => b.total_tokens - a.total_tokens || a.model.localeCompare(b.model))
    .slice(0, TOP_UNPRICED_LIMIT)
    .map((entry) => ({
      model: entry.model,
      total_tokens: entry.total_tokens,
      buckets: entry.buckets,
      sources: [...entry.sources].sort(),
    }));
  const actionableUnpriced = [...unpricedByModel.values()].reduce((sum, entry) => sum + entry.buckets, 0);
  return {
    buckets: buckets.length,
    covered_buckets: coveredBuckets,
    unpriced_buckets: actionableUnpriced,
    zero_token_unpriced_buckets: zeroTokenUnpricedBuckets,
    bucket_coverage: buckets.length ? coveredBuckets / buckets.length : 1,
    total_tokens: totalTokens,
    covered_tokens: coveredTokens,
    token_coverage: totalTokens ? coveredTokens / totalTokens : 1,
    top_unpriced: topUnpriced,
  };
}

// C2 dry-run (juejin align-unknown.ts idea): for every (source, hour) group
// that contains both "unknown" rows and known-model rows, the unknown tokens
// WOULD be re-attributed to the dominant known model of that group. Groups
// with only unknown rows are unresolvable. Nothing here is applied anywhere.
function previewUnknownAlignment(buckets) {
  const groups = new Map();
  for (const bucket of buckets) {
    const key = `${bucket.source}|${bucket.hour_start}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(bucket);
  }
  let unknownBuckets = 0;
  let unknownTokens = 0;
  let alignableBuckets = 0;
  let alignableTokens = 0;
  let unresolvableBuckets = 0;
  let unresolvableTokens = 0;
  const moves = [];
  for (const group of groups.values()) {
    const unknownRows = group.filter((row) => row.model.trim().toLowerCase() === "unknown");
    if (!unknownRows.length) continue;
    const knownRows = group.filter((row) => row.model.trim().toLowerCase() !== "unknown");
    let dominant = null;
    for (const row of knownRows) {
      if (!dominant || row.total_tokens > dominant.total_tokens) dominant = row;
    }
    for (const row of unknownRows) {
      unknownBuckets += 1;
      unknownTokens += row.total_tokens;
      if (dominant) {
        alignableBuckets += 1;
        alignableTokens += row.total_tokens;
        moves.push({
          source: row.source,
          hour_start: row.hour_start,
          unknown_tokens: row.total_tokens,
          target_model: dominant.model,
          target_tokens: dominant.total_tokens,
        });
      } else {
        unresolvableBuckets += 1;
        unresolvableTokens += row.total_tokens;
      }
    }
  }
  moves.sort((a, b) => b.unknown_tokens - a.unknown_tokens);
  return {
    unknown_buckets: unknownBuckets,
    unknown_tokens: unknownTokens,
    alignable_buckets: alignableBuckets,
    alignable_tokens: alignableTokens,
    unresolvable_buckets: unresolvableBuckets,
    unresolvable_tokens: unresolvableTokens,
    top_moves: moves.slice(0, TOP_MOVES_LIMIT),
  };
}

async function collectPricingCoverage({ queuePath, days = DEFAULT_WINDOW_DAYS, now = () => new Date() } = {}) {
  const windowDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_WINDOW_DAYS;
  const toMs = now().getTime();
  const fromMs = toMs - windowDays * 86_400_000;
  const buckets = await readLastWinsBuckets({ queuePath, fromMs, toMs });
  return {
    window: {
      days: windowDays,
      from: new Date(fromMs).toISOString(),
      to: new Date(toMs).toISOString(),
    },
    coverage: analyzePricingCoverage(buckets),
    unknown_alignment_preview: previewUnknownAlignment(buckets),
  };
}

module.exports = {
  collectPricingCoverage,
  readLastWinsBuckets,
  analyzePricingCoverage,
  previewUnknownAlignment,
};
