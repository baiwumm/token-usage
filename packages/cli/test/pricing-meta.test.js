"use strict";

// A3 (docs/upstream-comparison-plan.md §1): `status --json` exposes pricing
// data provenance + staleness via getPricingMeta(). This guards the accessor's
// shape so the status payload never silently loses the block.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { getPricingMeta } = require("../src/lib/pricing");

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
