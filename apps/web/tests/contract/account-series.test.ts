// Golden contract tests for account-summary and the six account series
// (docs/cli-contract.md §2.6–2.7; §3 invariants 6 and 7).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as summaryGet } from "@/app/api/functions/token-usage-account-summary/route";

// The [...slug] catch-all route file is a thin re-export of this handler
// (bracketed folders can't be imported statically); the real route plus the
// legacy alias rewrite are covered by the server-level contract test.
import { handleFunctionsGet as seriesGet } from "@/lib/api/account-series-router";
import { FakeSupabase } from "../helpers/fake-supabase";
import { DEVICE_A, TOKEN_A, JWT, base, initContractEnv, seedScenario } from "./helpers";

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

function series(name: string, query = "", token: string | null = TOKEN_A): Promise<Response> {
  return seriesGet(
    new Request(`${base(`account-${name}`)}${query}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ slug: [`token-usage-account-${name}`] }) },
  );
}

// Expected canonical totals for the seeded scenario (see helpers.ts):
// codex 1500 + claude-code 700 + grok 2000 + cursor 900 (deduped) + trae-cn 600
// = 5700 tokens; stored cost: grok 0.5 authoritative + cursor priced 0.001125.
const EXPECTED_TOTAL = 5700;
const EXPECTED_COST = 0.501125;

describe("auth and scoping", () => {
  it("rejects anonymous calls on every read endpoint", async () => {
    for (const res of await Promise.all([
      summaryGet(new Request(base("account-summary"))),
      series("daily", "?from=2026-10-21&to=2026-10-21", null),
    ])) {
      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: "Unauthorized" });
    }
  });

  it("accepts device tokens and Supabase JWTs alike", async () => {
    for (const token of [TOKEN_A, JWT]) {
      const res = await summaryGet(new Request(base("account-summary"), { headers: { Authorization: `Bearer ${token}` } }));
      expect(res.status).toBe(200);
    }
  });
});

describe("GET account-summary", () => {
  it("returns the frozen schema with a 6-decimal cost string", async () => {
    const res = await summaryGet(new Request(base("account-summary"), { headers: { Authorization: `Bearer ${TOKEN_A}` } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.from).toBe("2026-10-21"); // first day with data
    expect(body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/); // caller-tz today
    expect(body.days).toBe(1);
    expect(body.scope).toBeNull();
    expect(body.excluded_sources).toEqual([]);
    expect(body.totals).toMatchObject({
      total_tokens: EXPECTED_TOTAL,
      billable_total_tokens: EXPECTED_TOTAL,
      // codex 1000 + claude 400 + grok 2000 + cursor 900 + session 300
      input_tokens: 4600,
      conversation_count: 6,
    });
    expect(body.totals.total_cost_usd).toBe("0.501125");
    expect(body.rolling.last_7d).toMatchObject({
      active_days: 1,
      totals: { billable_total_tokens: EXPECTED_TOTAL, conversation_count: 6 },
    });
    expect(body.rolling.last_30d).toMatchObject({
      active_days: 1,
      totals: { billable_total_tokens: EXPECTED_TOTAL },
      avg_per_active_day: EXPECTED_TOTAL,
    });
    // Rolling windows end "today" in the caller's tz and span the right length.
    const l7From = new Date(Date.parse(`${body.rolling.last_7d.to}T00:00:00Z`) - 6 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(body.rolling.last_7d.from).toBe(l7From);
    const l30From = new Date(Date.parse(`${body.rolling.last_30d.to}T00:00:00Z`) - 29 * 86400000)
      .toISOString()
      .slice(0, 10);
    expect(body.rolling.last_30d.from).toBe(l30From);
  });

  it("honors the device_id filter by dropping account-level sources", async () => {
    const res = await summaryGet(
      new Request(`${base("account-summary")}?device_id=${DEVICE_A}`, { headers: { Authorization: `Bearer ${TOKEN_A}` } }),
    );
    const body = await res.json();
    expect(body.totals.total_tokens).toBe(4200); // machine rows of device A only
  });

  it("falls back to explicit from/to and ignores invalid day keys", async () => {
    const res = await summaryGet(
      new Request(`${base("account-summary")}?from=garbage&to=also-bad`, { headers: { Authorization: `Bearer ${TOKEN_A}` } }),
    );
    const body = await res.json();
    expect(body.from).toBe("2026-10-21");
  });
});

describe("series: daily", () => {
  it("buckets the canonical rows per day with per-model counts", async () => {
    const res = await series("daily", "?from=2026-10-21&to=2026-10-21");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.from).toBe("2026-10-21");
    expect(body.to).toBe("2026-10-21");
    expect(body.data).toHaveLength(1);
    const day = body.data[0];
    expect(day).toMatchObject({
      day: "2026-10-21",
      total_tokens: EXPECTED_TOTAL,
      billable_total_tokens: EXPECTED_TOTAL,
      conversation_count: 6,
    });
    expect(day.models).toEqual({
      "test-unpriced-model": 2800,
      "grok-code-fast-1": 2000,
      "composer-1": 900,
    });
    expect(day.total_cost_usd).toBeCloseTo(EXPECTED_COST, 10);
  });

  it("requires from and to", async () => {
    const res = await series("daily", "?from=2026-10-21");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing from/to" });
  });

  it("clamps the window to 1095 days", async () => {
    const res = await series("daily", "?from=2000-01-01&to=2026-10-21");
    const body = await res.json();
    const maxFrom = new Date(Date.parse("2026-10-21T00:00:00Z") - 1095 * 86400000).toISOString().slice(0, 10);
    expect(body.from).toBe(maxFrom);
  });

  it("excludes account-level rows under a device filter", async () => {
    const res = await series("daily", `?from=2026-10-21&to=2026-10-21&device_id=${DEVICE_A}`);
    const body = await res.json();
    expect(body.data[0].total_tokens).toBe(4200);
    expect(body.data[0].models["composer-1"]).toBeUndefined();
  });
});

describe("series: hourly", () => {
  it("emits <day>THH:00:00 keys for the requested day", async () => {
    const res = await series("hourly", "?day=2026-10-21");
    const body = await res.json();
    expect(body.day).toBe("2026-10-21");
    expect(body.data.map((b: { hour: string }) => b.hour)).toEqual([
      "2026-10-21T00:00:00",
      "2026-10-21T02:00:00",
      "2026-10-21T03:00:00",
      "2026-10-21T05:00:00",
      "2026-10-21T07:00:00",
    ]);
    expect(body.data.reduce((sum: number, b: { total_tokens: number }) => sum + b.total_tokens, 0)).toBe(EXPECTED_TOTAL);
  });

  it("rejects a malformed day", async () => {
    const res = await series("hourly", "?day=nope");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Invalid day" });
  });
});

describe("series: monthly", () => {
  it("buckets in UTC from from/to or months", async () => {
    const res = await series("monthly", "?from=2026-10-01&to=2026-10-31");
    const body = await res.json();
    expect(body.data).toHaveLength(1);
    expect(body.data[0].month).toBe("2026-10");
    expect(body.data[0].total_tokens).toBe(EXPECTED_TOTAL);

    const monthsRes = await series("monthly", "?months=2&to=2026-11-30");
    const monthsBody = await monthsRes.json();
    expect(monthsBody.from).toBe("2026-10-01");
    expect(monthsBody.to).toBe("2026-11-30");
  });

  it("requires from/to or months", async () => {
    const res = await series("monthly", "");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing from/to or months" });
  });
});

describe("series: heatmap", () => {
  it("returns the full grid with levels anchored on the max billable day", async () => {
    const res = await series("heatmap", "?weeks=2&to=2026-10-21");
    const body = await res.json();
    expect(body.from).toBe("2026-10-08");
    expect(body.to).toBe("2026-10-21");
    expect(body.weeks).toHaveLength(2);
    expect(body.weeks[0]).toHaveLength(7);
    expect(body.streak_days).toBe(0);
    expect(body.active_days).toBe(1);
    const flat = body.weeks.flat() as Array<{ day: string; total_tokens: number; level: number }>;
    expect(flat).toHaveLength(14);
    const last = flat.at(-1)!;
    expect(last.day).toBe("2026-10-21");
    expect(last.total_tokens).toBe(EXPECTED_TOTAL);
    expect(last.level).toBe(4);
    expect(body.total_cost_usd).toBeCloseTo(EXPECTED_COST, 10);
  });

  it("supports the compact format and week_starts_on", async () => {
    const res = await series("heatmap", "?weeks=1&to=2026-10-21&format=compact&week_starts_on=mon");
    const body = await res.json();
    expect(body.format).toBe("compact");
    expect(body.week_starts_on).toBe("mon");
    expect(body.streak_days).toBe(0);
    expect(body.active_days).toBe(1);
    expect(body.model_names).toEqual(["test-unpriced-model", "grok-code-fast-1", "composer-1"]);
    expect(body.days).toHaveLength(1);
    expect(body.days[0][0]).toBe("2026-10-21");
  });

  it("clamps weeks to 1..104 and defaults to 52", async () => {
    const res = await series("heatmap", "?weeks=9999");
    const body = await res.json();
    expect((body.weeks as unknown[]).length).toBeLessThanOrEqual(104);
    const def = await series("heatmap", "");
    expect((await def.json()).weeks).toHaveLength(52);
  });
});

describe("series: model-breakdown", () => {
  it("aggregates per source with model pricing provenance", async () => {
    const res = await series("model-breakdown", "?from=2026-10-21&to=2026-10-21");
    const body = await res.json();
    expect(body.from).toBe("2026-10-21");
    expect(body.days).toBe(0);
    expect(body.pricing).toMatchObject({
      model: "per-model",
      pricing_mode: "per_token_type",
      source: "litellm",
    });
    const grok = body.sources.find((s: { source: string }) => s.source === "grok");
    expect(grok.models[0]).toMatchObject({
      model: "grok-code-fast-1",
      cost_source: "provider_reported",
    });
    expect(grok.models[0].totals.total_cost_usd).toBe("0.500000");
    const cursor = body.sources.find((s: { source: string }) => s.source === "cursor");
    expect(cursor.models[0]).toMatchObject({ model: "composer-1", cost_source: "model_pricing" });
    expect(cursor.models[0].pricing).toMatchObject({ status: "priced", input: 1.25, output: 10 });
    expect(cursor.totals.total_cost_usd).toBe("0.001125");
  });

  it("requires from and to", async () => {
    const res = await series("model-breakdown", "");
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Missing from/to" });
  });
});

describe("series: devices", () => {
  it("lists active devices by usage plus the account-level split", async () => {
    const res = await series("devices", "?from=2026-10-21&to=2026-10-21");
    const body = await res.json();
    expect(body.devices).toHaveLength(2); // revoked device excluded
    expect(body.devices[0]).toMatchObject({ id: DEVICE_A, total_tokens: 4200 });
    expect(body.devices[1].total_tokens).toBe(0);
    expect(body.account_sources).toEqual([
      { source: "cursor", total_tokens: 900 },
      { source: "trae-cn", total_tokens: 600 },
    ]);
  });
});

describe("series dispatch", () => {
  it("404s unknown series with the catalog", async () => {
    const res = await seriesGet(
      new Request(base("account-bogus"), { headers: { Authorization: `Bearer ${TOKEN_A}` } }),
      { params: Promise.resolve({ slug: ["token-usage-account-bogus"] }) },
    );
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe("Unknown account series: bogus");
    expect(body.series).toEqual(["daily", "hourly", "monthly", "heatmap", "model-breakdown", "devices"]);
  });

  it("404s non-account paths on the catch-all", async () => {
    const res = await seriesGet(
      new Request(base("nonsense"), { headers: { Authorization: `Bearer ${TOKEN_A}` } }),
      { params: Promise.resolve({ slug: ["nonsense"] }) },
    );
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "Not found" });
  });

  it("accepts the series via ?series= query", async () => {
    const res = await seriesGet(
      new Request(`${base("account-anything")}?series=daily&from=2026-10-21&to=2026-10-21`, {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      }),
      { params: Promise.resolve({ slug: ["token-usage-account-anything"] }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).data).toHaveLength(1);
  });
});
