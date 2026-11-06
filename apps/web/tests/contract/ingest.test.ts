// Golden contract tests for ingest (docs/cli-contract.md §2.4; §3 invariants
// 2 — the last-wins upsert baseline — and 8 partially).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as ingestPost } from "@/app/api/functions/token-usage-ingest/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  DEVICE_B,
  TOKEN_A,
  TOKEN_B,
  TOKEN_ON_REVOKED_DEVICE,
  TOKEN_REVOKED,
  USER_ID,
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

  it("clamps forged provider costs at the §2.4 per-row cap instead of rejecting", async () => {
    const res = await ingest({
      hourly: [bucket({ source: "grok", total_cost_usd: 999 })],
    });
    expect(res.status).toBe(200);
    expect(fake.table("token_usage_hourly").at(-1)!.total_cost_usd).toBe(10);
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

  it("maps malformed JSON to the stable 400 invalid_json envelope", async () => {
    const res = await ingestPost(rawRequest(base("ingest"), { body: "{broken", token: TOKEN_A }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "invalid_json" });
  });
});

describe("ingest credits", () => {
  it("defaults credits to 0 for payloads without the field (additive field)", async () => {
    const res = await ingest({ hourly: [bucket()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ inserted: 1, skipped: 0, upload_scope: "private" });
    expect(fake.table("token_usage_hourly").at(-1)!.credits).toBe(0);
  });

  it("stores float credits and accepts credits-only buckets (tokens all zero)", async () => {
    const zeroTokens = {
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 0,
    };
    const res = await ingest({
      hourly: [
        bucket({ source: "qoder-cn", model: "dfmodel", credits: 0.642 }),
        bucket({ source: "qoder-cn", model: "dfmodel", hour_start: "2026-10-21T09:30:00.000Z", ...zeroTokens, credits: 2.5, conversations: 1 }),
      ],
    });
    expect(res.status).toBe(200);
    const rows = fake.table("token_usage_hourly").filter((r) => r.source === "qoder-cn");
    expect(rows).toHaveLength(2);
    expect(rows[0].credits).toBe(0.642);
    // The credits-only bucket keeps a zero token delta (no credit→token rate).
    expect(rows[1]).toMatchObject({ total_tokens: 0, credits: 2.5 });
  });

  it("rounds credits to 6 decimals and clamps invalid, negative and over-cap rows", async () => {
    const res = await ingest({
      hourly: [
        bucket({ hour_start: "2026-10-21T09:00:00.000Z", credits: 0.1234567 }),
        bucket({ hour_start: "2026-10-21T08:00:00.000Z", credits: -1 }),
        bucket({ hour_start: "2026-10-21T07:00:00.000Z", credits: "abc" }),
        bucket({ hour_start: "2026-10-21T06:00:00.000Z", credits: 2_000_000 }),
      ],
    });
    expect(res.status).toBe(200);
    // Scope to this request's rows: the seed scenario plants unrelated
    // buckets at 07:00/08:00 (trae-cn / machine-src) without credits.
    const creditsAt = (hour: string) =>
      fake
        .table("token_usage_hourly")
        .find((r) => r.hour_start === hour && r.source === "codex")!.credits;
    expect(creditsAt("2026-10-21T09:00:00.000Z")).toBe(0.123457);
    expect(creditsAt("2026-10-21T08:00:00.000Z")).toBe(0);
    expect(creditsAt("2026-10-21T07:00:00.000Z")).toBe(0);
    expect(creditsAt("2026-10-21T06:00:00.000Z")).toBe(1_000_000);
  });

  it("credits never participate in the request-internal total dedup", async () => {
    const res = await ingest({
      hourly: [
        bucket({ credits: 5 }),
        bucket({ total_tokens: 99, output_tokens: 89, credits: 0.1 }),
      ],
    });
    expect(res.status).toBe(200);
    const rows = fake.table("token_usage_hourly").filter((r) => r.hour_start === "2026-10-21T09:00:00.000Z");
    expect(rows).toHaveLength(1);
    // The largest total_tokens wins regardless of credits.
    expect(rows[0].total_tokens).toBe(99);
    expect(rows[0].credits).toBe(0.1);
  });

  it("last-wins replay without credits resets the stored credits to 0", async () => {
    await ingest({ hourly: [bucket({ credits: 3.5 })] });
    await ingest({ hourly: [bucket()] });
    expect(fake.table("token_usage_hourly").at(-1)!.credits).toBe(0);
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

  it("stores optional session credits (display-only; absent → 0; negatives clamp to 0)", async () => {
    const ok = await ingest({ sessions: [session({ credits: 12.1234567 })] });
    expect(ok.status).toBe(200);
    expect(fake.table("token_sessions")[0].credits).toBe(12.123457);

    const bare = await ingest({ sessions: [session({ session_id: "session-2" })] });
    expect(bare.status).toBe(200);
    // Old CLIs never send the field — the column defaults to 0.
    expect(fake.table("token_sessions")[1].credits).toBe(0);

    // Same clamp-not-reject philosophy as the bucket field: one stray row
    // must never stall a deployed collector's queue.
    const negative = await ingest({ sessions: [session({ session_id: "session-3", credits: -1 })] });
    expect(negative.status).toBe(200);
    expect(fake.table("token_sessions")[2].credits).toBe(0);
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

// Contract v2 (2026-11-03, docs/cli-contract.md §2.4): optional project_key on
// usage buckets; identity and request-internal dedup keys both gain it. The
// unattributed form stores '' (a PK column cannot be NULL).
describe("ingest project_key (contract v2)", () => {
  const HOUR = "2026-10-21T09:00:00.000Z";
  const rowsAt = () =>
    fake
      .table("token_usage_hourly")
      .filter((r) => r.hour_start === HOUR && r.source === "codex");

  it("normalizes project_key to a basename and stores it on the bucket row", async () => {
    const res = await ingest({ hourly: [bucket({ project_key: "/home/oops/work/my-app/" })] });
    expect(res.status).toBe(200);
    const rows = rowsAt().filter((r) => r.project_key === "my-app");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(15);
  });

  it("keeps same hour/source/model rows apart when project_key differs", async () => {
    const res = await ingest({
      hourly: [
        bucket({ project_key: "app-one", total_tokens: 15 }),
        bucket({ project_key: "app-two", total_tokens: 30 }),
        bucket({ project_key: null, total_tokens: 7 }),
      ],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ inserted: 3 });
    const projects = rowsAt().map((r) => `${r.project_key}:${r.total_tokens}`).sort();
    expect(projects).toEqual([":7", "app-one:15", "app-two:30"]);
  });

  it("last-wins within the same (hour, source, model, project_key) key", async () => {
    await ingest({ hourly: [bucket({ project_key: "app-one", total_tokens: 15 })] });
    const res = await ingest({ hourly: [bucket({ project_key: "app-one", total_tokens: 99 })] });
    expect(res.status).toBe(200);
    const rows = rowsAt().filter((r) => r.project_key === "app-one");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(99);
  });

  it("request-internal dedup keeps the max-total row per 4-field key", async () => {
    const res = await ingest({
      hourly: [
        bucket({ project_key: "app-one", total_tokens: 10 }),
        bucket({ project_key: "app-one", total_tokens: 42 }),
        bucket({ project_key: "app-one", total_tokens: 21 }),
      ],
    });
    expect(res.status).toBe(200);
    const rows = rowsAt().filter((r) => r.project_key === "app-one");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(42);
  });

  it("treats missing, null, empty and dot project_key as the unattributed '' bucket", async () => {
    const res = await ingest({
      hourly: [
        bucket({ total_tokens: 1 }),
        bucket({ project_key: null, total_tokens: 2 }),
        bucket({ project_key: "", total_tokens: 3 }),
        bucket({ project_key: ".", total_tokens: 4 }),
      ],
    });
    expect(res.status).toBe(200);
    // All four collapse onto the same unattributed key: max total wins.
    const rows = rowsAt().filter((r) => r.project_key === "");
    expect(rows).toHaveLength(1);
    expect(rows[0].total_tokens).toBe(4);
  });

  it("rejects a non-string project_key with the stable invalid-bucket envelope", async () => {
    const res = await ingest({ hourly: [bucket({ project_key: 123 })] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid usage bucket" });
  });

  it("truncates project_key at 120 chars", async () => {
    const res = await ingest({ hourly: [bucket({ project_key: `x/${"a".repeat(200)}` })] });
    expect(res.status).toBe(200);
    const stored = rowsAt()[0].project_key as string;
    expect(stored).toHaveLength(120);
  });
});

// Contract v3 (2026-11-06, docs/cli-contract.md §2.4 / §3 item 16): optional
// `projects` names the GitHub / Gitee repo behind each project directory.
// Entries are dropped one by one (never failing the batch), each device keeps
// its own detection row, and ingest never writes the manual profile table.
describe("ingest projects (contract v3)", () => {
  const REPO = "https://github.com/octo-org/demo-app";
  const repoRows = () => fake.table("token_project_repos");

  function project(over: Record<string, unknown> = {}) {
    return { project_key: "demo-app", repo_url: REPO, ...over };
  }

  it("leaves the legacy response byte-for-byte unchanged without projects", async () => {
    for (const body of [
      { hourly: [bucket()] },
      { hourly: [bucket()], projects: [] },
      { hourly: [bucket()], projects: null },
    ]) {
      const res = await ingest(body);
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ inserted: 1, skipped: 0, upload_scope: "private" });
    }
    expect(repoRows()).toHaveLength(0);
  });

  it("an empty projects array alone is still an empty upload", async () => {
    const res = await ingest({ projects: [] });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No usage buckets provided" });
  });

  it("accepts a projects-only payload and stores the repo on this device's row", async () => {
    const res = await ingest({ projects: [project()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 0,
      skipped: 0,
      upload_scope: "private",
      projects_upserted: 1,
      projects_skipped: 0,
    });
    expect(repoRows()).toHaveLength(1);
    expect(repoRows()[0]).toMatchObject({
      user_id: USER_ID,
      device_id: DEVICE_A,
      project_key: "demo-app",
      repo_url: REPO,
    });
    expect(new Date(String(repoRows()[0].updated_at)).getTime()).toBeGreaterThan(
      Date.now() - 60_000,
    );
  });

  it("appends projects counters next to the sessions counters", async () => {
    const res = await ingest({ hourly: [bucket()], sessions: [session()], projects: [project()] });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 1,
      skipped: 0,
      upload_scope: "private",
      sessions_upserted: 1,
      sessions_skipped: 0,
      projects_upserted: 1,
      projects_skipped: 0,
    });
  });

  it("accepts the canonical GitHub and Gitee forms verbatim", async () => {
    const res = await ingest({
      projects: [
        project({ project_key: "gh", repo_url: "https://github.com/Octo-Org/my.repo_v2" }),
        project({ project_key: "ge", repo_url: "https://gitee.com/some-user/demo-app" }),
      ],
    });
    expect(await res.json()).toMatchObject({ projects_upserted: 2, projects_skipped: 0 });
    const byKey = Object.fromEntries(repoRows().map((r) => [r.project_key, r.repo_url]));
    expect(byKey).toEqual({
      gh: "https://github.com/Octo-Org/my.repo_v2",
      ge: "https://gitee.com/some-user/demo-app",
    });
  });

  it("cleans project_key with the session rules", async () => {
    const cases: Array<[string, string]> = [
      ["/home/me/work/demo-app/", "demo-app"],
      ["C:\\Users\\me\\repo\\", "repo"],
      ["/home/me/dir/\u0007proj\u0007", "proj"],
      [`/tmp/${"x".repeat(200)}`, "x".repeat(120)],
    ];

    for (const [input, expected] of cases) {
      fake.table("token_project_repos").length = 0;
      const res = await ingest({ projects: [project({ project_key: input })] });
      expect(res.status).toBe(200);
      expect(repoRows()).toHaveLength(1);
      expect(repoRows()[0].project_key).toBe(expected);
    }
  });

  it("drops non-canonical and non-GitHub/Gitee entries one by one, never the batch", async () => {
    const badUrls: unknown[] = [
      "https://gitlab.com/acme/app",
      "https://gitlab.acme.internal/team/app",
      "https://github.acme.com/team/app",
      "https://www.github.com/acme/app",
      "https://GitHub.com/acme/app",
      "http://github.com/acme/app",
      "git@github.com:acme/app.git",
      "ssh://git@github.com/acme/app",
      "https://github.com/acme/app.git",
      "https://github.com/acme/app.GIT",
      "https://github.com/acme/app/",
      "https://github.com/acme",
      "https://github.com/acme/app/tree/main",
      "https://fake-user:fake-pass@github.com/acme/app",
      "https://github.com:443/acme/app",
      "https://github.com/acme/app?tab=readme",
      "https://github.com/acme/app#readme",
      "https://github.com/../app",
      "https://github.com/acme/.",
      "https://github.com/ac me/app",
      "https://github.com/acme/%61pp",
      " https://github.com/acme/app",
      `https://gitee.com/acme/${"r".repeat(101)}`,
      "",
      42,
      {},
    ];
    const badKeys: unknown[] = ["", ".", "..", "/", "\u0007", 42, null];
    const entries: unknown[] = [
      ...badUrls.map((repo_url, index) => project({ project_key: `bad-url-${index}`, repo_url })),
      ...badKeys.map((project_key) => project({ project_key })),
      { repo_url: REPO },
      { project_key: "missing-repo-url" },
      null,
      "demo-app",
      7,
      [],
      project({ project_key: "kept" }),
    ];

    const res = await ingest({ hourly: [bucket()], projects: entries });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      inserted: 1,
      skipped: 0,
      upload_scope: "private",
      projects_upserted: 1,
      projects_skipped: entries.length - 1,
    });
    expect(repoRows().map((r) => r.project_key)).toEqual(["kept"]);
    // The usage write of the same request lands regardless.
    expect(
      fake.table("token_usage_hourly").filter((r) => r.hour_start === "2026-10-21T09:00:00.000Z"),
    ).toHaveLength(1);
  });

  it("caps repo_url at 200 characters", async () => {
    const at200 = `https://github.com/${"o".repeat(90)}/${"r".repeat(90)}`;
    const at201 = `https://github.com/${"o".repeat(91)}/${"r".repeat(90)}`;
    expect(at200).toHaveLength(200);
    expect(at201).toHaveLength(201);

    const res = await ingest({
      projects: [
        project({ project_key: "at-cap", repo_url: at200 }),
        project({ project_key: "over-cap", repo_url: at201 }),
      ],
    });
    expect(await res.json()).toMatchObject({ projects_upserted: 1, projects_skipped: 1 });
    expect(repoRows().map((r) => r.project_key)).toEqual(["at-cap"]);
  });

  it("validates first, then keeps the later valid entry per cleaned project_key", async () => {
    const later = "https://github.com/octo-org/demo-app-v2";
    const res = await ingest({
      projects: [
        project({ project_key: "/work/demo-app" }),
        project({ project_key: "demo-app", repo_url: later }),
        // An invalid later entry never displaces a valid earlier one.
        project({ project_key: "demo-app", repo_url: "https://gitlab.com/octo-org/demo-app" }),
      ],
    });
    expect(await res.json()).toMatchObject({ projects_upserted: 1, projects_skipped: 2 });
    expect(repoRows()).toHaveLength(1);
    expect(repoRows()[0].repo_url).toBe(later);
  });

  it("last-wins per (user, device, project_key) across requests", async () => {
    const moved = "https://gitee.com/octo-org/demo-app";
    await ingest({ projects: [project()] });
    const res = await ingest({ projects: [project({ repo_url: moved })] });
    expect(res.status).toBe(200);
    expect(repoRows()).toHaveLength(1);
    expect(repoRows()[0].repo_url).toBe(moved);
  });

  it("keeps one row per device; a null repo_url clears only the sender's row", async () => {
    await ingest({ projects: [project()] }, TOKEN_A);
    await ingest({ projects: [project()] }, TOKEN_B);
    const res = await ingest({ projects: [project({ repo_url: null })] }, TOKEN_B);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ projects_upserted: 1, projects_skipped: 0 });

    const byDevice = Object.fromEntries(repoRows().map((r) => [r.device_id, r.repo_url]));
    expect(byDevice).toEqual({ [DEVICE_A]: REPO, [DEVICE_B]: null });
  });

  it("rejects a non-array or oversize projects field before any write", async () => {
    const before = fake.table("token_usage_hourly").length;

    for (const projects of ["nope", { project_key: "demo-app", repo_url: REPO }, 7]) {
      const res = await ingest({ hourly: [bucket()], projects });
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid project" });
    }

    const tooMany = await ingest({
      hourly: [bucket()],
      projects: Array.from({ length: 201 }, (_, index) => project({ project_key: `p${index}` })),
    });
    expect(tooMany.status).toBe(400);
    expect(await tooMany.json()).toEqual({ error: "Too many projects (max 200)" });

    expect(fake.table("token_usage_hourly")).toHaveLength(before);
    expect(repoRows()).toHaveLength(0);

    const atCap = await ingest({
      projects: Array.from({ length: 200 }, (_, index) => project({ project_key: `p${index}` })),
    });
    expect(atCap.status).toBe(200);
    expect(await atCap.json()).toMatchObject({ projects_upserted: 200, projects_skipped: 0 });
  });

  it("stores only whitelisted columns and never writes the manual profile table", async () => {
    const profile = {
      user_id: USER_ID,
      project_key: "demo-app",
      display_name: "Demo",
      repo_url: "https://example.test/manual",
      repo_hidden: false,
      logo_url: "https://example.test/logo.png",
      logo_object: null,
      created_at: "2026-11-01T00:00:00.000Z",
      updated_at: "2026-11-01T00:00:00.000Z",
    };
    fake.table("token_project_profiles").push({ ...profile });

    const res = await ingest({
      projects: [
        project({
          path: "C:\\Users\\me\\work\\demo-app",
          remote: "git@github.com:octo-org/demo-app.git",
          token: "fake-token-value",
        }),
      ],
    });
    expect(res.status).toBe(200);
    expect(Object.keys(repoRows()[0]).sort()).toEqual([
      "created_at",
      "device_id",
      "project_key",
      "repo_url",
      "updated_at",
      "user_id",
    ]);
    expect(fake.table("token_project_profiles")).toEqual([profile]);
  });

  it("treats the projects write as best effort: a failed write never fails the upload", async () => {
    // A self-hosted instance that has not run the contract v3 migration yet:
    // the table is missing, so the projects write fails.
    delete fake.tables.token_project_repos;

    const res = await ingest({ hourly: [bucket()], projects: [project()] });
    expect(res.status).toBe(200);
    // No projects counters: the CLI treats the entries as unconfirmed and
    // retries next sync, exactly as against a pre-v3 server.
    expect(await res.json()).toEqual({ inserted: 1, skipped: 0, upload_scope: "private" });
    expect(
      fake.table("token_usage_hourly").filter((r) => r.hour_start === "2026-10-21T09:00:00.000Z"),
    ).toHaveLength(1);

    const projectsOnly = await ingest({ projects: [project()] });
    expect(projectsOnly.status).toBe(200);
    expect(await projectsOnly.json()).toEqual({ inserted: 0, skipped: 0, upload_scope: "private" });
  });
});
