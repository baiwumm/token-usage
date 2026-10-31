// Golden contract tests for account-summary and the six account series
// (docs/cli-contract.md §2.6–2.7; §3 invariants 6 and 7).

import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as summaryGet } from "@/app/api/functions/token-usage-account-summary/route";

// The [...slug] catch-all route file is a thin re-export of this handler
// (bracketed folders can't be imported statically); the real route plus the
// legacy alias rewrite are covered by the server-level contract test.
import { handleFunctionsGet as seriesGet } from "@/lib/api/account-series-router";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";
import {
  DEVICE_A,
  DEVICE_B,
  DEVICE_REVOKED,
  TOKEN_A,
  TOKEN_B,
  USER_ID,
  JWT,
  base,
  initContractEnv,
  seedScenario,
} from "./helpers";

const fake = new FakeSupabase();

beforeAll(async () => {
  initContractEnv(await fake.listen());
  // The fixture sits on fixed dates (2026-10-21) while account-summary's
  // rolling windows end at real "today" — an unpinned clock made last_7d
  // silently drift out of the fixture once the calendar outran it (seen live
  // 2026-10-28). Fake Date only: fetch, timers and the fake Supabase stay real.
  vi.useFakeTimers({ now: new Date("2026-10-21T12:00:00.000Z"), toFake: ["Date"] });
});

afterAll(async () => {
  vi.useRealTimers();
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
      // Only the codex row carries credits (display-only dimension).
      credits: 0.642,
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
      credits: 0.642,
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
    const flat = body.weeks.flat() as Array<{
      day: string;
      total_tokens: number;
      level: number;
      sources: Record<string, number> | null;
    }>;
    expect(flat).toHaveLength(14);
    const last = flat.at(-1)!;
    expect(last.day).toBe("2026-10-21");
    expect(last.total_tokens).toBe(EXPECTED_TOTAL);
    expect(last.level).toBe(4);
    expect(last.sources).toBeTruthy();
    expect(
      Object.values(last.sources ?? {}).reduce(
        (sum, value) => sum + Number(value),
        0,
      ),
    ).toBe(EXPECTED_TOTAL);
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
    // Credits ride the source totals, not the 6dp cost string (§2.4).
    const codex = body.sources.find((s: { source: string }) => s.source === "codex");
    expect(codex.totals.credits).toBe(0.642);
    expect(grok.totals.credits).toBe(0);
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
    // The creation-time name snapshot rides along so the settings page can
    // offer "restore default name" without a second round trip.
    expect(body.devices[0].default_device_name).toBe("PC One #aaaa1111");
    expect(body.devices[1].default_device_name).toBe("Studio Book #bbbb2222");
    expect(body.account_sources).toEqual([
      { source: "cursor", total_tokens: 900 },
      { source: "trae-cn", total_tokens: 600 },
    ]);
  });
});

const SESSION_FROM = "2026-10-21T00:00:00.000Z";
const SESSION_TO = "2026-10-22T00:00:00.000Z";

function sessionRow(over: Row = {}): Row {
  return {
    user_id: USER_ID,
    device_id: DEVICE_A,
    source: "codex",
    session_id: "s1",
    project_key: null,
    started_at: "2026-10-21T09:00:00.000Z",
    ended_at: "2026-10-21T09:30:00.000Z",
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    billable_total_tokens: null,
    models: [],
    created_at: "2026-10-21T09:30:00.000Z",
    updated_at: "2026-10-21T09:30:00.000Z",
    ...over,
  };
}

function sessionModel(model: string, over: Row = {}): Row {
  return {
    model,
    input_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: 0,
    ...over,
  };
}

