"use strict";

// A3 (docs/upstream-comparison-plan.md §1): `status --json` exposes pricing
// data provenance + staleness via getPricingMeta(). This guards the accessor's
// shape so the status payload never silently loses the block.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getPricingMeta, getModelPricingInfo } = require("../src/lib/pricing");

test("getPricingMeta exposes source, seed age and curated counts", () => {
  const meta = getPricingMeta();
  assert.equal(typeof meta.source, "string");
  assert.ok(meta.source.length > 0, "pricing source must be set (seed sync load)");
  assert.ok(
    typeof meta.seed_generated_at === "string" && !Number.isNaN(Date.parse(meta.seed_generated_at)),
    `seed_generated_at must be an ISO timestamp, got ${meta.seed_generated_at}`,
  );
  assert.ok(meta.litellm_models > 2000, `seed snapshot should carry 2k+ models, got ${meta.litellm_models}`);
  assert.ok(meta.curated_exact > 0, "curated exact overrides must be counted");
  assert.ok(meta.curated_fuzzy > 0, "curated fuzzy overrides must be counted");
});

// The 2026-11-03 gap-fill pair (plan §7): both were real seven-figure-token
// misses in the local queue; pin their curated resolution so a future cleanup
// cannot silently drop them back to unpriced.
test("u2-flash and step-5-preview resolve via curated exact", () => {
  const u2 = getModelPricingInfo("u2-flash", { source: "dsh" });
  assert.equal(u2.status, "priced");
  assert.equal(u2.source, "curated:exact");
  assert.deepEqual(
    { input: u2.input, output: u2.output, cache_read: u2.cache_read },
    { input: 0.14, output: 0.28, cache_read: 0.03 },
  );
  const step = getModelPricingInfo("step-5-preview", { source: "pi-stepfun" });
  assert.equal(step.status, "priced");
  assert.equal(step.source, "curated:exact");
  assert.deepEqual(
    { input: step.input, output: step.output, cache_read: step.cache_read },
    { input: 1, output: 2.7, cache_read: 0.1 },
  );
});
