"use strict";

// Contract v2 (2026-11-03): hourly rows carry project_key (docs/cli-contract.md
// §2.4 "project attribution"). The hourly bucket still owns the aggregate for
// (source, model, hour); project buckets hold the attributed subset. These
// tests pin the split behaviour: rows add up to the unchanged aggregate, a
// bucket without project attribution still writes one unattributed row, and
// different projects in the same (hour, source, model) produce distinct keys.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  bucketKey,
  enqueueTouchedBuckets,
  enqueueTouchedProjectBuckets,
  getProjectBucket,
  initTotals,
  projectBucketKey,
} = require("../src/lib/rollout");

const HOUR = "2026-11-03T02:00:00.000Z";
const SOURCE = "claude";
const MODEL = "claude-x";

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-project-split-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function totals(overrides = {}) {
  return { ...initTotals(), ...overrides };
}

function readQueue(queuePath) {
  if (!fs.existsSync(queuePath)) return [];
  return fs
    .readFileSync(queuePath, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function hourlyStateFor(value, hour = HOUR, model = MODEL) {
  return {
    buckets: {
      [bucketKey(SOURCE, model, hour)]: { totals: value, queuedKey: null },
    },
  };
}

function projectStateFor(projects, hour = HOUR, model = MODEL) {
  const state = { buckets: {} };
  for (const [projectKey, value] of Object.entries(projects)) {
    const bucket = getProjectBucket(
      state,
      projectKey,
      SOURCE,
      model,
      hour,
      `/repo/${projectKey}`,
    );
    bucket.totals = value;
  }
  return state;
}

test("two projects in one (hour, source, model) produce two keys plus a zero residual", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const a = totals({ input_tokens: 60, output_tokens: 40, total_tokens: 100, conversation_count: 1 });
  const b = totals({ input_tokens: 30, output_tokens: 20, total_tokens: 50, conversation_count: 1 });
  const aggregate = totals({
    input_tokens: 90,
    output_tokens: 60,
    total_tokens: 150,
    conversation_count: 2,
  });
  const projectState = projectStateFor({ "proj-a": a, "proj-b": b });
  const hourlyState = hourlyStateFor(aggregate);
  const projectTouched = new Set(Object.keys(projectState.buckets));

  const appended = await enqueueTouchedBuckets({
    queuePath,
    hourlyState,
    touchedBuckets: new Set(Object.keys(hourlyState.buckets)),
    projectState,
    projectTouchedBuckets: projectTouched,
  });

  const rows = readQueue(queuePath);
  assert.equal(appended, 3);
  assert.equal(rows.length, 3);

  const byProject = new Map(rows.map((row) => [row.project_key, row]));
  assert.equal(byProject.get("proj-a").total_tokens, 100);
  assert.equal(byProject.get("proj-b").total_tokens, 50);
  assert.equal(byProject.get("").total_tokens, 0);
  // Same (hour, source, model), different project_key => distinct queue keys.
  for (const row of rows) {
    assert.equal(row.source, SOURCE);
    assert.equal(row.model, MODEL);
    assert.equal(row.hour_start, HOUR);
  }
  const sum = rows.reduce((acc, row) => acc + row.total_tokens, 0);
  assert.equal(sum, aggregate.total_tokens);
});

test("partially attributed usage leaves the remainder in the unattributed residual", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const a = totals({ input_tokens: 60, total_tokens: 100, conversation_count: 1 });
  const aggregate = totals({ input_tokens: 240, total_tokens: 300, conversation_count: 3 });
  const projectState = projectStateFor({ "proj-a": a });
  const hourlyState = hourlyStateFor(aggregate);

  await enqueueTouchedBuckets({
    queuePath,
    hourlyState,
    touchedBuckets: new Set(Object.keys(hourlyState.buckets)),
    projectState,
    projectTouchedBuckets: new Set(Object.keys(projectState.buckets)),
  });

  const rows = readQueue(queuePath);
  const attributed = rows.find((row) => row.project_key === "proj-a");
  const residual = rows.find((row) => row.project_key === "");
  assert.equal(attributed.total_tokens, 100);
  assert.equal(residual.total_tokens, 200);
  assert.equal(rows.reduce((acc, row) => acc + row.total_tokens, 0), 300);
});