function seedSessions(): void {
  fake.table("token_sessions").push(
    sessionRow({
      session_id: "s1",
      project_key: "proj-a",
      input_tokens: 600,
      cached_input_tokens: 200,
      cache_creation_input_tokens: 100,
      output_tokens: 100,
      total_tokens: 1000,
      models: [
        sessionModel("test-unpriced-model", {
          input_tokens: 600,
          cached_input_tokens: 200,
          cache_creation_input_tokens: 100,
          output_tokens: 100,
          total_tokens: 1000,
        }),
      ],
    }),
    sessionRow({
      source: "claude-code",
      session_id: "s2",
      started_at: "2026-10-21T11:00:00.000Z",
      ended_at: "2026-10-21T11:30:00.000Z",
      input_tokens: 900,
      total_tokens: 900,
      models: [sessionModel("composer-1", { input_tokens: 900, total_tokens: 900 })],
    }),
    sessionRow({
      device_id: DEVICE_B,
      session_id: "s3",
      project_key: "proj b",
      started_at: "2026-10-21T12:00:00.000Z",
      ended_at: "2026-10-21T12:05:00.000Z",
      input_tokens: 300,
      total_tokens: 300,
    }),
    // Revoked devices keep their rows in the table but never reach the API.
    sessionRow({
      device_id: DEVICE_REVOKED,
      session_id: "s4",
      started_at: "2026-10-21T13:00:00.000Z",
      ended_at: "2026-10-21T13:10:00.000Z",
      input_tokens: 9999,
      total_tokens: 9999,
    }),
  );
}

function sessionQuery(params: Record<string, string> = {}): string {
  return `?${new URLSearchParams({
    from: SESSION_FROM,
    to: SESSION_TO,
    ...params,
  })}`;
}

