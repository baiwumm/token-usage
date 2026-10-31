// Golden contract tests for the subscription snapshots (docs/cli-contract.md
// §2.13 report + §2.14 read face; §3 invariants 15/16).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { POST as reportPost } from "@/app/api/functions/token-usage-subscription-report/route";

import { handleFunctionsGet as seriesGet } from "@/lib/api/account-series-router";
import { FakeSupabase } from "../helpers/fake-supabase";
import {
  TOKEN_A,
  base,
  initContractEnv,
  jsonRequest,
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

function snapshot(over: Record<string, unknown> = {}) {
  return {
    source: "qoder",
    plan: "Pro",
    pools: [
      { name: "个人积分池", unit: "Credits", total: 12000, used: 8340, remaining: 3660 },
    ],
    windows: [{ label: "credits", percent: 69.5, resets_at: "2026-11-24T00:00:00.000Z" }],
    ...over,
  };
}

async function report(body: unknown, token: string | null = TOKEN_A) {
  return reportPost(jsonRequest(base("subscription-report"), { body, token }));
}

async function series(name: string, token: string | null = TOKEN_A): Promise<Response> {
  return seriesGet(
    new Request(`${base(`account-${name}`)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ slug: [`token-usage-account-${name}`] }) },
  );
}

describe("subscription-report auth", () => {
  it("distinguishes missing bearer and unknown token", async () => {
    const missing = await reportPost(
      jsonRequest(base("subscription-report"), { body: { subscriptions: [snapshot()] }, token: null }),
    );
    expect(missing.status).toBe(401);

    const unknown = await report({ subscriptions: [snapshot()] }, "not-a-known-token");
    expect(unknown.status).toBe(401);
  });
});

describe("subscription-report validation (400 invalid_subscription_report)", () => {
  it("rejects non-array and oversize subscription lists", async () => {
    const nonArray = await report({ subscriptions: "nope" });
    expect(nonArray.status).toBe(400);
    expect(await nonArray.json()).toEqual({ error: "invalid_subscription_report" });

    const oversize = await report({
      subscriptions: Array.from({ length: 11 }, (_, i) => snapshot({ source: `s${i}` })),
    });
    expect(oversize.status).toBe(400);
  });

  it("rejects a missing/oversize source", async () => {
    for (const source of ["", "   ", "x".repeat(101)]) {
      const res = await report({ subscriptions: [snapshot({ source })] });
      expect(res.status).toBe(400);
    }
  });

  it("rejects malformed pools and windows", async () => {
    const badPool = await report({
      subscriptions: [snapshot({ pools: [{ total: -1 }] })],
    });
    expect(badPool.status).toBe(400);

    const badPercent = await report({
      subscriptions: [snapshot({ windows: [{ percent: 142 }] })],
    });
    expect(badPercent.status).toBe(400);

    const badReset = await report({
      subscriptions: [snapshot({ windows: [{ resets_at: "not-a-date" }] })],
    });
    expect(badReset.status).toBe(400);
  });

  it("accepts an empty list and an all-optional snapshot", async () => {
    const empty = await report({ subscriptions: [] });
    expect(empty.status).toBe(200);
    expect(await empty.json()).toEqual({ ok: true, upserted: 0 });

    const minimal = await report({ subscriptions: [{ source: "trae" }] });
    expect(minimal.status).toBe(200);
    expect(await minimal.json()).toEqual({ ok: true, upserted: 1 });
  });
});

describe("subscription-report persistence + read face", () => {
  it("upserts per (user, source) with server-derived captured_at", async () => {
    await report({ subscriptions: [snapshot({ plan: "Pro" })] });
    await report({ subscriptions: [snapshot({ plan: "Pro (renewed)" })] });

    const rows = fake.table("token_subscription_snapshots");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "qoder", plan: "Pro (renewed)" });
    expect(rows[0].pools).toHaveLength(1);
    expect(rows[0].captured_at).toEqual(expect.any(String));
  });

  it("keeps one row per source and exposes them sorted by source", async () => {
    await report({
      subscriptions: [snapshot({ source: "qoder" }), snapshot({ source: "trae", plan: "Free", pools: [], windows: [] })],
    });

    const res = await series("subscriptions");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subscriptions.map((s: { source: string }) => s.source)).toEqual([
      "qoder",
      "trae",
    ]);
    expect(body.subscriptions[0]).toMatchObject({
      plan: "Pro",
      pools: [{ name: "个人积分池", unit: "Credits", total: 12000, used: 8340, remaining: 3660 }],
      windows: [{ percent: 69.5 }],
    });
    expect(body.subscriptions[0].captured_at).toEqual(expect.any(String));
  });

  it("rounds numeric fields to 6 decimals", async () => {
    await report({
      subscriptions: [
        snapshot({
          pools: [{ unit: "Credits", total: 1.1234567, used: 0.5, remaining: 0.5 }],
        }),
      ],
    });
    expect(fake.table("token_subscription_snapshots")[0].pools).toEqual([
      { name: null, unit: "Credits", total: 1.123457, used: 0.5, remaining: 0.5 },
    ]);
  });

  it("drops unknown fields (privacy whitelist)", async () => {
    await report({
      subscriptions: [snapshot({ auth_token: "never-store-me" })],
    });
    const row = fake.table("token_subscription_snapshots")[0];
    expect(row.auth_token).toBeUndefined();
  });

  it("requires auth on the read face and serves via ?series= too", async () => {
    await report({ subscriptions: [snapshot()] });

    const anonymous = await series("subscriptions", null);
    expect(anonymous.status).toBe(401);

    const viaQuery = await seriesGet(
      new Request(`${base("account-anything")}?series=subscriptions`, {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      }),
      { params: Promise.resolve({ slug: ["token-usage-account-anything"] }) },
    );
    expect(viaQuery.status).toBe(200);
    expect((await viaQuery.json()).subscriptions).toHaveLength(1);
  });
});
