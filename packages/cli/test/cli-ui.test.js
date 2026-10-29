"use strict";

// init summary rows: skipped call-sites already include a "Skipped (...)"
// detail, while formatSummaryLine added its own "Skipped - " prefix. The
// result was "Skipped - Skipped (--no-integrations)" (0.2.4 acceptance).
// Keep the double prefix out without changing the success rows.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { formatSummaryLine } = require("../src/lib/cli-ui");

test("a detail that already starts with Skipped is not prefixed twice", () => {
  const line = formatSummaryLine({
    label: "Integrations",
    status: "skipped",
    detail: "Skipped (--no-integrations); tool configs stay untouched",
  });
  assert.ok(line.includes("[Skipped (--no-integrations); tool configs stay untouched]"), line);
  assert.ok(!line.includes("Skipped - Skipped"), line);
});

test("a plain skipped detail still gets the Skipped - prefix", () => {
  const line = formatSummaryLine({
    label: "Runtime copy",
    status: "skipped",
    detail: "not installed",
  });
  assert.ok(line.includes("[Skipped - not installed]"), line);
});

test("skipped rows without a detail keep the bare label", () => {
  const line = formatSummaryLine({
    label: "Scheduled task",
    status: "skipped",
  });
  assert.ok(line.includes("[Skipped]"), line);
});

test("success rows keep their detail text untouched", () => {
  const line = formatSummaryLine({
    label: "Claude Code",
    status: "installed",
    detail: "hook -> ~/.claude/settings.json",
  });
  assert.ok(line.includes("[hook -> ~/.claude/settings.json]"), line);
});
