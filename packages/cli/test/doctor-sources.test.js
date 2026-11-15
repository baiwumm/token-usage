"use strict";

// sources.coverage (doctor): per-source newest bucket + the "silent over 7d"
// list, so a collection audit does not need an ad-hoc queue scan.

const assert = require("node:assert/strict");
const { test } = require("node:test");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { buildDoctorReport } = require("../src/lib/doctor");

function hourIso(ms) {
  const d = new Date(ms);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

function bucket({ hour, source, model = "gpt-4o", total = 10 }) {
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
    conversation_count: 1,
  };
}

async function withFixtureTracker(t, lines) {
  const trackerDir = await fs.mkdtemp(path.join(os.tmpdir(), "tokenusage-sources-"));
  t.after(async () => {
    await fs.rm(trackerDir, { recursive: true, force: true });
  });
  await fs.writeFile(
    path.join(trackerDir, "queue.jsonl"),
    lines.map((line) => JSON.stringify(line)).join("\n") + "\n",
    "utf8",
  );
  return trackerDir;
}

async function coverageCheck(trackerDir, now) {
  const report = await buildDoctorReport({
    paths: { trackerDir },
    // Offline: the network probe is unrelated to this check.
    fetch: async () => ({ status: 200 }),
    now: () => new Date(now),
  });
  return report.checks.find((check) => check.id === "sources.coverage");
}

test("reports the newest bucket per source and lists the silent ones", async (t) => {
  const now = Date.now();
  const trackerDir = await withFixtureTracker(t, [
    bucket({ hour: hourIso(now - 3600_000), source: "opencode", total: 100 }),
    bucket({ hour: hourIso(now - 3 * 3600_000), source: "opencode", total: 50 }),
    bucket({ hour: hourIso(now - 2 * 86_400_000), source: "zcode", total: 7 }),
    bucket({ hour: hourIso(now - 20 * 86_400_000), source: "qoder-cn", total: 0 }),
  ]);

  const check = await coverageCheck(trackerDir, now);
  assert.equal(check.status, "ok", "a bucket from the last hour keeps the check green");
  assert.match(check.detail, /3 source\(s\) in the last 30d/);
  assert.match(check.detail, /newest opencode/);
  assert.match(check.detail, /1 silent over 7d: qoder-cn 20d/);
  assert.deepEqual(
    check.meta.sources.map((entry) => entry.source),
    ["opencode", "zcode", "qoder-cn"],
  );
  const opencode = check.meta.sources[0];
  assert.equal(opencode.buckets, 2, "same-source buckets aggregate");
  assert.equal(opencode.tokens, 150);
  assert.equal(opencode.last_hour_start, hourIso(now - 3600_000));
});

test("warns when the whole queue has been silent for over a week", async (t) => {
  const now = Date.now();
  const trackerDir = await withFixtureTracker(t, [
    bucket({ hour: hourIso(now - 9 * 86_400_000), source: "codex", total: 42 }),
  ]);

  const check = await coverageCheck(trackerDir, now);
  assert.equal(check.status, "warn");
  assert.match(check.detail, /newest codex 9d ago/);
});

test("buckets older than the window are ignored, and an empty queue is not a warning", async (t) => {
  const now = Date.now();
  const trackerDir = await withFixtureTracker(t, [
    bucket({ hour: hourIso(now - 40 * 86_400_000), source: "codex", total: 42 }),
  ]);

  const check = await coverageCheck(trackerDir, now);
  assert.equal(check.status, "ok");
  assert.equal(check.detail, "no local buckets in the last 30d");
  assert.deepEqual(check.meta.sources, []);
});
