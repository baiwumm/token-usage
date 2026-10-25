// Golden contract tests for ingest (docs/cli-contract.md §2.4; §3 invariants
// 2 — the last-wins upsert baseline — and 8 partially).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as ingestPost } from "@/app/api/functions/token-usage-ingest/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  TOKEN_A,
  TOKEN_ON_REVOKED_DEVICE,
  TOKEN_REVOKED,
  base,
  initContractEnv,
  jsonRequest,
  rawRequest,
  seedScenario,
} from "./helpers";

const fake = new FakeSupabase();

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  seedScenario(fake);
});

function bucket(over: Record<string, unknown> = {}) {
  return {
    hour_start: "2026-10-21T09:00:00.000Z",
    source: "codex",
    model: "test-unpriced-model",
    input_tokens: 10,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 5,
    reasoning_output_tokens: 0,
    total_tokens: 15,
    conversations: 1,
    ...over,
  };
}

async function ingest(body: unknown, token: string | null = TOKEN_A) {
  return ingestPost(jsonRequest(base("ingest"), { body, token }));
}

describe("ingest auth", () => {
  it("distinguishes missing bearer, revoked token, unknown token and revoked device", async () => {
    const missing = await ingestPost(jsonRequest(base("ingest"), { body: { hourly: [bucket()] }, token: null }));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toEqual({ error: "Missing bearer token" });

    // A revoked TOKEN fails the hash lookup before the device is consulted.
    const revokedToken = await ingest({ hourly: [bucket()] }, TOKEN_REVOKED);
    expect(revokedToken.status).toBe(401);
    expect(await revokedToken.json()).toEqual({ error: "Unauthorized" });

    const unknown = await ingest({ hourly: [bucket()] }, "not-a-known-token");
    expect(unknown.status).toBe(401);
    expect(await unknown.json()).toEqual({ error: "Unauthorized" });

    // An ACTIVE token on a revoked device hits the device check → 403.
    const revokedDevice = await ingest({ hourly: [bucket()] }, TOKEN_ON_REVOKED_DEVICE);
    expect(revokedDevice.status).toBe(403);
    expect(await revokedDevice.json()).toEqual({ error: "Device is revoked" });
  });

  it("does not fall back to JWT auth (device tokens only)", async () => {
    const { JWT } = await import("./helpers");
    const res = await ingest({ hourly: [bucket()] }, JWT);
    expect(res.status).toBe(401);
  });
});

