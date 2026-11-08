"use strict";

// The ingest edge (docs/cli-contract.md §2.4) validates every usage bucket
// BEFORE writing and rejects the WHOLE batch with 400 on the first invalid
// row. The upload path drains queue.jsonl verbatim, where any producer bug
// (fractional counters from a vendor API, a mangled line) would otherwise
// poison the batch and stall the queue head-of-line forever: the offset only
// advances on success, so every retry re-reads the identical rejected batch.
// Rows are therefore coerced into the contract shape here, and dropped
// (return null) when they cannot be repaired — losing one row beats losing
// the whole queue behind it.
//
// The coercion is a WHITELIST REBUILD, not a spread: queue rows accumulate
// producer-private extras over time (queuedKey fingerprints, parser scratch
// fields, repair bookkeeping). Spreading them onto the wire bloated request
// bodies toward the contract's 1 MiB cap (§1.2 → 413, which with the
// success-only offset used to mean an unretryable batch), and a producer that
// wrote a huge value into an unknown key could grow a row without bound.
// Only the contract's fields ride the wire — the server ignores unknown keys
// anyway, and no consumer of the sanitized row (sync upload, reconcile
// comparison, drain telemetry) reads anything else.

const { TOKEN_COLUMNS } = require("./account-usage-dedup");

// Contract §2.4: counters must be non-negative SAFE integers, or the edge
// 400s the whole batch. Clamping to Number.MAX_SAFE_INTEGER (instead of only
// flooring) keeps a producer that wrote an unsafe value from stalling the
// queue on a deterministic 400.
function nonNegativeInteger(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(0, Math.floor(n)), Number.MAX_SAFE_INTEGER);
}

function nonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sanitizeBucketForUpload(bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return null;
  if (typeof bucket.hour_start !== "string" || !Number.isFinite(Date.parse(bucket.hour_start))) return null;
  const sanitized = {
    hour_start: bucket.hour_start,
    source: bucket.source,
    model: bucket.model,
  };
  for (const column of TOKEN_COLUMNS) {
    sanitized[column] = nonNegativeInteger(bucket[column]);
  }
  sanitized.billable_total_tokens = bucket.billable_total_tokens == null
    ? null
    : nonNegativeInteger(bucket.billable_total_tokens);
  if (bucket.conversation_count !== undefined) sanitized.conversation_count = nonNegativeInteger(bucket.conversation_count);
  if (bucket.conversations !== undefined) sanitized.conversations = nonNegativeInteger(bucket.conversations);
  sanitized.total_cost_usd = bucket.total_cost_usd == null ? 0 : nonNegativeNumber(bucket.total_cost_usd);
  // Credits (docs/cli-contract.md §2.4, 2026-10-31): optional float, dropped
  // entirely when zero/invalid so rows without a credit-based provider keep
  // their previous wire shape.
  const credits = Number(bucket.credits);
  if (Number.isFinite(credits) && credits > 0) {
    sanitized.credits = Math.round(credits * 1e6) / 1e6;
  }
  // project_key (contract v2, 2026-11-03): optional pass-through, string only
  // (anything else is a producer bug — drop the field, not the row); the
  // server applies the basename/control-char cleanup. Trimmed-empty is
  // dropped so unattributed rows keep the old wire shape.
  if (typeof bucket.project_key === "string" && bucket.project_key.trim()) {
    sanitized.project_key = bucket.project_key;
  }
  return sanitized;
}

module.exports = { sanitizeBucketForUpload };
