"use strict";

// Source wiring completeness. sync-sources.test.js covers the --source side
// (normalizeSyncSource accepts registered ids); this covers the scan side:
//   - every id registered in AUTO_SYNC_SOURCES must have at least one
//     sourceAllowed("...") branch in cmdSync, otherwise auto/background runs
//     skip it silently while --source still validates (the Prime Agent
//     incident, one step later in the wiring);
//   - every sourceAllowed("...") literal must be a registered id, otherwise
//     the branch can never match any scope (typo → silent skip);
//   - alias targets and the background registry stay subsets of the registry.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const {
  AUTO_SYNC_SOURCES,
  AUTO_SYNC_SOURCE_ALIASES,
  BACKGROUND_AUTO_SYNC_SOURCES,
} = require("../src/commands/sync");

const syncJsPath = path.join(__dirname, "..", "src", "commands", "sync.js");
const syncJs = fs.readFileSync(syncJsPath, "utf8");

function extractSourceAllowedLiterals(source) {
  const literals = [];
  const callRe = /sourceAllowed\(([^)]*)\)/g;
  let call;
  while ((call = callRe.exec(source)) !== null) {
    const argRe = /['"]([a-z0-9-]+)['"]/g;
    let arg;
    while ((arg = argRe.exec(call[1])) !== null) literals.push(arg[1]);
  }
  return literals;
}

test("registry extraction stays meaningful (the source contract did not move)", () => {
  assert.ok(
    AUTO_SYNC_SOURCES.size >= 40,
    `AUTO_SYNC_SOURCES unexpectedly small (${AUTO_SYNC_SOURCES.size}) — if the registry moved, update this test`,
  );
  assert.ok(
    extractSourceAllowedLiterals(syncJs).length >= 40,
    "sourceAllowed literal extraction found too few call sites — the scan-branch contract moved",
  );
});

test("every sourceAllowed literal is a registered source id", () => {
  const unregistered = extractSourceAllowedLiterals(syncJs)
    .filter((id) => !AUTO_SYNC_SOURCES.has(id));
  assert.deepEqual(
    [...new Set(unregistered)],
    [],
    "sourceAllowed() literals that can never match a scope (typo or missing registry entry) — every auto run would skip them silently",
  );
});

test("every registered source has at least one sourceAllowed scan branch", () => {
  const literals = new Set(extractSourceAllowedLiterals(syncJs));
  const orphaned = [...AUTO_SYNC_SOURCES].filter((id) => !literals.has(id));
  assert.deepEqual(
    orphaned,
    [],
    "registered sources with no scan branch — --source accepts them but every auto/background run skips them silently (Prime Agent class)",
  );
});

test("alias targets are registered source ids", () => {
  for (const [alias, target] of AUTO_SYNC_SOURCE_ALIASES) {
    assert.ok(
      AUTO_SYNC_SOURCES.has(target),
      `alias "${alias}" resolves to unregistered id "${target}"`,
    );
  }
});

test("background sync sources are a subset of the auto registry", () => {
  for (const id of BACKGROUND_AUTO_SYNC_SOURCES) {
    assert.ok(AUTO_SYNC_SOURCES.has(id), `background source "${id}" is not registered for auto sync`);
  }
});

test("registry ids are normalized collector ids (lowercase kebab)", () => {
  for (const id of AUTO_SYNC_SOURCES) {
    assert.match(id, /^[a-z0-9-]+$/, `source id "${id}" is not a normalized collector id`);
  }
});
