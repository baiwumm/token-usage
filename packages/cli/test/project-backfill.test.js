"use strict";

// Historical project attribution backfill (2026-11-04): the split must
// reproduce the original hourly aggregate exactly, skip anything ambiguous,
// and only emit rows the contract accepts. These tests cover the pure
// projection used by scripts/archive/project-backfill.cjs.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { buildProjectBackfill } = require("../../../scripts/archive/project-backfill-core.cjs");

const HOUR = "2026-08-25T01:00:00.000Z";

function bucket({ total_tokens = 0, ...overrides } = {}) {
  return {
    source: "opencode",
    model: "model-a",
    hour_start: HOUR,
    input_tokens: total_tokens,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens,
    billable_total_tokens: null,
    total_cost_usd: 0,
    conversation_count: 0,
    ...overrides,
  };
}

function project({ total_tokens = 0, ...overrides } = {}) {
  return {
    project_ref: "https://github.com/owner/repo",
    project_key: "owner/repo",
    source: "opencode",
    hour_start: HOUR,
    input_tokens: total_tokens,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens,
    billable_total_tokens: null,
    total_cost_usd: 0,
    conversation_count: 0,
    ...overrides,
  };
}

function session(overrides = {}) {
  return {
    session_id: "session-1",
    source: "opencode",
    project_key: "repo",
    project_ref: "E:/repos/repo",
    ended_at: "2026-08-25T01:59:00.000Z",
    usage_buckets: {},
    ...overrides,
  };
}

function sessionBucket(overrides = {}) {
  return {
    timestamp: "2026-08-25T01:10:00.000Z",
    model: "model-a",
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    usage_events: 0,
    cost_usd: 0,
    ...overrides,
  };
}

function build({ queueRows = [], projectRows = [], sessionRows = [] }) {
  return buildProjectBackfill({ queueRows, projectRows, sessionRows });
}

function byProject(rows) {
  return new Map(rows.map((row) => [row.project_key, row]));
}

function sumTokens(rows) {
  return rows.reduce((sum, row) => sum + row.total_tokens, 0);
}

test("single-model groups split project totals and keep an exact residual", () => {
  const result = build({
    queueRows: [
      bucket({
        input_tokens: 600,
        cached_input_tokens: 0,
        output_tokens: 400,
        total_tokens: 1000,
        billable_total_tokens: 1000,
        conversation_count: 2,
      }),
    ],
    projectRows: [
      project({
        input_tokens: 500,
        output_tokens: 100,
        total_tokens: 600,
        billable_total_tokens: 600,
        conversation_count: 1,
      }),
    ],
  });

  assert.equal(result.rows.length, 2);
  const rows = byProject(result.rows);
  assert.equal(rows.get("repo").total_tokens, 600);
  assert.equal(rows.get("").total_tokens, 400);
  assert.equal(rows.get("repo").conversation_count, 1);
  assert.equal(rows.get("").conversation_count, 1);
  assert.equal(sumTokens(result.rows), 1000);
  assert.equal(result.stats.emittedGroups, 1);
});

test("fully attributed groups still emit an explicit zero residual", () => {
  const result = build({
    queueRows: [bucket({ total_tokens: 100, billable_total_tokens: 100 })],
    projectRows: [
      project({
        input_tokens: 100,
        total_tokens: 100,
        billable_total_tokens: 100,
      }),
    ],
  });

  assert.equal(result.rows.length, 2);
  const rows = byProject(result.rows);
  assert.equal(rows.get("repo").total_tokens, 100);
  assert.equal(rows.get("").total_tokens, 0);
  assert.equal(result.stats.residualRowsEmitted, 1);
});

