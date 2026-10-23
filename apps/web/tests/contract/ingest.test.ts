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
