// Tests for the /api/app/achievements data path (docs/achievements-plan.md
// §4 P1.3): cookie-auth gate, tz parameter handling, response shape and the
// history window that feeds the sessions/sync achievements. The fake Supabase
// backend keeps these deterministic and secret-free.

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  configured: true,
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
  }),
}));

vi.mock("@/lib/auth/config", () => ({
  authConfig: () =>
    auth.configured
      ? { url: "http://fake-auth.test", publishableKey: "fake-publishable-key" }
      : null,
}));

import type { NextRequest } from "next/server";

import { GET } from "@/app/api/app/achievements/route";
import { ACHIEVEMENTS } from "@/lib/achievements/catalog";
import { achievementsPayloadForUser } from "@/lib/achievements/payload";
import type { AchievementsPayload } from "@/lib/achievements/types";

import { USER_ID, initContractEnv } from "../contract/helpers";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";

const fake = new FakeSupabase();
const DEVICE = "55555555-5555-4555-8555-555555555555";

function hourly(over: Row): Row {
  return {
    user_id: USER_ID,
    device_id: DEVICE,
    hour_start: "2026-10-02T02:00:00.000Z",
    source: "codex",
    model: "test-unpriced-model",
    input_tokens: 500,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 500,
    reasoning_output_tokens: 0,
    total_tokens: 1000,
    billable_total_tokens: null,
    conversations: 1,
    total_cost_usd: 0,
    updated_at: "2026-10-02T03:00:00.000Z",
    ...over,
  };
}

function seed(): void {
  fake.table("token_devices").push({
    id: DEVICE,
    user_id: USER_ID,
    device_name: "PC One",
    platform: "cli-device-flow",
    default_device_name: "PC One",
    revoked_at: null,
    created_at: "2026-09-01T00:00:00.000Z",
    updated_at: "2026-09-01T00:00:00.000Z",
  });

  fake.table("token_usage_hourly").push(
    // 2026-10-01 16:30 UTC is 2026-10-02 00:30 in Asia/Shanghai.
    hourly({
      hour_start: "2026-10-01T16:30:00.000Z",
      input_tokens: 10_000_000,
      output_tokens: 0,
      total_tokens: 10_000_000,
    }),
    hourly({ hour_start: "2026-10-02T02:00:00.000Z" }),
  );

  // A session from before the CLI existed proves the history window starts at
  // the fixed 2000-01-01 instant instead of the first hourly row.
  fake.table("token_sessions").push({
    user_id: USER_ID,
    device_id: DEVICE,
    source: "codex",
    session_id: "legacy-session",
    project_key: "legacy",
    started_at: "2020-01-05T00:00:00.000Z",
    ended_at: "2020-01-05T01:00:00.000Z",
    total_tokens: 5_000_000,
  });

  fake.table("token_sync_runs").push({
    user_id: USER_ID,
    device_id: DEVICE,
    run_id: "run-1",
    started_at: "2026-10-02T01:00:00.000Z",
    ended_at: "2026-10-02T01:00:10.000Z",
    duration_ms: 10_000,
    trigger: "manual",
    result: "ok",
    error_code: null,
    empty: false,
    parsed_files: 1,
    buckets_uploaded: 1,
    tokens_ingested: 1000,
    sessions_uploaded: 1,
    sessions_skipped: 0,
    queue_bytes: null,
    cli_version: "0.2.0",
    os: "linux",
  });
}

function request(search = ""): NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/app/achievements${search}`),
  } as unknown as NextRequest;
}

function find(payload: AchievementsPayload, id: string) {
  const found = payload.achievements.find((entry) => entry.id === id);

  if (!found) throw new Error(`missing achievement ${id}`);

  return found;
}

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  seed();
  auth.user = { id: USER_ID };
  auth.configured = true;
});

describe("GET /api/app/achievements — auth gate", () => {
  it("answers 401 without a browser session", async () => {
    auth.user = null;
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 500 when browser auth is not configured", async () => {
    auth.configured = false;
    const response = await GET(request());

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Auth not configured" });
  });
});

describe("GET /api/app/achievements — payload", () => {
  it("returns never-cached JSON with one progress row per catalog entry", async () => {
    const response = await GET(request("?tz=Asia/Shanghai"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-type")).toContain("application/json");

    const body = (await response.json()) as AchievementsPayload;

    expect(Number.isFinite(Date.parse(body.generated_at))).toBe(true);
    expect(body.achievements.map((entry) => entry.id)).toEqual(
      ACHIEVEMENTS.map((entry) => entry.id),
    );

    for (const entry of body.achievements) {
      expect(typeof entry.value).toBe("number");
      expect(Number.isInteger(entry.tier)).toBe(true);
      expect(entry.tier).toBeGreaterThanOrEqual(0);
      expect(entry.tier).toBeLessThanOrEqual(5);
      expect(entry.thresholds).toHaveLength(5);
      expect(
        entry.next_threshold === null ||
          typeof entry.next_threshold === "number",
      ).toBe(true);
      expect(Object.keys(entry.achieved_at)).toEqual([
        "bronze",
        "silver",
        "gold",
        "diamond",
        "king",
      ]);
      for (const day of Object.values(entry.achieved_at)) {
        expect(day === null || /^\d{4}-\d{2}-\d{2}$/.test(day)).toBe(true);
      }
    }
  });

  it("buckets days by the requested timezone", async () => {
    const shanghai = (await (
      await GET(request("?tz=Asia/Shanghai"))
    ).json()) as AchievementsPayload;
    const utc = (await (
      await GET(request("?tz_offset_minutes=0"))
    ).json()) as AchievementsPayload;

    // Both rows land on 2026-10-02 in Shanghai; in UTC the 16:30 bucket is
    // still 2026-10-01, so the crossing day moves.
    expect(find(shanghai, "big_day").value).toBe(10_001_000);
    expect(find(shanghai, "big_day").achieved_at.bronze).toBe("2026-10-02");
    expect(find(shanghai, "big_day").tier).toBe(1);
    expect(find(utc, "big_day").value).toBe(10_000_000);
    expect(find(utc, "big_day").achieved_at.bronze).toBe("2026-10-01");
  });

  it("falls back to the numeric offset for an invalid zone id", async () => {
    const response = await GET(
      request("?tz=Not/AZone&tz_offset_minutes=0"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as AchievementsPayload;

    expect(find(body, "big_day").achieved_at.bronze).toBe("2026-10-01");
  });

  it("feeds sessions and sync runs into their achievements", async () => {
    const body = (await (
      await GET(request("?tz=Asia/Shanghai"))
    ).json()) as AchievementsPayload;

    expect(find(body, "project_hopper").value).toBe(1);
    expect(find(body, "marathon_session").value).toBe(3_600_000);
    expect(find(body, "sync_diligence").value).toBe(1);
    expect(find(body, "fleet").value).toBe(1);
  });
});

describe("achievementsPayloadForUser", () => {
  it("uses the injected clock for generated_at and the sessions window", async () => {
    const response = await achievementsPayloadForUser(
      USER_ID,
      new URLSearchParams({ tz: "Asia/Shanghai" }),
      new Date("2026-10-30T04:00:00.000Z"),
    );

    expect(response.status).toBe(200);
    const body = (await response.json()) as AchievementsPayload;

    expect(body.generated_at).toBe("2026-10-30T04:00:00.000Z");
    expect(find(body, "sync_diligence").value).toBe(1);
  });
});
