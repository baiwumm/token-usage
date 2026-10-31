// Unit tests for ingest payload normalization — the accepted-shape quirks are
// ported verbatim from the reference (docs/cli-contract.md §2.4).

import { describe, expect, it } from "vitest";

import {
  dedupeBuckets,
  dedupeSessions,
  dedupeStates,
  isAccountLevelSessionSource,
  MAX_BUCKET_CREDITS,
  MAX_BUCKET_COST_USD,
  normalizeBucket,
  normalizeProjectKey,
  normalizeSession,
  normalizeSessionSource,
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

  it("clamps per-row cost at MAX_BUCKET_COST_USD (§2.4, forged-cost cap)", () => {
    expect(normalizeBucket(validBucket({ total_cost_usd: 9.5 }))?.total_cost_usd).toBe(9.5);
    expect(normalizeBucket(validBucket({ total_cost_usd: 10 }))?.total_cost_usd).toBe(10);
    expect(normalizeBucket(validBucket({ total_cost_usd: 1234.56 }))?.total_cost_usd).toBe(MAX_BUCKET_COST_USD);
  });

  it("defaults credits to 0 and coerces numeric strings like the reference", () => {
    expect(normalizeBucket(validBucket())?.credits).toBe(0);
    expect(normalizeBucket(validBucket({ credits: "0.5" }))?.credits).toBe(0.5);
    expect(normalizeBucket(validBucket({ credits: null }))?.credits).toBe(0);
  });

  it("rounds credits to 6 decimals and clamps negatives and non-finite to 0", () => {
    expect(normalizeBucket(validBucket({ credits: 0.1234567 }))?.credits).toBe(0.123457);
    expect(normalizeBucket(validBucket({ credits: -1 }))?.credits).toBe(0);
    expect(normalizeBucket(validBucket({ credits: "abc" }))?.credits).toBe(0);
  });

  it("clamps per-row credits at MAX_BUCKET_CREDITS (§2.4)", () => {
    expect(normalizeBucket(validBucket({ credits: 999_999.5 }))?.credits).toBe(999_999.5);
    expect(normalizeBucket(validBucket({ credits: 2_000_000 }))?.credits).toBe(MAX_BUCKET_CREDITS);
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

function validSession(over: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    source: "codex",
    started_at: "2026-10-21T09:00:00.000Z",
    ended_at: "2026-10-21T09:30:00.000Z",
    project_key: "/home/me/projects/demo/",
    input_tokens: 100,
    cached_input_tokens: 10,
    cache_creation_input_tokens: 20,
    output_tokens: 70,
    reasoning_output_tokens: 5,
    total_tokens: 200,
    billable_total_tokens: null,
    models: [
      {
        model: "gpt-5-codex",
        input_tokens: 100,
        cached_input_tokens: 10,
        cache_creation_input_tokens: 20,
        output_tokens: 70,
        reasoning_output_tokens: 5,
        total_tokens: 200,
      },
    ],
    ...over,
  };
}

describe("normalizeSessionSource", () => {
  it("trims, lowercases, caps at 100 and falls back to unknown", () => {
    expect(normalizeSessionSource("  CODEX  ")).toBe("codex");
    expect(normalizeSessionSource("")).toBe("unknown");
    expect(normalizeSessionSource(null)).toBe("unknown");
    expect(normalizeSessionSource("s".repeat(300))).toHaveLength(100);
  });

  it("recognizes account-level sources", () => {
    expect(isAccountLevelSessionSource("cursor")).toBe(true);
    expect(isAccountLevelSessionSource("trae-cn")).toBe(true);
    expect(isAccountLevelSessionSource("codex")).toBe(false);
  });
});

describe("normalizeProjectKey", () => {
  it("keeps only the basename for POSIX and Windows paths", () => {
    expect(normalizeProjectKey("/home/me/projects/demo/")).toBe("demo");
    expect(normalizeProjectKey("C:\\Users\\me\\repo\\")).toBe("repo");
    expect(normalizeProjectKey("repo")).toBe("repo");
  });

  it("strips control characters and truncates to 120", () => {
    expect(normalizeProjectKey("/tmp/\u0007proj\u0007")).toBe("proj");
    expect(normalizeProjectKey(`/tmp/${"x".repeat(200)}`)).toHaveLength(120);
  });

  it("maps empty, dot and dot-dot basenames to null", () => {
    for (const value of [null, undefined, "", "/", ".", "..", "/tmp/."]) {
      expect(normalizeProjectKey(value)).toBeNull();
    }
  });
});

describe("normalizeSession", () => {
  it("normalizes a valid session", () => {
    const session = normalizeSession(validSession());
    expect(session).toMatchObject({
      session_id: "session-1",
      source: "codex",
      started_at: "2026-10-21T09:00:00.000Z",
      ended_at: "2026-10-21T09:30:00.000Z",
      project_key: "demo",
      total_tokens: 200,
      billable_total_tokens: null,
    });
    expect(session?.models).toHaveLength(1);
  });

  it("rejects path separators and control characters in session_id", () => {
    for (const sessionId of ["a/b", "a\\b", "a\u0007b", "", "s".repeat(257)]) {
      expect(normalizeSession(validSession({ session_id: sessionId }))).toBeNull();
    }
  });

  it("rejects account-level sources", () => {
    expect(normalizeSession(validSession({ source: "cursor" }))).toBeNull();
    expect(normalizeSession(validSession({ source: "TRAE-CN" }))).toBeNull();
  });

  it("rejects reversed or unparseable timestamps", () => {
    expect(
      normalizeSession(
        validSession({ ended_at: "2026-10-21T08:59:59.000Z" }),
      ),
    ).toBeNull();
    expect(normalizeSession(validSession({ started_at: "nope" }))).toBeNull();
    expect(normalizeSession(validSession({ ended_at: "nope" }))).toBeNull();
  });

  it("enforces total = input + cached + cache_creation + output", () => {
    expect(normalizeSession(validSession({ total_tokens: 201 }))).toBeNull();
    expect(
      normalizeSession(validSession({ reasoning_output_tokens: 999 })),
    ).not.toBeNull();
  });

  it("accepts null or a non-negative billable and rejects negatives", () => {
    expect(
      normalizeSession(validSession({ billable_total_tokens: null }))
        ?.billable_total_tokens,
    ).toBeNull();
    expect(
      normalizeSession(validSession({ billable_total_tokens: 180 }))
        ?.billable_total_tokens,
    ).toBe(180);
    expect(
      normalizeSession(validSession({ billable_total_tokens: -1 })),
    ).toBeNull();
  });

  it("merges duplicate model names and requires the sums to match", () => {
    const merged = normalizeSession(
      validSession({
        models: [
          {
            model: "gpt-5-codex",
            input_tokens: 60,
            cached_input_tokens: 10,
            cache_creation_input_tokens: 20,
            output_tokens: 10,
            reasoning_output_tokens: 5,
            total_tokens: 100,
          },
          {
            model: " gpt-5-codex ",
            input_tokens: 40,
            cached_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 60,
            reasoning_output_tokens: 0,
            total_tokens: 100,
          },
        ],
      }),
    );

    expect(merged?.models).toEqual([
      {
        model: "gpt-5-codex",
        input_tokens: 100,
        cached_input_tokens: 10,
        cache_creation_input_tokens: 20,
        output_tokens: 70,
        reasoning_output_tokens: 5,
        total_tokens: 200,
      },
    ]);
  });

  it("rejects bad model arrays, per-model sums and overall sums", () => {
    expect(normalizeSession(validSession({ models: "nope" }))).toBeNull();
    expect(
      normalizeSession(validSession({ models: [null] })),
    ).toBeNull();
    expect(
      normalizeSession(
        validSession({
          models: [{ ...validSession().models[0], total_tokens: 199 }],
        }),
      ),
    ).toBeNull();
    expect(
      normalizeSession(
        validSession({
          models: [
            {
              model: "other",
              input_tokens: 1,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
              output_tokens: 0,
              reasoning_output_tokens: 0,
              total_tokens: 1,
            },
          ],
        }),
      ),
    ).toBeNull();
    expect(
      normalizeSession(
        validSession({
          models: Array.from({ length: 33 }, () => validSession().models[0]),
        }),
      ),
    ).toBeNull();
  });

  it("allows missing or empty models (cost is then zero)", () => {
    expect(normalizeSession(validSession({ models: undefined }))?.models).toEqual([]);
    expect(normalizeSession(validSession({ models: [] }))?.models).toEqual([]);
  });
});

describe("dedupeSessions", () => {
  const at = (sessionId: string, endedAt: string, total: number, project: string) =>
    normalizeSession(
      validSession({
        session_id: sessionId,
        ended_at: endedAt,
        input_tokens: total,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: total,
        models: [],
        project_key: project,
      }),
    )!;

  it("keeps the latest ended_at per source|session_id", () => {
    const deduped = dedupeSessions([
      at("s1", "2026-10-21T09:10:00.000Z", 10, "early"),
      at("s1", "2026-10-21T09:40:00.000Z", 10, "late"),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].project_key).toBe("late");
  });

  it("breaks equal ended_at ties by total, then by later entry", () => {
    const deduped = dedupeSessions([
      at("s1", "2026-10-21T09:40:00.000Z", 20, "bigger"),
      at("s1", "2026-10-21T09:40:00.000Z", 10, "smaller"),
      at("s1", "2026-10-21T09:40:00.000Z", 20, "later-equal"),
    ]);
    expect(deduped).toHaveLength(1);
    expect(deduped[0].project_key).toBe("later-equal");
  });

  it("keeps different sources and session ids apart", () => {
    const deduped = dedupeSessions([
      at("s1", "2026-10-21T09:40:00.000Z", 10, "a"),
      at("s2", "2026-10-21T09:40:00.000Z", 10, "b"),
      normalizeSession(validSession({ source: "claude-code" }))!,
    ]);
    expect(deduped).toHaveLength(3);
  });
});