describe("series: sessions", () => {
  it("aggregates the filtered set, orders by ended_at and hides revoked devices", async () => {
    seedSessions();
    const res = await series("sessions", sessionQuery());
    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.from).toBe(SESSION_FROM);
    expect(body.to).toBe(SESSION_TO);
    expect(body.total).toBe(3);
    expect(body.limit).toBe(50);
    expect(body.offset).toBe(0);
    expect(body.totals).toEqual({
      sessions: 3,
      total_tokens: 2200,
      // s1 billable null falls back to total_tokens.
      billable_total_tokens: 2200,
      // composer-1: 900 input × $1.25/M = 0.001125; unpriced models cost 0.
      total_cost_usd: "0.001125",
      duration_ms: 3_900_000,
    });
    expect(body.sessions.map((item: { session_id: string }) => item.session_id)).toEqual([
      "s3",
      "s2",
      "s1",
    ]);

    const s1 = body.sessions.find((item: { session_id: string }) => item.session_id === "s1");
    expect(s1).toMatchObject({
      device_id: DEVICE_A,
      device_name: "PC One #aaaa1111",
      source: "codex",
      project_key: "proj-a",
      billable_total_tokens: null,
      total_cost_usd: "0.000000",
      duration_ms: 1_800_000,
    });
    expect(s1.models[0]).toEqual({
      model: "test-unpriced-model",
      total_tokens: 1000,
      total_cost_usd: "0.000000",
      share: 1,
    });

    const s2 = body.sessions.find((item: { session_id: string }) => item.session_id === "s2");
    expect(s2.total_cost_usd).toBe("0.001125");
    expect(s2.models[0]).toEqual({
      model: "composer-1",
      total_tokens: 900,
      total_cost_usd: "0.001125",
      share: 1,
    });

    expect(body.facets.sources).toEqual([
      { source: "codex", sessions: 2 },
      { source: "claude-code", sessions: 1 },
    ]);
    expect(body.facets.devices).toEqual([
      { device_id: DEVICE_A, device_name: "PC One #aaaa1111", sessions: 2 },
      { device_id: DEVICE_B, device_name: "PC Two #bbbb2222", sessions: 1 },
    ]);
  });

  it("keeps totals at full-set semantics while paginating", async () => {
    seedSessions();
    const res = await series("sessions", sessionQuery({ limit: "2", offset: "1" }));
    const body = await res.json();

    expect(body.total).toBe(3);
    expect(body.totals.total_tokens).toBe(2200);
    expect(body.sessions.map((item: { session_id: string }) => item.session_id)).toEqual([
      "s2",
      "s1",
    ]);
  });

  it("applies filters while facets ignore their own dimension", async () => {
    seedSessions();

    const byDevice = await (await series("sessions", sessionQuery({ device_id: DEVICE_A }))).json();
    expect(byDevice.total).toBe(2);
    expect(byDevice.facets.sources).toEqual([
      { source: "claude-code", sessions: 1 },
      { source: "codex", sessions: 1 },
    ]);
    // devices ignores device_id so the picker can switch elsewhere.
    expect(byDevice.facets.devices.map((d: { device_id: string }) => d.device_id)).toEqual([
      DEVICE_A,
      DEVICE_B,
    ]);

    const bySource = await (await series("sessions", sessionQuery({ source: "CODEX" }))).json();
    expect(bySource.total).toBe(2);
    expect(bySource.facets.sources).toEqual([
      { source: "codex", sessions: 2 },
      { source: "claude-code", sessions: 1 },
    ]);
    expect(bySource.facets.devices).toEqual([
      { device_id: DEVICE_A, device_name: "PC One #aaaa1111", sessions: 1 },
      { device_id: DEVICE_B, device_name: "PC Two #bbbb2222", sessions: 1 },
    ]);

    const byQuery = await (await series("sessions", sessionQuery({ q: "PROJ" }))).json();
    expect(byQuery.total).toBe(2);
    expect(byQuery.sessions.map((item: { session_id: string }) => item.session_id)).toEqual([
      "s3",
      "s1",
    ]);
  });

  it("treats % and _ in q as literals, not LIKE wildcards", async () => {
    fake.table("token_sessions").push(
      sessionRow({ session_id: "p1", project_key: "100%_done" }),
      sessionRow({ session_id: "p2", project_key: "plain" }),
    );

    const hit = await (await series("sessions", sessionQuery({ q: "%_" }))).json();
    expect(hit.total).toBe(1);
    expect(hit.sessions[0].session_id).toBe("p1");

    const miss = await (await series("sessions", sessionQuery({ q: "\\" }))).json();
    expect(miss.total).toBe(0);
  });

  it("filters on ended_at in [from, to) and keeps cross-window sessions whole", async () => {
    fake.table("token_sessions").push(
      // Ends exactly at from: included.
      sessionRow({
        session_id: "e1",
        started_at: "2026-10-21T09:00:00.000Z",
        ended_at: "2026-10-21T10:00:00.000Z",
        input_tokens: 10,
        total_tokens: 10,
      }),
      // Ends exactly at to: excluded.
      sessionRow({
        session_id: "e2",
        started_at: "2026-10-21T10:30:00.000Z",
        ended_at: "2026-10-21T11:00:00.000Z",
        input_tokens: 20,
        total_tokens: 20,
      }),
      // Started before from but ended inside: included whole.
      sessionRow({
        session_id: "e3",
        started_at: "2026-10-21T09:00:00.000Z",
        ended_at: "2026-10-21T10:59:00.000Z",
        input_tokens: 30,
        total_tokens: 30,
      }),
      // Ended before from: excluded.
      sessionRow({
        session_id: "e4",
        started_at: "2026-10-21T08:00:00.000Z",
        ended_at: "2026-10-21T09:59:00.000Z",
        input_tokens: 40,
        total_tokens: 40,
      }),
    );

    const res = await series(
      "sessions",
      "?from=2026-10-21T10%3A00%3A00.000Z&to=2026-10-21T11%3A00%3A00.000Z",
    );
    const body = await res.json();
    expect(body.total).toBe(2);
    expect(body.sessions.map((item: { session_id: string }) => item.session_id)).toEqual([
      "e3",
      "e1",
    ]);
    expect(body.sessions[0].duration_ms).toBe(7_140_000);
  });

  it("rounds model shares to 4dp and handles zero-token sessions", async () => {
    fake.table("token_sessions").push(
      sessionRow({
        session_id: "r1",
        input_tokens: 3,
        total_tokens: 3,
        models: [
          sessionModel("m1", { input_tokens: 1, total_tokens: 1 }),
          sessionModel("m2", { input_tokens: 2, total_tokens: 2 }),
        ],
      }),
      sessionRow({
        session_id: "r2",
        started_at: "2026-10-21T10:00:00.000Z",
        ended_at: "2026-10-21T10:01:00.000Z",
        total_tokens: 0,
        models: [sessionModel("m0")],
      }),
    );

    const body = await (await series("sessions", sessionQuery())).json();
    const r1 = body.sessions.find((item: { session_id: string }) => item.session_id === "r1");
    expect(r1.models).toEqual([
      { model: "m1", total_tokens: 1, total_cost_usd: "0.000000", share: 0.3333 },
      { model: "m2", total_tokens: 2, total_cost_usd: "0.000000", share: 0.6667 },
    ]);
    const r2 = body.sessions.find((item: { session_id: string }) => item.session_id === "r2");
    expect(r2.models[0].share).toBe(0);
  });

  it("validates parameters and treats account-level sources as empty results", async () => {
    const missing = await series("sessions", "");
    expect(missing.status).toBe(400);
    expect(await missing.json()).toEqual({ error: "Missing from/to" });

    const malformed = await series("sessions", "?from=nope&to=also-nope");
    expect(malformed.status).toBe(400);
    expect(await malformed.json()).toEqual({ error: "Missing from/to" });

    const reversed = await series(
      "sessions",
      "?from=2026-10-22T00%3A00%3A00.000Z&to=2026-10-21T00%3A00%3A00.000Z",
    );
    expect(reversed.status).toBe(400);
    expect(await reversed.json()).toEqual({ error: "Invalid from/to" });

    const badDevice = await series("sessions", sessionQuery({ device_id: "not-a-uuid" }));
    expect(badDevice.status).toBe(400);
    expect(await badDevice.json()).toEqual({ error: "Invalid device_id" });

    for (const source of ["cursor", "trae-cn", "CURSOR"]) {
      const res = await series("sessions", sessionQuery({ source }));
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.total).toBe(0);
      expect(body.sessions).toEqual([]);
      expect(body.totals.sessions).toBe(0);
      expect(body.facets).toEqual({ sources: [], devices: [] });
    }
  });

  it("clamps the window to 1095 days and normalizes paging inputs", async () => {
    seedSessions();
    const clamped = await (
      await series(
        "sessions",
        `?from=2000-01-01T00%3A00%3A00.000Z&to=${encodeURIComponent(SESSION_TO)}`,
      )
    ).json();
    expect(clamped.from).toBe(
      new Date(Date.parse(SESSION_TO) - 1095 * 86_400_000).toISOString(),
    );

    const clampedLimit = await (await series("sessions", sessionQuery({ limit: "999" }))).json();
    expect(clampedLimit.limit).toBe(200);

    const defaultLimit = await (await series("sessions", sessionQuery({ limit: "abc" }))).json();
    expect(defaultLimit.limit).toBe(50);

    const minLimit = await (await series("sessions", sessionQuery({ limit: "0" }))).json();
    expect(minLimit.limit).toBe(1);

    const negativeOffset = await (
      await series("sessions", sessionQuery({ offset: "-10" }))
    ).json();
    expect(negativeOffset.offset).toBe(0);
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
    expect(body.series).toEqual(["daily", "hourly", "monthly", "heatmap", "model-breakdown", "devices", "sessions", "sync-runs"]);
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

describe("negotiation cache (§2.7)", () => {
  it("serves successful GETs with a strong ETag and private no-cache", async () => {
    const res = await series("daily", "?from=2026-10-21&to=2026-10-21");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-cache");
    expect(res.headers.get("etag")).toMatch(/^"[0-9a-f]{32}"$/);
  });

  it("re-validates to a body-less 304 on a matching If-None-Match", async () => {
    const first = await series("daily", "?from=2026-10-21&to=2026-10-21");
    const etag = first.headers.get("etag")!;
    const second = await seriesGet(
      new Request(`${base("account-daily")}?from=2026-10-21&to=2026-10-21`, {
        headers: { Authorization: `Bearer ${TOKEN_A}`, "If-None-Match": etag },
      }),
      { params: Promise.resolve({ slug: ["token-usage-account-daily"] }) },
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
    expect(second.headers.get("etag")).toBe(etag);
  });

  it("binds the ETag to the payload, not the session", async () => {
    const first = await series("daily", "?from=2026-10-21&to=2026-10-21");
    const etag = first.headers.get("etag")!;
    // Different window → different payload → different ETag; the same window
    // on the account's other device token hashes identically (same data).
    const otherWindow = await series("daily", "?from=2026-10-20&to=2026-10-21");
    const otherToken = await series("daily", "?from=2026-10-21&to=2026-10-21", TOKEN_B);

    expect(otherWindow.headers.get("etag")).not.toBe(etag);
    expect(otherToken.headers.get("etag")).toBe(etag);
  });

  it("keeps error envelopes on the stock no-store", async () => {
    const res = await series("daily", "?from=bogus", TOKEN_A);
    expect(res.status).toBe(400);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("etag")).toBeNull();
  });
});