describe("ingest validation", () => {
  it("rejects empty payloads and oversize batches", async () => {
    const empty = await ingest({ hourly: [], account_session_states: [] });
    expect(empty.status).toBe(400);
    expect(await empty.json()).toEqual({ error: "No usage buckets provided" });

    const tooManyBuckets = await ingest({ hourly: Array.from({ length: 501 }, () => bucket()) });
    expect(tooManyBuckets.status).toBe(400);
    expect(await tooManyBuckets.json()).toEqual({ error: "Too many buckets (max 500)" });

    const tooManyStates = await ingest({
      account_session_states: Array.from({ length: 501 }, (_, i) => ({
        source: "trae-cn",
        session_id: `s${i}`,
        model: "m",
        bucket_start: "2026-10-21T07:00:00.000Z",
        snapshot_verified_at: "2026-10-21T08:00:00.000Z",
        input_tokens: 0,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: 0,
      })),
    });
    expect(tooManyStates.status).toBe(400);
    expect(await tooManyStates.json()).toEqual({ error: "Too many account session states (max 500)" });
  });

  it("validates every bucket before any write (all-or-nothing)", async () => {
    const before = fake.table("token_usage_hourly").length;
    const res = await ingest({ hourly: [bucket(), bucket({ total_tokens: -1 })] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid usage bucket" });
    expect(fake.table("token_usage_hourly")).toHaveLength(before);
  });

  it("reports invalid session states separately", async () => {
    const res = await ingest({
      hourly: [bucket()],
      account_session_states: [{ source: "cursor", session_id: "s", model: "m", bucket_start: "2026-10-21T07:00:00.000Z", snapshot_verified_at: "2026-10-21T08:00:00.000Z", input_tokens: 0, cached_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, total_tokens: 0 }],
    });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid account session state" });
  });

  it("accepts the buckets alias for hourly", async () => {
    const res = await ingest({ buckets: [bucket()] });
    expect(res.status).toBe(200);
  });
});

describe("ingest dedup + last-wins", () => {
  it("dedupes in-request by keeping the largest total and reports the deduped count", async () => {
    const res = await ingest({
      hourly: [bucket({ total_tokens: 10 }), bucket({ total_tokens: 99 }), bucket({ total_tokens: 50 })],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 0, upload_scope: "private" });

    const rows = fake.table("token_usage_hourly").filter((r) => r.hour_start === "2026-10-21T09:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(99);
  });

  it("across requests, the LAST upload wins even with fewer tokens", async () => {
    await ingest({ hourly: [bucket({ total_tokens: 99 })] });
    await ingest({ hourly: [bucket({ total_tokens: 7 })] });
    const rows = fake.table("token_usage_hourly").filter((r) => r.hour_start === "2026-10-21T09:00:00.000Z");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(7);
  });

  it("upserts on (user_id, device_id, hour_start, source, model)", async () => {
    await ingest({ hourly: [bucket()] });
    const rows = fake.table("token_usage_hourly").filter((r) => r.hour_start === "2026-10-21T09:00:00.000Z");
    expect(rows[0]).toMatchObject({
      user_id: expect.any(String),
      device_id: DEVICE_A,
      source: "codex",
      model: "test-unpriced-model",
    });
  });

  it("normalizes buckets before storing", async () => {
    const res = await ingest({
      hourly: [bucket({ source: "  CODEX ", model: "", hour_start: "2026-10-21T09:30:00Z", conversation_count: 2, billable_total_tokens: null, total_cost_usd: 0.25 })],
    });
    expect(res.status).toBe(200);
    const row = fake.table("token_usage_hourly").at(-1)!;
    expect(row).toMatchObject({
      source: "codex",
      model: "unknown",
      hour_start: "2026-10-21T09:30:00.000Z",
      conversations: 2,
      billable_total_tokens: null,
      total_cost_usd: 0.25,
    });
  });

  it("upserts session states per user+source+session and enforces trae-cn", async () => {
    const state = (session_id: string, total: number) => ({
      source: "trae-cn",
      session_id,
      model: "hy3-preview",
      bucket_start: "2026-10-21T07:00:00.000Z",
      snapshot_verified_at: "2026-10-21T08:00:00.000Z",
      input_tokens: total,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: total,
    });
    const res = await ingest({ account_session_states: [state("s9", 30), state("s9", 40)] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 0, skipped: 0, upload_scope: "private" });
    const rows = fake.table("token_account_session_states").filter((r) => r.session_id === "s9");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(40); // last-wins upsert
  });

  it("updates last_used_at best-effort without failing the upload", async () => {
    // Corrupt the update path: no matching token row update should still 200.
    const res = await ingest({ hourly: [bucket()] });
    expect(res.status).toBe(200);
    const tokenRow = fake
      .table("token_device_tokens")
      .find((r) => r.device_id === DEVICE_A && r.revoked_at == null);
    expect(new Date(String(tokenRow!.last_used_at)).getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  it("rejects oversized request bodies with 413", async () => {
    const big = "x".repeat(1_048_577);
    const res = await ingestPost(rawRequest(base("ingest"), { body: JSON.stringify({ hourly: [bucket()], note: big }), token: TOKEN_A }));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Upload too large" });
  });

  it("maps malformed JSON to the generic 500 envelope", async () => {
    const res = await ingestPost(rawRequest(base("ingest"), { body: "{broken", token: TOKEN_A }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Internal server error" });
  });
});

function session(over: Record<string, unknown> = {}) {
  return {
    session_id: "session-1",
    source: "codex",
    started_at: "2026-10-21T09:00:00.000Z",
    ended_at: "2026-10-21T09:30:00.000Z",
    project_key: "/home/me/projects/demo/",
    input_tokens: 10,
    cached_input_tokens: 2,
    cache_creation_input_tokens: 3,
    output_tokens: 5,
    reasoning_output_tokens: 1,
    total_tokens: 20,
    billable_total_tokens: null,
    models: [
      {
        model: "test-unpriced-model",
        input_tokens: 10,
        cached_input_tokens: 2,
        cache_creation_input_tokens: 3,
        output_tokens: 5,
        reasoning_output_tokens: 1,
        total_tokens: 20,
      },
    ],
    ...over,
  };
}

describe("ingest sessions", () => {
  it("accepts a sessions-only payload and appends counters", async () => {
    const res = await ingest({ sessions: [session()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 0,
      skipped: 0,
      upload_scope: "private",
      sessions_upserted: 1,
      sessions_skipped: 0,
    });

    const row = fake.table("token_sessions").at(-1)!;
    expect(row).toMatchObject({
      user_id: expect.any(String),
      device_id: DEVICE_A,
      source: "codex",
      session_id: "session-1",
      project_key: "demo",
      started_at: "2026-10-21T09:00:00.000Z",
      ended_at: "2026-10-21T09:30:00.000Z",
      total_tokens: 20,
      billable_total_tokens: null,
    });
    expect(row.models).toEqual(session().models);
    // Privacy whitelist: unknown fields never reach the row.
    expect(row.prompt).toBeUndefined();
    expect(row.title).toBeUndefined();
    expect(row.resume_command).toBeUndefined();
  });

  it("leaves the legacy response byte-for-byte unchanged without sessions", async () => {
    for (const body of [
      { hourly: [bucket()] },
      { hourly: [bucket()], sessions: [] },
      { hourly: [bucket()], sessions: null },
    ]) {
      const res = await ingest(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        inserted: 1,
        skipped: 0,
        upload_scope: "private",
      });
    }
  });

  it("rejects non-arrays, oversize batches and invalid entries before writing", async () => {
    const nonArray = await ingest({ sessions: "nope" });
    expect(nonArray.status).toBe(400);
    expect(await nonArray.json()).toEqual({ error: "Invalid session" });

    const tooMany = await ingest({
      sessions: Array.from({ length: 201 }, (_, index) =>
        session({ session_id: `s${index}` }),
      ),
    });
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toEqual({ error: "Too many sessions (max 200)" });

    const invalidEntries: Array<Record<string, unknown>> = [
      session({ session_id: "" }),
      session({ session_id: "a/b" }),
      session({ session_id: "a\\b" }),
      session({ session_id: "a\u0007b" }),
      session({ session_id: "x".repeat(257) }),
      session({ ended_at: "2026-10-21T08:59:59.000Z" }),
      session({ total_tokens: 19 }),
      session({ billable_total_tokens: -1 }),
      session({
        models: [{ ...session().models[0], total_tokens: 19 }],
      }),
      session({
        models: [
          {
            ...session().models[0],
            total_tokens: 10,
          },
        ],
      }),
      session({ models: Array.from({ length: 33 }, () => session().models[0]) }),
    ];

    for (const entry of invalidEntries) {
      const res = await ingest({ sessions: [entry] });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid session" });
      expect(fake.table("token_sessions")).toHaveLength(0);
    }

    // All-or-nothing across the whole batch, including the hourly write.
    const before = fake.table("token_usage_hourly").length;
    const mixed = await ingest({
      hourly: [bucket()],
      sessions: [session(), session({ total_tokens: -1 })],
    });
    expect(mixed.status).toBe(400);
    expect(fake.table("token_usage_hourly")).toHaveLength(before);
    expect(fake.table("token_sessions")).toHaveLength(0);
  });

  it("skips account-level sources whole, without validating their fields", async () => {
    const res = await ingest({
      sessions: [
        { source: "cursor", session_id: "cursor-1" },
        { source: "  TRAE-CN ", session_id: "trae-1" },
        session({ source: "  CODEX " }),
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 0,
      skipped: 0,
      upload_scope: "private",
      sessions_upserted: 1,
      sessions_skipped: 2,
    });

    const rows = fake.table("token_sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "codex", session_id: "session-1" });
  });

  it("dedupes in-request by latest ended_at, then total, then later entry", async () => {
    const res = await ingest({
      sessions: [
        session({ ended_at: "2026-10-21T09:10:00.000Z", project_key: "early" }),
        session({ ended_at: "2026-10-21T09:40:00.000Z", project_key: "late" }),
        session({
          ended_at: "2026-10-21T09:40:00.000Z",
          input_tokens: 10,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 10,
          models: [],
          project_key: "smaller",
        }),
        session({
          ended_at: "2026-10-21T09:40:00.000Z",
          input_tokens: 20,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 20,
          models: [],
          project_key: "later-equal",
        }),
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 0,
      skipped: 0,
      upload_scope: "private",
      sessions_upserted: 1,
      sessions_skipped: 3,
    });

    const rows = fake.table("token_sessions");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      project_key: "later-equal",
      ended_at: "2026-10-21T09:40:00.000Z",
      total_tokens: 20,
    });
  });

  it("applies strict ended_at last-wins across requests", async () => {
    const first = await ingest({ sessions: [session({ ended_at: "2026-10-21T10:00:00.000Z" })] });
    expect(first.status).toBe(200);

    const older = await ingest({
      sessions: [
        session({
          ended_at: "2026-10-21T09:00:00.000Z",
          input_tokens: 99,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 99,
          models: [],
        }),
      ],
    });
    expect(await older.json()).toMatchObject({
      sessions_upserted: 0,
      sessions_skipped: 1,
    });

    const equal = await ingest({
      sessions: [
        session({
          ended_at: "2026-10-21T10:00:00.000Z",
          input_tokens: 99,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 99,
          models: [],
        }),
      ],
    });
    expect(await equal.json()).toMatchObject({
      sessions_upserted: 0,
      sessions_skipped: 1,
    });

    let row = fake.table("token_sessions")[0];
    expect(row.total_tokens).toBe(20);

    const newer = await ingest({
      sessions: [
        session({
          ended_at: "2026-10-21T11:00:00.000Z",
          input_tokens: 5,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 5,
          models: [],
        }),
      ],
    });
    expect(await newer.json()).toMatchObject({
      sessions_upserted: 1,
      sessions_skipped: 0,
    });

    row = fake.table("token_sessions")[0];
    expect(row.total_tokens).toBe(5);
    expect(row.ended_at).toBe("2026-10-21T11:00:00.000Z");
  });

  it("stores only the basename of project_key and strips control characters", async () => {
    const cases: Array<[string, string | null]> = [
      ["C:\\Users\\me\\repo\\", "repo"],
      ["/home/me/dir/\u0007proj\u0007", "proj"],
      ["/", null],
      ["", null],
      [".", null],
      ["..", null],
      [`/tmp/${"x".repeat(200)}`, "x".repeat(120)],
    ];

    for (const [input, expected] of cases) {
      fake.table("token_sessions").length = 0;
      const res = await ingest({
        sessions: [session({ session_id: "project-case", project_key: input })],
      });
      expect(res.status).toBe(200);
      expect(fake.table("token_sessions")[0].project_key).toBe(expected);
    }
  });

  it("merges duplicate model names and enforces the model sum", async () => {
    const res = await ingest({
      sessions: [
        session({
          input_tokens: 6,
          cached_input_tokens: 0,
          cache_creation_input_tokens: 0,
          output_tokens: 0,
          reasoning_output_tokens: 0,
          total_tokens: 6,
          models: [
            {
              model: "same",
              input_tokens: 2,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
              output_tokens: 0,
              reasoning_output_tokens: 0,
              total_tokens: 2,
            },
            {
              model: " same ",
              input_tokens: 4,
              cached_input_tokens: 0,
              cache_creation_input_tokens: 0,
              output_tokens: 0,
              reasoning_output_tokens: 0,
              total_tokens: 4,
            },
          ],
        }),
      ],
    });
    expect(res.status).toBe(200);
    const models = fake.table("token_sessions")[0].models as Array<Record<string, unknown>>;
    expect(models).toHaveLength(1);
    expect(models[0]).toMatchObject({ model: "same", input_tokens: 6, total_tokens: 6 });
  });
});