test("a bucket without any project attribution keeps the legacy unattributed row", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const aggregate = totals({ input_tokens: 40, total_tokens: 75 });
  const hourlyState = hourlyStateFor(aggregate);

  await enqueueTouchedBuckets({
    queuePath,
    hourlyState,
    touchedBuckets: new Set(Object.keys(hourlyState.buckets)),
  });

  const rows = readQueue(queuePath);
  assert.equal(rows.length, 1);
  // No project_key on the wire: the upload/reconcile identity reads it as "".
  assert.equal(Object.hasOwn(rows[0], "project_key"), false);
  assert.equal(rows[0].total_tokens, 75);
});

test("re-enqueueing an unchanged split is a no-op", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const a = totals({ total_tokens: 100 });
  const b = totals({ total_tokens: 50 });
  const aggregate = totals({ total_tokens: 150 });
  const projectState = projectStateFor({ "proj-a": a, "proj-b": b });
  const hourlyState = hourlyStateFor(aggregate);
  const args = {
    queuePath,
    hourlyState,
    touchedBuckets: new Set(Object.keys(hourlyState.buckets)),
    projectState,
    projectTouchedBuckets: new Set(Object.keys(projectState.buckets)),
  };

  await enqueueTouchedBuckets(args);
  const firstCount = readQueue(queuePath).length;
  const second = await enqueueTouchedBuckets(args);

  assert.equal(second, 0);
  assert.equal(readQueue(queuePath).length, firstCount);
});

test("a project-only touch (hourly totals unchanged) still emits the split rows", async () => {
  const queuePath = path.join(tmpDir, "queue.jsonl");
  const a = totals({ total_tokens: 100 });
  const aggregate = totals({ total_tokens: 100 });
  const projectState = projectStateFor({ "proj-a": a });
  const hourlyState = hourlyStateFor(aggregate);

  const appended = await enqueueTouchedBuckets({
    queuePath,
    hourlyState,
    touchedBuckets: new Set(),
    projectState,
    projectTouchedBuckets: new Set(Object.keys(projectState.buckets)),
  });

  const rows = readQueue(queuePath);
  assert.equal(appended, 2);
  assert.equal(rows.find((row) => row.project_key === "proj-a").total_tokens, 100);
  assert.equal(rows.find((row) => row.project_key === "").total_tokens, 0);
});

test("the local project queue sums the hour's models into one cumulative row", async () => {
  const projectQueuePath = path.join(tmpDir, "project.queue.jsonl");
  const hour = "2026-11-03T03:00:00.000Z";
  const state = { buckets: {} };
  const modelA = getProjectBucket(state, "proj-a", SOURCE, "model-a", hour, "/repo/a");
  modelA.totals = totals({ input_tokens: 10, total_tokens: 20, conversation_count: 1 });
  const modelB = getProjectBucket(state, "proj-a", SOURCE, "model-b", hour, "/repo/a");
  modelB.totals = totals({ input_tokens: 30, total_tokens: 40, conversation_count: 1 });
  const touched = new Set([projectBucketKey("proj-a", SOURCE, "model-a", hour), projectBucketKey("proj-a", SOURCE, "model-b", hour)]);

  const appended = await enqueueTouchedProjectBuckets({
    projectQueuePath,
    projectState: state,
    projectTouchedBuckets: touched,
  });

  const rows = readQueue(projectQueuePath);
  assert.equal(appended, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].project_key, "proj-a");
  assert.equal(rows[0].total_tokens, 60);

  modelA.totals = totals({ input_tokens: 15, total_tokens: 25, conversation_count: 1 });
  await enqueueTouchedProjectBuckets({
    projectQueuePath,
    projectState: state,
    projectTouchedBuckets: new Set([projectBucketKey("proj-a", SOURCE, "model-a", hour)]),
  });
  const after = readQueue(projectQueuePath);
  assert.equal(after.length, 2);
  // Last-wins row still carries the hour's model sum.
  assert.equal(after[1].total_tokens, 65);
});
