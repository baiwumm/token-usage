"use strict";

// Pricing data parity guard (plan A1, docs/upstream-comparison-plan.md §1).
// Pricing is computed at READ time by the web app (docs/cli-contract.md §2.7)
// and locally by the CLI status paths; both sides ship their own copy of
// seed-snapshot.json / curated-overrides.json. There is no shared package, so
// the two copies can only drift silently — this test makes drift a CI failure.
// When you edit one side, mirror the edit to the other in the same commit.
//
// apps/web/src/lib/pricing/selfhost-overrides.json is web-only by design and
// intentionally NOT covered here.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const path = require("node:path");

const CLI_PRICING_DIR = path.join(__dirname, "..", "src", "lib", "pricing");
const WEB_PRICING_DIR = path.join(__dirname, "..", "..", "..", "apps", "web", "src", "lib", "pricing");

function loadJson(dir, name) {
  // Read + reparse so the comparison is on data, not on module identity.
  return JSON.parse(require("node:fs").readFileSync(path.join(dir, name), "utf8"));
}

test("curated-overrides.json is byte-identical in data between CLI and web", () => {
  const cli = loadJson(CLI_PRICING_DIR, "curated-overrides.json");
  const web = loadJson(WEB_PRICING_DIR, "curated-overrides.json");
  assert.deepEqual(cli, web, "curated-overrides.json drifted between packages/cli and apps/web");
});

test("seed-snapshot.json is byte-identical in data between CLI and web", () => {
  const cli = loadJson(CLI_PRICING_DIR, "seed-snapshot.json");
  const web = loadJson(WEB_PRICING_DIR, "seed-snapshot.json");
  assert.deepEqual(cli, web, "seed-snapshot.json drifted between packages/cli and apps/web");
});

test("curated overrides keep the expected top-level shape", () => {
  const cli = loadJson(CLI_PRICING_DIR, "curated-overrides.json");
  for (const key of ["exact", "alias", "source_exact", "fuzzy"]) {
    assert.ok(cli[key], `curated-overrides.json is missing top-level "${key}"`);
  }
  assert.ok(Array.isArray(cli.fuzzy), "fuzzy must be an array of {match, ref}");
  for (const entry of cli.fuzzy) {
    assert.ok(
      typeof entry.match === "string" && typeof entry.ref === "string" && cli.exact[entry.ref],
      `fuzzy entry ${JSON.stringify(entry)} must reference an existing exact key`,
    );
  }
  for (const [name, rates] of Object.entries(cli.exact)) {
    assert.ok(
      typeof rates.input === "number" && typeof rates.output === "number",
      `exact "${name}" must carry at least numeric input/output rates`,
    );
  }
});
