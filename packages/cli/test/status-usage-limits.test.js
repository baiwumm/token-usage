"use strict";

// `tokenusage status --limits` is the only CLI surface for the quota panel
// (docs/sources-capture-audit.md §8). These tests pin the pure formatter: one
// row per configured provider, plan + windows + credits on that row, and the
// provenance that tells a stale log snapshot apart from a live reading.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { formatUsageLimitRows, parseArgs } = require("../src/commands/status");

test("status --limits is opt-in and does not leak into the default parse", () => {
  assert.equal(parseArgs([]).limits, false);
  assert.equal(parseArgs(["--limits"]).limits, true);
  assert.equal(parseArgs(["--json", "--limits"]).limits, true);
  assert.throws(() => parseArgs(["--limit"]), /Unknown option/);
});

test("a live Qoder reading renders plan, both windows, credits and provenance", () => {
  const rows = formatUsageLimitRows({
    fetched_at: "2026-11-05T10:00:00.000Z",
    qoder: {
      configured: true,
      error: null,
      plan_label: "personal_standard",
      primary_window: {
        used_percent: 0,
        used_credits: 0,
        limit_credits: 0,
        remaining_credits: 0,
        reset_at: null,
      },
      tertiary_window: {
        used_percent: 40.80769230769231,
        used_credits: 1061,
        limit_credits: 2600,
        remaining_credits: 1539,
        reset_at: null,
      },
      source: "cli-api",
      provenance: {
        source: "cli-api",
        captured_at: "2026-11-05T10:00:00.000Z",
        stale: false,
        age_seconds: 12,
      },
    },
    qoderCn: { configured: false },
  });

  assert.equal(rows.length, 1);
  const [label, value] = rows[0];
  assert.equal(label, "Limit · Qoder");
  assert.match(value, /^personal_standard, 0%/);
  assert.match(value, /add-on: 40\.8%, 1061\/2600 credits/);
  assert.match(value, /cli-api, 12s ago$/);
  // A zero-credit primary window is still a real reading, never a bare "—".
  assert.match(value, /0%/);
});

test("a log-sourced snapshot keeps its age and stale flag on the row", () => {
  const rows = formatUsageLimitRows({
    qoderCn: {
      configured: true,
      error: null,
      plan_label: null,
      tertiary_window: {
        used_percent: 47.625,
        used_credits: 1143,
        limit_credits: 2400,
        reset_at: null,
      },
      source: "local-log",
      provenance: {
        source: "local-log",
        captured_at: "2026-11-02T01:01:55.790Z",
        stale: true,
        age_seconds: 259_200,
      },
    },
  });

  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], "Limit · Qoder CN");
  assert.match(rows[0][1], /47\.6%, 1143\/2400 credits/);
  assert.match(rows[0][1], /local-log, stale, 3d ago/);
});

test("errors surface on the provider row and unconfigured providers stay hidden", () => {
  const rows = formatUsageLimitRows({
    codex: { configured: true, error: "token expired" },
    claude: { configured: false },
    deepseek: { configured: true, error: null, plan_label: null },
  });

  const labels = rows.map(([label]) => label);
  assert.deepEqual(labels, ["Limit · Codex", "Limit · DeepSeek"]);
  assert.match(rows[0][1], /^error: token expired/);
  assert.equal(rows[1][1], "—");
});

test("missing or empty limits render no rows at all", () => {
  assert.deepEqual(formatUsageLimitRows(null), []);
  assert.deepEqual(formatUsageLimitRows({}), []);
});
