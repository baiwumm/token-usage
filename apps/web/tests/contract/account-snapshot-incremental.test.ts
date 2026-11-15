// Incremental watermark behavior for the account snapshot (2026-11-15):
// loadAccountUsage keeps a per-user live row map and each TTL window probes
// token_usage_hourly / token_account_session_states for updated_at past the
// watermark instead of re-pulling whole tables. The contract shape is pinned
// by account-series.test.ts / dashboard.test.ts — this file pins the cache
// mechanics: cold full pull, dirty-after-ingest immediate refresh, TTL expiry
// incremental probe (the "other instance wrote" case), and equivalence with
// the uncached whole pull.

import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it, vi } from "vitest";

import { loadAccountUsage, __resetLiveSnapshotsForTests } from "@/lib/api/account-data";

import { FakeSupabase } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  TOKEN_A,
  USER_ID,
  base,
  initContractEnv,
  jsonRequest,
  seedScenario,
} from "./helpers";
import { POST as ingestPost } from "@/app/api/functions/token-usage-ingest/route";

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
  // The helpers set this to "off" for the reseeding contract tests; the
  // mechanics under test here need the cache on. Restored after each case.
  delete process.env.TOKEN_USAGE_USAGE_CACHE;
  __resetLiveSnapshotsForTests();
});

afterEach(() => {
  vi.useRealTimers();
  process.env.TOKEN_USAGE_USAGE_CACHE = "off";
  __resetLiveSnapshotsForTests();
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

async function ingestAt(iso: string, totalTokens: number): Promise<void> {
  vi.setSystemTime(new Date(iso));
  const response = await ingestPost(
    jsonRequest(base("ingest"), {
      body: { hourly: [bucket({ total_tokens: totalTokens })] },
      token: TOKEN_A,
    }),
  );

  expect(response.status).toBe(200);
}

function totalOf(usage: { canonicalRows: Array<Record<string, unknown>> }): number {
  return usage.canonicalRows.reduce(
    (sum, row) => sum + (Number(row.total_tokens) || 0),
    0,
  );
}

describe("account snapshot incremental watermark", () => {
  it("pulls the whole tables cold, merges ingest immediately (dirty), and probes incrementally after the TTL", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const T0 = Date.parse("2026-11-15T10:00:00.000Z");
    vi.setSystemTime(new Date(T0));

    // Cold load: full read of the seeded tables (they already carry the
    // seed scenario's queue baseline).
    const baseline = totalOf(await loadAccountUsage(USER_ID));
    expect(baseline).toBeGreaterThan(0);

    // Ingest writes two buckets and marks the snapshot dirty; the next load
    // must reflect them without waiting out the TTL.
    await ingestAt("2026-11-15T10:00:05.000Z", 100);
    const afterIngest = await loadAccountUsage(USER_ID);
    expect(totalOf(afterIngest)).toBe(baseline + 100);

    // Inside the TTL with no write, the cached snapshot is reused as-is.
    vi.setSystemTime(new Date(T0 + 5_000));
    expect(await loadAccountUsage(USER_ID)).toBe(afterIngest);

    // A write from "another instance" lands directly in the table (no local
    // invalidation): after the TTL expires the incremental probe must pick
    // the new row up.
    vi.setSystemTime(new Date(T0 + 16_000));
    const laterIso = "2026-11-15T10:00:16.000Z";
    fake.table("token_usage_hourly").push({
      user_id: USER_ID,
      device_id: DEVICE_A,
      hour_start: "2026-10-21T10:00:00.000Z",
      source: "codex",
      model: "test-unpriced-model",
      project_key: "",
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 50,
      reasoning_output_tokens: 0,
      total_tokens: 50,
      billable_total_tokens: 50,
      conversations: 1,
      total_cost_usd: 0,
      credits: 0,
      created_at: laterIso,
      updated_at: laterIso,
    });

    const afterExpiry = await loadAccountUsage(USER_ID);
    expect(totalOf(afterExpiry)).toBe(baseline + 150);

    // An upsert to an existing bucket (last-wins) merges over the old row.
    vi.setSystemTime(new Date(T0 + 26_000));
    const upsertIso = "2026-11-15T10:00:26.000Z";
    fake.table("token_usage_hourly").push({
      user_id: USER_ID,
      device_id: DEVICE_A,
      hour_start: "2026-10-21T10:00:00.000Z",
      source: "codex",
      model: "test-unpriced-model",
      project_key: "",
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      total_tokens: 999,
      billable_total_tokens: 999,
      conversations: 1,
      total_cost_usd: 0,
      credits: 0,
      created_at: upsertIso,
      updated_at: upsertIso,
    });

    const afterUpsert = await loadAccountUsage(USER_ID);
    expect(totalOf(afterUpsert)).toBe(baseline + 100 + 999);
  });

  it("matches the uncached whole pull exactly after incremental merges", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.parse("2026-11-15T10:00:00.000Z")));

    await loadAccountUsage(USER_ID);
    await ingestAt("2026-11-15T10:00:05.000Z", 100);
    vi.setSystemTime(new Date(Date.parse("2026-11-15T10:00:11.000Z")));
    const incremental = await loadAccountUsage(USER_ID);

    // The uncached path (cache off) re-pulls everything; both must agree.
    process.env.TOKEN_USAGE_USAGE_CACHE = "off";
    const whole = await loadAccountUsage(USER_ID);

    expect(totalOf(incremental)).toBe(totalOf(whole));
    expect(incremental.canonicalRows).toEqual(whole.canonicalRows);
  });
});
