// Unit tests for ingest payload normalization — the accepted-shape quirks are
// ported verbatim from the reference (docs/cli-contract.md §2.4).

import { describe, expect, it } from "vitest";

import {
  dedupeBuckets,
  dedupeStates,
  normalizeBucket,
  normalizeSessionState,
} from "@/lib/ingest/normalize";

const VALID_HOUR = "2026-10-21T00:00:00.000Z";

function validBucket(over: Record<string, unknown> = {}) {
  return {
    hour_start: VALID_HOUR,
    source: "codex",
    model: "gpt-5-codex",
    input_tokens: 100,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 50,
    reasoning_output_tokens: 0,
    total_tokens: 150,
    ...over,
  };
}

describe("normalizeBucket", () => {
  it("normalizes a valid bucket", () => {
    const bucket = normalizeBucket(validBucket({ conversation_count: 2, billable_total_tokens: 140 }));
    expect(bucket).toMatchObject({
      hour_start: VALID_HOUR,
      source: "codex",
      model: "gpt-5-codex",
      total_tokens: 150,
      conversations: 2,
      billable_total_tokens: 140,
      total_cost_usd: 0,
    });
  });

  it("accepts the conversations alias", () => {
    expect(normalizeBucket(validBucket({ conversations: 3 }))?.conversations).toBe(3);
    expect(normalizeBucket(validBucket({ conversation_count: 4, conversations: 3 }))?.conversations).toBe(4);
  });

  it("defaults conversations to 0 and cost to 0", () => {
    const bucket = normalizeBucket(validBucket());
    expect(bucket?.conversations).toBe(0);
    expect(bucket?.total_cost_usd).toBe(0);
  });

  it("trims and lowercases source, trims model, applies unknown fallbacks", () => {
    expect(normalizeBucket(validBucket({ source: "  CODEX  " }))?.source).toBe("codex");
    expect(normalizeBucket(validBucket({ model: "  gpt-5-codex  " }))?.model).toBe("gpt-5-codex");
    expect(normalizeBucket(validBucket({ source: "" }))?.source).toBe("unknown");
    expect(normalizeBucket(validBucket({ model: "" }))?.model).toBe("unknown");
  });

  it("caps source at 100 and model at 200 chars", () => {
    expect(normalizeBucket(validBucket({ source: "s".repeat(300) }))?.source).toHaveLength(100);
    expect(normalizeBucket(validBucket({ model: "m".repeat(300) }))?.model).toHaveLength(200);
  });

  it("normalizes hour_start to ISO (ISO forms stay UTC-stable)", () => {
    expect(normalizeBucket(validBucket({ hour_start: "2026-10-21T08:30:00Z" }))?.hour_start).toBe(
      "2026-10-21T08:30:00.000Z",
    );
    // Space-separated forms parse as server-local time (V8 behavior ported
    // verbatim), so only assert that they parse — the wall clock is env-bound.
    const parsed = normalizeBucket(validBucket({ hour_start: "2026-10-21 08:30:00" }));
    expect(Number.isFinite(Date.parse(parsed!.hour_start))).toBe(true);
  });

  it("rejects an unparseable hour_start", () => {
    expect(normalizeBucket(validBucket({ hour_start: "not-a-date" }))).toBeNull();
  });

  it("rejects missing, negative, fractional or unsafe token counts", () => {
    expect(normalizeBucket(validBucket({ total_tokens: undefined }))).toBeNull();
    expect(normalizeBucket(validBucket({ total_tokens: -1 }))).toBeNull();
    expect(normalizeBucket(validBucket({ total_tokens: 1.5 }))).toBeNull();
    expect(normalizeBucket(validBucket({ input_tokens: Number.MAX_SAFE_INTEGER + 1 }))).toBeNull();
  });

  it("coerces numeric strings and null like the reference (Number quirks)", () => {
    expect(normalizeBucket(validBucket({ input_tokens: "42" }))?.input_tokens).toBe(42);
    expect(normalizeBucket(validBucket({ input_tokens: null }))?.input_tokens).toBe(0);
    expect(normalizeBucket(validBucket({ input_tokens: true }))?.input_tokens).toBe(1);
  });

  it("accepts an explicit null billable but rejects a negative one", () => {
    expect(normalizeBucket(validBucket({ billable_total_tokens: null }))?.billable_total_tokens).toBeNull();
    expect(normalizeBucket(validBucket({ billable_total_tokens: -5 }))).toBeNull();
  });

  it("clamps negative or non-finite cost to 0", () => {
    expect(normalizeBucket(validBucket({ total_cost_usd: -1 }))?.total_cost_usd).toBe(0);
    expect(normalizeBucket(validBucket({ total_cost_usd: "abc" }))?.total_cost_usd).toBe(0);
  });

  it("rejects non-object input", () => {
    expect(normalizeBucket(null)).toBeNull();
    expect(normalizeBucket("bucket")).toBeNull();
    expect(normalizeBucket(42)).toBeNull();
  });
});

