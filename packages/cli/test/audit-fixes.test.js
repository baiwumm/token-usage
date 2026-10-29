"use strict";

// Regression tests for the five audit P2 fixes shipped in 0.2.0
// (docs/cli-release.md §四 "正确性修复"):
//   1. init.js dead constant www.tokenusage.cc (stale domain gone);
//   2. zcode restoration rows carry billable_total_tokens / total_cost_usd;
//   3. bucket-key `|` round-trip with model names that contain `|`;
//   4. OpenCode signed-delta chain never leaves negative bucket totals;
//   5. runtime-config env names TOKENUSAGE_BASE_URL / TOKENUSAGE_ANON_KEY
//      (INSFORGE_* stay as legacy fallbacks).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  zcodeRowTotals,
  buildZcodeRestorationRow,
} = require("../src/commands/sync");
const {
  installLocalTrackerApp,
} = require("../src/commands/init");
const {
  parseBucketKey,
  bucketKey,
  diffOpencodeTotals,
  clampTotalsNonNegative,
} = require("../src/lib/rollout");
const {
  DEFAULT_BASE_URL,
  DEFAULT_DASHBOARD_URL,
  resolveRuntimeConfig,
} = require("../src/lib/runtime-config");

test("fix 1: init.js no longer ships the stale www.tokenusage.cc constant", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "commands", "init.js"),
    "utf8",
  );
  assert.ok(!source.includes("www.tokenusage.cc"), "stale domain must not reappear in init.js");
  // The effective default stays the production deployment in runtime-config.
  assert.equal(DEFAULT_BASE_URL, "https://token-usage.baiwumm.com");
  assert.equal(DEFAULT_DASHBOARD_URL, DEFAULT_BASE_URL);
});

test("fix 2: zcode totals fill billable/cost so restoration rows match the queue schema", () => {
  // A legacy backup row without the two columns…
  const legacy = {
    input_tokens: 100,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 50,
    reasoning_output_tokens: 0,
    total_tokens: 150,
    conversation_count: 1,
  };
  const totals = zcodeRowTotals(legacy);
  // …restores with billable = total (zcode plan-included usage counts) and a
  // defined cost column (read-side pricing recomputes it).
  assert.equal(totals.billable_total_tokens, 150);
  assert.equal(totals.total_cost_usd, 0);

  const row = buildZcodeRestorationRow({
    model: "glm-4.6",
    hour_start: "2026-10-27T09:30:00.000Z",
    totals,
  });
  assert.equal(row.source, "zcode");
  assert.equal(row.model, "glm-4.6");
  assert.equal(row.hour_start, "2026-10-27T09:30:00.000Z");
  assert.equal(row.billable_total_tokens, 150);
  assert.equal(row.total_cost_usd, 0);
  assert.equal(row.conversation_count, 1);

  // Rows that DO carry the columns keep their values.
  const modern = zcodeRowTotals({
    total_tokens: 10,
    billable_total_tokens: 4,
    total_cost_usd: 0.25,
  });
  assert.equal(modern.billable_total_tokens, 4);
  assert.equal(modern.total_cost_usd, 0.25);
});

test("fix 3: bucket keys round-trip model names containing the | separator", () => {
  const model = "deepseek|v3.2";
  const hour = "2026-10-27T09:30:00.000Z";
  const key = bucketKey("opencode", model, hour);
  assert.equal(key, `opencode|${model}|${hour}`);

  const parsed = parseBucketKey(key);
  assert.equal(parsed.source, "opencode");
  assert.equal(parsed.model, model);
  assert.equal(parsed.hourStart, hour);

  // Group keys (source|hour) keep parsing without a model segment…
  const group = parseBucketKey("zcode|2026-10-27T09:30:00.000Z");
  assert.equal(group.source, "zcode");
  assert.equal(group.model, "unknown");
  assert.equal(group.hourStart, "2026-10-27T09:30:00.000Z");

  // …and the zcode rebuild helper in sync.js shares the last-segment rule.
  // (zcodeHourFromMainBucketKey is covered indirectly via the exported pure
  // helpers; the semantics are identical: hour = after the LAST separator.)
  const zcodeKey = `zcode|glm|4.5|${hour}`;
  assert.equal(parseBucketKey(zcodeKey).hourStart, hour);
  assert.equal(parseBucketKey(zcodeKey).model, "glm|4.5");
});

