"use strict";

// WorkBuddy project attribution v2 (2026-11-06). Version 1 wrote project
// buckets with `model: null`, which enqueueTouchedBuckets can never split, so
// every WorkBuddy hour stayed unattributed. The fix pairs the project pass with
// the hourly model and resets only WorkBuddy's project cursors once, dropping
// the model-less buckets so a re-attributed hour cannot double count.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const {
  WORKBUDDY_PROJECT_ATTRIBUTION_VERSION,
  bucketKey,
  dropLegacyWorkbuddyProjectBuckets,
  getProjectBucket,
  projectBucketKey,
} = require("../src/lib/rollout");

const HOUR = "2026-11-05T04:00:00.000Z";
const PROJECT = "acme/app";

function legacyBucket(source) {
  return {
    totals: { total_tokens: 10 },
    queuedKey: null,
    project_key: PROJECT,
    project_ref: "https://github.com/acme/app",
    source,
    hour_start: HOUR,
  };
}

test("the migration version is 2 (model-aware project buckets)", () => {
  assert.equal(WORKBUDDY_PROJECT_ATTRIBUTION_VERSION, 2);
});

test("dropLegacyWorkbuddyProjectBuckets removes only model-less buckets of that variant", () => {
  const state = {
    buckets: {
      [projectBucketKey(PROJECT, "workbuddy", null, HOUR)]: legacyBucket("workbuddy"),
      [projectBucketKey(PROJECT, "workbuddy", "auto", HOUR)]: {
        ...legacyBucket("workbuddy"),
        model: "auto",
      },
      [projectBucketKey(PROJECT, "workbuddy-ai", null, HOUR)]: legacyBucket("workbuddy-ai"),
      [projectBucketKey(PROJECT, "claude", null, HOUR)]: legacyBucket("claude"),
    },
  };

  assert.equal(dropLegacyWorkbuddyProjectBuckets(state, "workbuddy"), 1);
  assert.deepEqual(
    Object.keys(state.buckets).sort(),
    [
      projectBucketKey(PROJECT, "claude", null, HOUR),
      projectBucketKey(PROJECT, "workbuddy", "auto", HOUR),
      projectBucketKey(PROJECT, "workbuddy-ai", null, HOUR),
    ].sort(),
  );
  // Other sources and the other install survive untouched.
  assert.equal(dropLegacyWorkbuddyProjectBuckets(state, "workbuddy"), 0);
});

test("a model-bearing project bucket keys and stores the hourly model", () => {
  const state = { buckets: {} };
  const bucket = getProjectBucket(
    state,
    PROJECT,
    "workbuddy",
    "auto",
    HOUR,
    "https://github.com/acme/app",
  );

  assert.equal(bucket.model, "auto");
  assert.equal(
    projectBucketKey(PROJECT, "workbuddy", "auto", HOUR),
    `${PROJECT}|workbuddy|auto|${HOUR}`,
  );
  // The model key matches the hourly bucket it has to be split against.
  assert.equal(bucketKey("workbuddy", "auto", HOUR), `workbuddy|auto|${HOUR}`);
});
