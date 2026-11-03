"use strict";

// B3 + C2 tests (docs/upstream-comparison-plan.md §2/§3): pricing coverage
// over the local last-wins queue and the unknown-alignment dry-run preview.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const {
  collectPricingCoverage,
  analyzePricingCoverage,
  previewUnknownAlignment,
} = require("../src/lib/pricing-coverage");
const { buildDoctorReport } = require("../src/lib/doctor");

function hourIso(ms) {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function bucket({ hour, source, model, total, conversations = 1 }) {
  return {
    hour_start: hour,
    source,
    model,
    input_tokens: total,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: total,
    conversation_count: conversations,
  };
}

async function withFixtureQueue(t, lines) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tokenusage-coverage-"));
  t.after(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });
  const queuePath = path.join(dir, "queue.jsonl");
  await fs.writeFile(queuePath, lines.map((l) => JSON.stringify(l)).join("\n") + "\n", "utf8");
  return { dir, queuePath };
}

test("coverage counts priced/free as covered and ranks unpriced models by tokens", async (t) => {
  const now = Date.now();
  const h0 = hourIso(now - 3600_000);
  const h1 = hourIso(now - 2 * 3600_000);
  const old = hourIso(now - 30 * 86_400_000);
  const { queuePath } = await withFixtureQueue(t, [
    bucket({ hour: h0, source: "codex", model: "gpt-4o", total: 900 }),
    bucket({ hour: h0, source: "codex", model: "unknown", total: 100 }),
    bucket({ hour: h1, source: "dsh", model: "unknown", total: 50 }),
    bucket({ hour: h0, source: "lmstudio", model: "local-gguf", total: 10 }),
    bucket({ hour: h0, source: "zcode", model: "fictional-model-xyz-999", total: 200 }),
    // Out-of-window and control rows must not be counted.
    bucket({ hour: old, source: "codex", model: "gpt-4o", total: 5000 }),
    { kind: "account_session_state", source: "trae-cn", session_id: "s1" },
  ]);

  const report = await collectPricingCoverage({ queuePath, days: 7, now: () => new Date(now) });
  const { coverage } = report;
  assert.equal(coverage.buckets, 5, "old + control rows excluded");
  assert.equal(coverage.covered_buckets, 2, "gpt-4o priced + lmstudio local-free");
  assert.equal(coverage.unpriced_buckets, 3);
  assert.equal(coverage.total_tokens, 1260);
  assert.equal(coverage.covered_tokens, 910);
  assert.ok(Math.abs(coverage.token_coverage - 910 / 1260) < 1e-9);
  assert.equal(coverage.top_unpriced[0].model, "fictional-model-xyz-999");
  assert.equal(coverage.top_unpriced[0].total_tokens, 200);
  assert.deepEqual(coverage.top_unpriced[0].sources, ["zcode"]);
});

test("unknown alignment preview attributes only same-source same-hour dominants", async (t) => {
  const now = Date.now();
  const h0 = hourIso(now - 3600_000);
  const h1 = hourIso(now - 2 * 3600_000);
  const { queuePath } = await withFixtureQueue(t, [
    bucket({ hour: h0, source: "codex", model: "gpt-4o", total: 900 }),
    bucket({ hour: h0, source: "codex", model: "gpt-4o-mini", total: 50 }),
    bucket({ hour: h0, source: "codex", model: "unknown", total: 100 }),
    bucket({ hour: h1, source: "dsh", model: "unknown", total: 50 }),
  ]);
  const report = await collectPricingCoverage({ queuePath, days: 7, now: () => new Date(now) });
  const preview = report.unknown_alignment_preview;
  assert.equal(preview.unknown_buckets, 2);
  assert.equal(preview.unknown_tokens, 150);
  assert.equal(preview.alignable_buckets, 1);
  assert.equal(preview.alignable_tokens, 100);
  assert.equal(preview.unresolvable_buckets, 1);
  assert.equal(preview.unresolvable_tokens, 50);
  assert.equal(preview.top_moves[0].target_model, "gpt-4o", "dominant known model of the hour wins");
  assert.equal(preview.top_moves[0].unknown_tokens, 100);
});

test("pure helpers accept bucket arrays directly", () => {
  const buckets = [
    { hour_start: "2026-11-01T00:00:00.000Z", source: "codex", model: "gpt-4o", total_tokens: 10, conversation_count: 1 },
    { hour_start: "2026-11-01T00:00:00.000Z", source: "codex", model: "unknown", total_tokens: 5, conversation_count: 1 },
  ];
  const coverage = analyzePricingCoverage(buckets);
  assert.equal(coverage.buckets, 2);
  const preview = previewUnknownAlignment(buckets);
  assert.equal(preview.alignable_tokens, 5);
  assert.equal(preview.top_moves[0].target_model, "gpt-4o");
});

test("doctor report carries the pricing.coverage check without network", async (t) => {
  const now = Date.now();
  const h0 = hourIso(now - 3600_000);
  const { dir } = await withFixtureQueue(t, [
    bucket({ hour: h0, source: "codex", model: "gpt-4o", total: 100 }),
  ]);
  const report = await buildDoctorReport({
    runtime: {},
    fetch: null,
    paths: { trackerDir: dir },
  });
  const check = report.checks.find((c) => c.id === "pricing.coverage");
  assert.ok(check, "pricing.coverage check must be present");
  assert.equal(check.status, "ok");
  assert.equal(check.critical, false);
  assert.match(check.detail, /100\.0% of tokens priced/);
  assert.equal(check.meta.coverage.buckets, 1);
});