test("fix 4: signed OpenCode deltas never leave negative bucket totals", () => {
  const previous = {
    input_tokens: 100,
    cached_input_tokens: 10,
    cache_creation_input_tokens: 0,
    output_tokens: 60,
    reasoning_output_tokens: 20,
    total_tokens: 190,
  };
  const corrected = {
    input_tokens: 10,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 5,
    reasoning_output_tokens: 0,
    total_tokens: 15,
  };
  const delta = diffOpencodeTotals(corrected, previous);
  assert.ok(delta, "a correction produces a signed delta");
  assert.equal(delta.total_tokens, -175);

  // A correction whose prior contribution is NOT in the bucket anymore (lost
  // cursor, fork-dedup removal) drives the bucket negative without the clamp.
  const bucketTotals = {
    input_tokens: 60,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 40,
    reasoning_output_tokens: 0,
    total_tokens: 100,
    billable_total_tokens: 100,
    total_cost_usd: 0.2,
    conversation_count: 2,
  };
  for (const key of Object.keys(delta)) {
    bucketTotals[key] = (bucketTotals[key] || 0) + delta[key];
  }
  clampTotalsNonNegative(bucketTotals);
  for (const key of ["input_tokens", "cached_input_tokens", "cache_creation_input_tokens", "output_tokens", "reasoning_output_tokens", "total_tokens", "billable_total_tokens", "total_cost_usd", "conversation_count"]) {
    assert.ok(bucketTotals[key] >= 0, `${key} must stay non-negative (got ${bucketTotals[key]})`);
  }
  assert.equal(bucketTotals.total_tokens, 0);

  // A correction that stays positive passes through untouched (no clamp).
  const healthy = {
    input_tokens: 150,
    cached_input_tokens: 10,
    cache_creation_input_tokens: 0,
    output_tokens: 80,
    reasoning_output_tokens: 20,
    total_tokens: 260,
  };
  for (const key of Object.keys(delta)) {
    healthy[key] = (healthy[key] || 0) + delta[key];
  }
  clampTotalsNonNegative(healthy);
  assert.equal(healthy.total_tokens, 85);
  assert.equal(healthy.input_tokens, 60);
});

test("fix 5: TOKENUSAGE_BASE_URL/TOKENUSAGE_ANON_KEY win; INSFORGE_* remain legacy fallbacks", () => {
  // New primary name.
  const primary = resolveRuntimeConfig({
    env: { TOKENUSAGE_BASE_URL: "https://self-hosted.example" },
  });
  assert.equal(primary.baseUrl, "https://self-hosted.example");
  assert.equal(primary.sources.baseUrl, "env");

  // New anon-key name resolves alongside the new base-url name.
  const withKey = resolveRuntimeConfig({
    env: {
      TOKENUSAGE_BASE_URL: "https://self-hosted.example",
      TOKENUSAGE_ANON_KEY: "anon_" + "a".repeat(64),
    },
  });
  assert.equal(withKey.anonKey, "anon_" + "a".repeat(64));
  assert.equal(withKey.configurationError, null);

  // Legacy INSFORGE_* names keep working (existing scripts/installs).
  const legacy = resolveRuntimeConfig({
    env: { TOKENUSAGE_INSFORGE_BASE_URL: "https://legacy.example" },
  });
  assert.equal(legacy.baseUrl, "https://legacy.example");

  // The new name wins when both are set.
  const both = resolveRuntimeConfig({
    env: {
      TOKENUSAGE_BASE_URL: "https://new.example",
      TOKENUSAGE_INSFORGE_BASE_URL: "https://old.example",
    },
  });
  assert.equal(both.baseUrl, "https://new.example");
});

test("no stale dashboard constants in init output", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "src", "commands", "init.js"),
    "utf8",
  );
  // The welcome/success banners print the configured dashboard URL; the old
  // hardcoded TokenTracker default must not reappear in either renderer.
  assert.ok(!source.includes("localhost:7680"), "stale localhost dashboard must not reappear in init.js");
});

test("init's runtime copy works from the published layout (bin/tokenusage.js)", async () => {
  // 0.1.0–0.2.1 shipped without bin/tracker.js (the fork renamed the bin to
  // tokenusage.js but the installer kept the old name), so `tokenusage init`
  // crashed with ENOENT on every fresh npm install. The unit suite never ran
  // this path: init tests set TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY=1.
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tu-init-copy-"));
  const appDir = path.join(home, "tracker", "app");
  try {
    const result = await installLocalTrackerApp({ appDir });
    assert.equal(result.ok, true, `installation reported a failure: ${JSON.stringify(result)}`);
    assert.ok(fs.existsSync(path.join(appDir, "bin", "tracker.js")), "app/bin/tracker.js copied");
    assert.ok(fs.existsSync(path.join(appDir, "src", "cli.js")), "app/src copied");
    assert.ok(fs.existsSync(path.join(appDir, "package.json")), "app/package.json copied");
    // 0.2.4: the copy must be self-contained. npm links nothing, but pnpm links
    // deps as junctions into a shared store — copying those links produced a
    // runtime that died with MODULE_NOT_FOUND (one node_modules entry, no deps).
    assert.ok(
      fs.existsSync(path.join(appDir, "node_modules", "smol-toml")),
      "declared dependency copied as a real directory",
    );
    assert.ok(
      fs.existsSync(path.join(appDir, "node_modules", "pend")),
      "transitive dependency of yauzl copied too (flattened closure)",
    );
    // The marker is what every spawn point probes: without it hooks fall back
    // to the installed CLI instead of spawning a half copy.
    const markerPath = path.join(appDir, ".runtime-ready");
    assert.ok(fs.existsSync(markerPath), ".runtime-ready written only after the copy booted");
    const marker = JSON.parse(fs.readFileSync(markerPath, "utf8"));
    assert.equal(marker.version, require("../package.json").version);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
