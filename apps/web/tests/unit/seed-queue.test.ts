// Unit tests for the queue reconciliation parser (scripts/selfhost/seed-queue.cjs).
// The last-wins bucket map it computes is the reconciliation baseline: it must
// equal both what the tables hold after seeding and what account-summary reports.

import { describe, expect, it } from "vitest";

import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { parseQueue } = require("../../../../scripts/selfhost/seed-queue.cjs") as {
  parseQueue: (text: string) => {
    buckets: Array<Record<string, unknown>>;
    states: Array<Record<string, unknown>>;
    malformed: number;
  };
};

function queueLine(row: Record<string, unknown>): string {
  return JSON.stringify({ hour_start: "2026-10-21T00:00:00.000Z", source: "codex", model: "m", total_tokens: 100, ...row });
}

describe("seed-queue parseQueue", () => {
  it("computes the last-wins bucket map keyed by hour|source|model", () => {
    // The queue is append-only: the LATEST row per key wins (not the max) —
    // this is the reconciliation baseline's last-wins semantics.
    const { buckets } = parseQueue(
      [
        queueLine({ total_tokens: 100 }),
        queueLine({ total_tokens: 900 }),
        queueLine({ total_tokens: 500 }), // same key → last row wins
        queueLine({ source: "claude-code", total_tokens: 10 }),
      ].join("\n"),
    );
    expect(buckets).toHaveLength(2);
    const main = buckets.find((b) => b.source === "codex");
    expect(main?.total_tokens).toBe(500);
  });

  it("skips watermarks and keeps only trae-cn session states, last-wins", () => {
    const state = {
      kind: "account_session_state",
      source: "trae-cn",
      session_id: "s1",
      model: "m",
      bucket_start: "2026-10-21T07:00:00.000Z",
      snapshot_verified_at: "2026-10-21T08:00:00.000Z",
      input_tokens: 1,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 2,
      reasoning_output_tokens: 0,
      total_tokens: 3,
    };
    const { buckets, states } = parseQueue(
      [
        JSON.stringify({ kind: "account_sync_watermark", cursor: "x" }),
        JSON.stringify(state),
        JSON.stringify({ ...state, total_tokens: 30 }),
        JSON.stringify({ ...state, source: "cursor", session_id: "s2" }), // non-trae ignored
      ].join("\n"),
    );
    expect(buckets).toHaveLength(0);
    expect(states).toHaveLength(1);
    expect(states[0].total_tokens).toBe(30);
  });

  it("counts malformed lines and tolerates blank lines", () => {
    const { malformed, buckets } = parseQueue(
      ["", "not-json", queueLine({}), "{broken", ""].join("\n"),
    );
    expect(malformed).toBe(2);
    expect(buckets).toHaveLength(1);
  });

  it("normalizes hour_start to ISO and defaults safe values", () => {
    const { buckets } = parseQueue(
      [JSON.stringify({ hour_start: "2026-10-21T05:00:00Z", source: " CODEX ", model: "", input_tokens: "7", billable_total_tokens: null, total_cost_usd: -3 })].join("\n"),
    );
    expect(buckets[0]).toMatchObject({
      hour_start: "2026-10-21T05:00:00.000Z",
      source: "codex",
      model: "unknown",
      input_tokens: 7,
      billable_total_tokens: null,
      conversations: 0,
      total_cost_usd: 0,
    });
  });

  it("rejects rows with an unparseable hour_start as malformed", () => {
    const { malformed, buckets } = parseQueue(
      [JSON.stringify({ hour_start: "garbage", source: "codex", total_tokens: 5 })].join("\n"),
    );
    expect(malformed).toBe(1);
    expect(buckets).toHaveLength(0);
  });
});
