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

const { TOKEN_COLUMNS } = require("./account-usage-dedup");

function nonNegativeInteger(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
}

function nonNegativeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function sanitizeBucketForUpload(bucket) {
  if (!bucket || typeof bucket !== "object" || Array.isArray(bucket)) return null;
  if (typeof bucket.hour_start !== "string" || !Number.isFinite(Date.parse(bucket.hour_start))) return null;
  const sanitized = { ...bucket };
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
  } else {
    delete sanitized.credits;
  }
  return sanitized;
}

module.exports = { sanitizeBucketForUpload };
