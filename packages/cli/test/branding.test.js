// Branding guard (AGENTS.md 硬性约束 9): the product is "Token Usage"; the
// tokentracker name may only survive as a legacy path alias. The vendored
// upstream banner still spelled TOKEN TRACKER until 0.2.3.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

function readSource(...segments) {
  return fs.readFileSync(path.join(__dirname, "..", "src", ...segments), "utf8");
}

test("init's welcome banner uses the Token Usage name", () => {
  const initSource = readSource("commands", "init.js");
  assert.match(initSource, /Token Usage/);
  assert.ok(!initSource.includes("Token Tracker"), "fork branding must not reappear in init");
  assert.ok(!initSource.includes("TRACKER"), "the ASCII logo must spell TOKEN USAGE");
});

test("local-api's fallback device name no longer says Token Tracker", () => {
  const source = readSource("lib", "local-api.js");
  assert.ok(!source.includes("Token Tracker"));
});
