// Golden contract tests for the dashboard payload endpoint
// (docs/cli-contract.md §2.10, §3 invariant 6).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as dashboardGet } from "@/app/api/functions/token-usage-dashboard/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import { DEVICE_A, DEVICE_B, JWT, TOKEN_A, base, initContractEnv, seedScenario } from "./helpers";

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

function dashboard(query = "", token: string | null = TOKEN_A): Promise<Response> {
  return dashboardGet(
    new Request(`${base("dashboard")}${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
}

describe("GET dashboard", () => {
  it("rejects anonymous calls", async () => {
    const res = await dashboard("", null);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("rejects unparseable from/to with the frozen message", async () => {
    for (const query of ["?from=nope", "?to=nope", "?from=2026-13-99"]) {
      const res = await dashboard(query);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: "Invalid from/to" });
    }
  });

  it("returns the full payload with device-token principals (user null)", async () => {
    const res = await dashboard("?from=2026-10-21T00:00:00.000Z&to=2026-10-22T00:00:00.000Z");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
    expect(Number.isFinite(Date.parse(body.generated_at))).toBe(true);
    expect(body.range).toEqual({
      key: "custom",
      from: "2026-10-21T00:00:00.000Z",
      to: "2026-10-22T00:00:00.000Z",
      timezone: null,
      offset_minutes: null,
    });

    // One day of machine + cursor + session rows in range.
    expect(body.totals.total_tokens).toBe(5700);
    expect(body.totals.buckets).toBe(5);
    expect(body.totals.active_days).toBe(1);
    expect(body.totals.total_cost_usd).toBeCloseTo(0.501125, 10);
    expect(body.totals.first_hour).toBe("2026-10-21T00:00:00.000Z");
    expect(body.totals.last_hour).toBe("2026-10-21T07:00:00.000Z");
    expect(body.all_time.total_tokens).toBe(5700);

    expect(body.daily).toHaveLength(1);
    expect(body.daily[0]).toMatchObject({
      date: "2026-10-21",
      total_tokens: 5700,
      billable_total_tokens: 5700,
      conversations: 6,
    });

    expect(body.models.map((m: { model: string }) => m.model)).toEqual([
      "test-unpriced-model",
      "grok-code-fast-1",
      "composer-1",
    ]);
    expect(body.models[0].share).toBeCloseTo(2800 / 5700, 10);
    expect(body.models).toHaveLength(3);

    expect(body.sources.map((s: { source: string; total_tokens: number }) => [s.source, s.total_tokens])).toEqual([
      ["grok", 2000],
      ["codex", 1500],
      ["cursor", 900],
      ["claude-code", 700],
      ["trae-cn", 600],
    ]);

    expect(body.shared_account_sources).toMatchObject({
      total_tokens: 1500, // cursor 900 + trae-cn 600
    });
    expect(body.shared_account_sources.sources.map((s: { source: string }) => s.source)).toEqual([
      "cursor",
      "trae-cn",
    ]);
  });

  it("keeps the `to` bound exclusive", async () => {
    const res = await dashboard("?from=2026-10-21T02:00:00.000Z&to=2026-10-21T07:00:00.000Z");
    const body = await res.json();
    // claude 02:00, grok 03:00, cursor 05:00 in; session bucket 07:00 excluded.
    expect(body.totals.total_tokens).toBe(3600);
    expect(body.totals.buckets).toBe(3);
  });

  it("applies tz context to the daily buckets", async () => {
    const res = await dashboard("?from=2026-10-21T00:00:00.000Z&to=2026-10-23T00:00:00.000Z&tz=Asia/Shanghai");
    const body = await res.json();
    expect(body.range.timezone).toBe("Asia/Shanghai");
    // 2026-10-21T20:00Z would split, but our rows all sit early on 10-21 UTC.
    expect(body.daily.map((d: { date: string }) => d.date)).toEqual(["2026-10-21"]);
  });

  it("lists devices active-first, usage-desc, with token-derived last_used_at", async () => {
    const res = await dashboard("");
    const body = await res.json();
    expect(body.devices.map((d: { device_id: string }) => d.device_id)).toEqual([
      DEVICE_A,
      DEVICE_B,
      "44444444-4444-4444-8444-444444444444",
    ]);
    const active = body.devices[0];
    expect(active).toMatchObject({
      device_name: "PC One #aaaa1111",
      platform: "cli-device-flow",
      active: true,
      created_at: "2026-01-01T00:00:00.000Z",
      last_used_at: "2026-10-01T00:00:00.000Z",
    });
    // Revoked device keeps zero usage (its machine rows left the aggregation).
    expect(body.devices[2]).toMatchObject({ active: false, total_tokens: 0 });
  });

  it("reports the account email for JWT principals", async () => {
    const res = await dashboard("", JWT);
    const body = await res.json();
    expect(body.user).toEqual({ id: "11111111-1111-4111-8111-111111111111", email: "owner@example.test" });
  });
});
