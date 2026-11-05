"use strict";

// The output layer of the CLI is what operators actually read: it ends up in
// runbooks, issue trackers and release checklists. These tests pin the three
// things that made "which machine?" and "how much?" answerable:
//
//   1. every command names the collector machine it ran on
//   2. the sync summary reports tokens / sessions / pending / duration
//   3. the durations and device lines are formatted, not printed raw

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { formatDuration, formatDeviceLine, formatNumber } = require("../src/lib/progress");
const { buildSyncSummaryLines } = require("../src/commands/sync");

const DEVICE = {
  name: "DESKTOP-MHFON1J #48ea790e",
  hostname: "DESKTOP-MHFON1J",
  machine_id: "48ea790e41eab4eccc604bc027f9968cb2d2c00c07186dc144a11e387a591798",
  device_id: "6a074a51-693b-48e3-9f65-0728f9f2ee5c",
};

test("the device line names the machine and its cloud id", () => {
  const line = formatDeviceLine(DEVICE);
  assert.equal(line, "- Device: DESKTOP-MHFON1J #48ea790e (id 6a074a51-693b-48e3-9f65-0728f9f2ee5c)");
});

test("an unpaired machine says so instead of printing a bare name", () => {
  const line = formatDeviceLine({ name: "SOMEHOST", device_id: null });
  assert.match(line, /\(not paired\)/);
});

test("durations read as humans write them", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(430), "430ms");
  assert.equal(formatDuration(1500), "1.5s");
  assert.equal(formatDuration(42000), "42s");
  assert.equal(formatDuration(125000), "2m 05s");
  assert.equal(formatDuration(3_725_000), "1h 02m");
});

test("the sync summary reports tokens, sessions, pending bytes and duration", () => {
  const lines = buildSyncSummaryLines({
    deviceIdentity: DEVICE,
    totalParsed: 30285,
    totalBuckets: 2,
    uploadResult: { inserted: 2, skipped: 0, tokens: 23604640, credits: 0 },
    sessionUploadSummary: { uploaded: 4, pending: 5, upserted: 4, skipped: 1 },
    hasDeviceToken: true,
    pendingBytes: 0,
    durationMs: 7700,
  });

  const text = lines.join("\n");
  assert.match(text, /Sync finished:/);
  assert.match(text, /- Device: DESKTOP-MHFON1J #48ea790e/);
  assert.match(text, /- Parsed files: 30,285/);
  assert.match(text, /- New 30-min buckets queued: 2/);
  // Rows alone are not enough — the token total is the number people care about.
  assert.match(text, /- Uploaded: 2 rows \(23,604,640 tokens\), 0 skipped/);
  assert.match(text, /- Sessions: 4\/5 uploaded \(upserted 4, skipped 1\)/);
  assert.match(text, /- Duration: 7\.7s/);
  assert.ok(!text.includes("Remaining:"), "a drained queue does not claim a backlog");
});

test("a single uploaded row is not written in the plural", () => {
  const text = buildSyncSummaryLines({
    deviceIdentity: DEVICE,
    totalParsed: 1,
    totalBuckets: 1,
    uploadResult: { inserted: 1, skipped: 0, tokens: 10, credits: 0 },
    hasDeviceToken: true,
    durationMs: 8800,
  }).join("\n");

  assert.match(text, /- Uploaded: 1 row \(10 tokens\), 0 skipped/);
});

test("the sync summary keeps the backlog and the warning visible", () => {  const text = buildSyncSummaryLines({
    deviceIdentity: DEVICE,
    totalParsed: 10,
    totalBuckets: 1,
    uploadResult: { inserted: 1, skipped: 0, tokens: 5, credits: 12 },
    hasDeviceToken: true,
    pendingBytes: 2048,
    durationMs: 1200,
    uploadError: new Error("ingest 500"),
    warning: "codex records only",
  }).join("\n");

  assert.match(text, /- Remaining: 2\.00 KB pending \(run sync again, or use --drain\)/);
  assert.match(text, /- Credits: 12/);
  assert.match(text, /- Upload error: ingest 500/);
  assert.match(text, /- Warning: codex records only/);
});

test("without a device token the summary says the upload was skipped", () => {
  const text = buildSyncSummaryLines({
    deviceIdentity: DEVICE,
    totalParsed: 3,
    totalBuckets: 0,
    uploadResult: {},
    hasDeviceToken: false,
    durationMs: 100,
  }).join("\n");

  assert.match(text, /- Uploaded: skipped \(no device token\)/);
  assert.ok(!text.includes("- Remaining:"), "an unpaired machine has no cloud backlog to report");
});

test("counts are thousands-separated", () => {
  assert.equal(formatNumber(1234567), "1,234,567");
  assert.equal(formatNumber("nope"), "0");
});