describe("normalizeSessionState", () => {
  const valid = {
    source: "trae-cn",
    session_id: "session-1",
    model: "hy3-preview",
    bucket_start: "2026-10-21T07:00:00.000Z",
    snapshot_verified_at: "2026-10-21T08:00:00.000Z",
    input_tokens: 100,
    cached_input_tokens: 10,
    cache_creation_input_tokens: 20,
    output_tokens: 70,
    reasoning_output_tokens: 5,
    total_tokens: 200,
  };

  it("accepts a consistent state", () => {
    expect(normalizeSessionState(valid)).toMatchObject({ session_id: "session-1", total_tokens: 200 });
  });

  it("rejects any source other than trae-cn", () => {
    expect(normalizeSessionState({ ...valid, source: "cursor" })).toBeNull();
    expect(normalizeSessionState({ ...valid, source: "" })).toBeNull();
  });

  it("enforces total = input + cached + cache_creation + output", () => {
    expect(normalizeSessionState({ ...valid, total_tokens: 201 })).toBeNull();
  });

  it("reasoning tokens are NOT part of the sum check", () => {
    expect(normalizeSessionState({ ...valid, reasoning_output_tokens: 999 })).not.toBeNull();
  });

  it("rejects missing model, oversize session ids, bad timestamps", () => {
    expect(normalizeSessionState({ ...valid, model: "" })).toBeNull();
    expect(normalizeSessionState({ ...valid, session_id: "s".repeat(257) })).toBeNull();
    expect(normalizeSessionState({ ...valid, bucket_start: "nope" })).toBeNull();
    expect(normalizeSessionState({ ...valid, snapshot_verified_at: "nope" })).toBeNull();
  });

  it("rejects invalid token counts", () => {
    expect(normalizeSessionState({ ...valid, input_tokens: -1 })).toBeNull();
    expect(normalizeSessionState({ ...valid, output_tokens: undefined })).toBeNull();
  });
});

describe("dedupeBuckets", () => {
  it("keeps the largest total_tokens per hour_start|source|model key", () => {
    const a = normalizeBucket(validBucket({ total_tokens: 100 }))!;
    const b = normalizeBucket(validBucket({ total_tokens: 500 }))!;
    const c = normalizeBucket(validBucket({ total_tokens: 300 }))!;
    const deduped = dedupeBuckets([a, b, c]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].total_tokens).toBe(500);
  });

  it("keeps the FIRST of equal totals (strictly-greater comparison)", () => {
    const a = normalizeBucket(validBucket({ total_tokens: 100, input_tokens: 1 }))!;
    const b = normalizeBucket(validBucket({ total_tokens: 100, input_tokens: 2 }))!;
    const deduped = dedupeBuckets([a, b]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].input_tokens).toBe(1);
  });

  it("separates keys by source, model and hour", () => {
    const deduped = dedupeBuckets([
      normalizeBucket(validBucket())!,
      normalizeBucket(validBucket({ source: "claude-code" }))!,
      normalizeBucket(validBucket({ model: "other" }))!,
      normalizeBucket(validBucket({ hour_start: "2026-10-21T01:00:00.000Z" }))!,
    ]);
    expect(deduped).toHaveLength(4);
  });
});

describe("dedupeStates", () => {
  it("last-wins per source|session_id", () => {
    const s1 = normalizeSessionState({
      source: "trae-cn",
      session_id: "s1",
      model: "m",
      bucket_start: "2026-10-21T07:00:00.000Z",
      snapshot_verified_at: "2026-10-21T08:00:00.000Z",
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
    })!;
    const s2 = normalizeSessionState({ ...s1, model: "m2" })!;
    const deduped = dedupeStates([s1, s2]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].model).toBe("m2");
  });
});
