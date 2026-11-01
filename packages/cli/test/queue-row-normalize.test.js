"use strict";

// The upload path and every local queue reader must agree on the same
// read-time corrections, otherwise the cloud keeps legacy raw values while
// local views show corrected ones (a permanent, silent mismatch).

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { normalizeQueueRow, isLegacyInclusiveCodexRow } = require("../src/lib/queue-row-normalize");

test("legacy Codex rows (input inclusive of cache reads) are corrected", () => {
  const legacy = {
    source: "codex",
    input_tokens: 1200,
    cached_input_tokens: 1000,
    output_tokens: 200,
    total_tokens: 1400,
  };
  assert.equal(isLegacyInclusiveCodexRow(legacy), true);
  const normalized = normalizeQueueRow(legacy);
  assert.equal(normalized.input_tokens, 200);
  assert.equal(normalized.total_tokens, 1400, "total_tokens must stay input+output");
  assert.equal(normalized.cached_input_tokens, 1000, "cache counters are untouched");
});

test("canonical Codex rows and other sources are left verbatim", () => {
  const canonical = {
    source: "codex",
    input_tokens: 200,
    cached_input_tokens: 1000,
    output_tokens: 200,
    total_tokens: 400,
  };
  assert.equal(isLegacyInclusiveCodexRow(canonical), false);
  assert.deepEqual(normalizeQueueRow(canonical), canonical);

  const claude = {
    source: "claude",
    input_tokens: 1200,
    cached_input_tokens: 1000,
    output_tokens: 200,
    total_tokens: 1400,
  };
  assert.deepEqual(normalizeQueueRow(claude), claude, "the legacy invariant is codex/every-code only");
});

test("every-code shares the Codex legacy correction", () => {
  const row = { source: "every-code", input_tokens: 500, cached_input_tokens: 400, output_tokens: 100, total_tokens: 600 };
  assert.equal(isLegacyInclusiveCodexRow(row), true);
  assert.equal(normalizeQueueRow(row).input_tokens, 100);
});

test("cursor/antigravity rows with zeroed billable are healed from total_tokens", () => {
  for (const source of ["cursor", "antigravity", "Cursor"]) {
    const healed = normalizeQueueRow({ source, total_tokens: 900, billable_total_tokens: 0 });
    assert.equal(healed.billable_total_tokens, 900, `${source} must report the usage it recorded`);
  }
  // A genuinely free row (no usage) stays at zero, and an already-correct row
  // is not rewritten.
  assert.equal(normalizeQueueRow({ source: "cursor", total_tokens: 0, billable_total_tokens: 0 }).billable_total_tokens, 0);
  assert.equal(normalizeQueueRow({ source: "cursor", total_tokens: 900, billable_total_tokens: 900 }).billable_total_tokens, 900);
  // Only the two affected sources are healed.
  assert.equal(normalizeQueueRow({ source: "claude", total_tokens: 900, billable_total_tokens: 0 }).billable_total_tokens, 0);
});

test("malformed rows never throw", () => {
  for (const row of [null, undefined, {}, { source: "codex", input_tokens: "abc" }]) {
    assert.doesNotThrow(() => normalizeQueueRow(row));
  }
  assert.equal(isLegacyInclusiveCodexRow(null), false);
  assert.equal(isLegacyInclusiveCodexRow({}), false);
});