test("already attributed hourly groups are never split again", () => {
  const result = build({
    queueRows: [
      bucket({ project_key: "existing", total_tokens: 100, billable_total_tokens: 100 }),
    ],
    projectRows: [
      project({ input_tokens: 100, total_tokens: 100, billable_total_tokens: 100 }),
    ],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.skipReasons.already_attributed, 1);
});

test("project data without a matching hourly aggregate is ignored", () => {
  const result = build({
    projectRows: [
      project({ input_tokens: 100, total_tokens: 100, billable_total_tokens: 100 }),
    ],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.skipReasons.no_main_aggregate, 1);
});

test("multi-model groups without session evidence stay untouched", () => {
  const result = build({
    queueRows: [
      bucket({ model: "model-a", total_tokens: 60, billable_total_tokens: 60 }),
      bucket({ model: "model-b", total_tokens: 40, billable_total_tokens: 40 }),
    ],
    projectRows: [
      project({ input_tokens: 50, total_tokens: 50, billable_total_tokens: 50 }),
    ],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.skipReasons.multi_model_no_session, 1);
});

test("multi-model groups split only when session and project totals agree", () => {
  const result = build({
    queueRows: [
      bucket({
        model: "model-a",
        input_tokens: 60,
        cached_input_tokens: 40,
        total_tokens: 100,
        billable_total_tokens: 100,
        conversation_count: 6,
      }),
      bucket({
        model: "model-b",
        input_tokens: 50,
        total_tokens: 50,
        billable_total_tokens: 50,
        conversation_count: 4,
      }),
    ],
    projectRows: [
      project({
        project_key: "margin",
        input_tokens: 36,
        cached_input_tokens: 24,
        total_tokens: 60,
        billable_total_tokens: 60,
        conversation_count: 3,
      }),
    ],
    sessionRows: [
      session({
        project_key: "margin",
        usage_buckets: {
          0: sessionBucket({
            input_tokens: 36,
            cached_input_tokens: 24,
            total_tokens: 60,
          }),
        },
      }),
      // Session data for a project absent from project.queue.jsonl must not
      // create attribution; it stays in the residual.
      session({
        session_id: "session-2",
        project_key: "default",
        usage_buckets: {
          0: sessionBucket({
            input_tokens: 40,
            total_tokens: 40,
            model: "model-a",
          }),
        },
      }),
    ],
  });

  assert.equal(result.rows.length, 3);
  const margin = result.rows.find(
    (row) => row.project_key === "margin" && row.model === "model-a",
  );
  const residualA = result.rows.find(
    (row) => row.project_key === "" && row.model === "model-a",
  );
  const residualB = result.rows.find(
    (row) => row.project_key === "" && row.model === "model-b",
  );
  assert.equal(margin.total_tokens, 60);
  assert.equal(margin.billable_total_tokens, 60);
  assert.equal(margin.conversation_count, 3);
  assert.equal(residualA.total_tokens, 40);
  assert.equal(residualA.billable_total_tokens, 40);
  assert.equal(residualA.conversation_count, 3);
  assert.equal(residualB.total_tokens, 50);
  assert.equal(residualB.billable_total_tokens, 50);
  assert.equal(residualB.conversation_count, 4);
  assert.equal(sumTokens(result.rows), 150);
  assert.equal(result.groups[0].mode, "multi_model_session");
});

test("only the latest session snapshot contributes project evidence", () => {
  const result = build({
    queueRows: [
      bucket({ model: "model-a", input_tokens: 60, cached_input_tokens: 40, total_tokens: 100, billable_total_tokens: 100 }),
      bucket({ model: "model-b", input_tokens: 50, total_tokens: 50, billable_total_tokens: 50 }),
    ],
    projectRows: [
      project({ input_tokens: 36, cached_input_tokens: 24, total_tokens: 60, billable_total_tokens: 60 }),
    ],
    sessionRows: [
      session({
        ended_at: "2026-08-25T01:30:00.000Z",
        usage_buckets: {
          0: sessionBucket({ input_tokens: 36, cached_input_tokens: 34, total_tokens: 70 }),
        },
      }),
      session({
        ended_at: "2026-08-25T01:59:00.000Z",
        usage_buckets: {
          0: sessionBucket({ input_tokens: 36, cached_input_tokens: 24, total_tokens: 60 }),
        },
      }),
    ],
  });

  assert.equal(result.rows.length, 3);
  const margin = result.rows.find((row) => row.project_key === "repo");
  assert.equal(margin.total_tokens, 60);
  assert.equal(margin.cached_input_tokens, 24);
});

test("session buckets fold onto the collector's half-hour boundaries", () => {
  const hour = "2026-08-25T01:30:00.000Z";
  const result = build({
    queueRows: [
      bucket({ hour_start: hour, total_tokens: 60, billable_total_tokens: 60 }),
      bucket({ hour_start: hour, model: "model-b", total_tokens: 40, billable_total_tokens: 40 }),
    ],
    projectRows: [
      project({ hour_start: hour, input_tokens: 36, total_tokens: 36, billable_total_tokens: 36 }),
    ],
    sessionRows: [
      session({
        usage_buckets: {
          0: sessionBucket({
            timestamp: "2026-08-25T01:40:00.000Z",
            input_tokens: 36,
            total_tokens: 36,
          }),
          1: sessionBucket({
            timestamp: "2026-08-25T01:15:00.000Z",
            input_tokens: 10,
            total_tokens: 10,
          }),
        },
      }),
    ],
  });

  const rows = result.rows.filter((row) => row.model === "model-a");
  assert.equal(rows.find((row) => row.project_key === "repo").total_tokens, 36);
  assert.equal(rows.find((row) => row.project_key === "").total_tokens, 24);
});

test("multi-model session mismatches and unknown models are skipped", () => {
  const queueRows = [
    bucket({ model: "model-a", total_tokens: 100, billable_total_tokens: 100 }),
    bucket({ model: "model-b", total_tokens: 50, billable_total_tokens: 50 }),
  ];
  const projectRows = [
    project({ input_tokens: 60, total_tokens: 60, billable_total_tokens: 60 }),
  ];

  const mismatch = build({
    queueRows,
    projectRows,
    sessionRows: [
      session({
        project_key: "repo",
        usage_buckets: {
          0: sessionBucket({ input_tokens: 70, total_tokens: 70 }),
        },
      }),
    ],
  });
  assert.equal(mismatch.rows.length, 0);
  assert.equal(mismatch.stats.skipReasons.session_project_mismatch, 1);

  const unknownModel = build({
    queueRows,
    projectRows,
    sessionRows: [
      session({
        project_key: "repo",
        usage_buckets: {
          0: sessionBucket({ model: "model-c", input_tokens: 60, total_tokens: 60 }),
        },
      }),
    ],
  });
  assert.equal(unknownModel.rows.length, 0);
  assert.equal(unknownModel.stats.skipReasons.session_model_unknown, 1);
});

test("same-basename projects merge before reaching the wire key", () => {
  const result = build({
    queueRows: [bucket({ total_tokens: 100, billable_total_tokens: 100 })],
    projectRows: [
      project({ project_key: "alice/api", input_tokens: 60, total_tokens: 60, billable_total_tokens: 60 }),
      project({ project_key: "bob/api", input_tokens: 40, total_tokens: 40, billable_total_tokens: 40 }),
    ],
  });

  assert.equal(result.rows.length, 2);
  const rows = byProject(result.rows);
  assert.equal(rows.get("api").total_tokens, 100);
  assert.equal(rows.get("").total_tokens, 0);
});

test("project queue rows are last-wins for one local project identity", () => {
  const result = build({
    queueRows: [bucket({ total_tokens: 100, billable_total_tokens: 100 })],
    projectRows: [
      project({ input_tokens: 60, total_tokens: 60, billable_total_tokens: 60 }),
      project({ input_tokens: 30, total_tokens: 30, billable_total_tokens: 30 }),
    ],
  });

  const rows = byProject(result.rows);
  assert.equal(rows.get("repo").total_tokens, 30);
  assert.equal(rows.get("").total_tokens, 70);
});

test("project totals larger than the hourly aggregate are rejected", () => {
  const result = build({
    queueRows: [bucket({ total_tokens: 100, billable_total_tokens: 100 })],
    projectRows: [
      project({ input_tokens: 120, total_tokens: 120, billable_total_tokens: 120 }),
    ],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.skipReasons.project_exceeds_main, 1);
});

test("all-zero project rows do not create empty attribution rows", () => {
  const result = build({
    queueRows: [bucket({ total_tokens: 100, billable_total_tokens: 100 })],
    projectRows: [project()],
  });

  assert.equal(result.rows.length, 0);
  assert.equal(result.stats.zeroProjectRows, 1);
  assert.equal(result.stats.skipReasons.no_nonzero_project, 1);
});

test("source, hour and project key normalization share the wire identity", () => {
  const result = build({
    queueRows: [
      bucket({
        source: " OpenCode ",
        model: " model-a ",
        total_tokens: 100,
        billable_total_tokens: 100,
      }),
    ],
    projectRows: [
      project({
        source: "OPENCODE",
        hour_start: "2026-08-25T09:00:00+08:00",
        project_key: "public\\repo\\",
        input_tokens: 60,
        total_tokens: 60,
        billable_total_tokens: 60,
      }),
    ],
  });

  const rows = byProject(result.rows);
  assert.equal(rows.get("repo").source, "opencode");
  assert.equal(rows.get("repo").model, "model-a");
  assert.equal(rows.get("repo").hour_start, HOUR);
  assert.equal(rows.get("repo").total_tokens, 60);
  assert.equal(rows.get("").total_tokens, 40);
});

test("cost values are split without changing the group total", () => {
  const result = build({
    queueRows: [
      bucket({
        total_tokens: 100,
        billable_total_tokens: 100,
        total_cost_usd: 1.2,
      }),
    ],
    projectRows: [
      project({
        input_tokens: 60,
        total_tokens: 60,
        billable_total_tokens: 60,
        total_cost_usd: 0.5,
      }),
    ],
  });

  const rows = byProject(result.rows);
  assert.equal(rows.get("repo").total_cost_usd, 0.5);
  assert.equal(rows.get("").total_cost_usd, 0.7);
});
