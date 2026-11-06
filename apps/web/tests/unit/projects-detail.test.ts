// Tests for the /api/app/projects-detail data path (docs/ui-spec.md「项目（`/projects`）」节):
// auth gate, sessions/hourly caliber parity, continuous daily fill,
// __unattributed grouping, the whole-window range_total_tokens denominator,
// 400 branches, source ordering and the credits-as-separate-dimension rule.
// The fake Supabase backend keeps these deterministic and secret-free.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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

import { GET } from "@/app/api/app/projects-detail/route";
import {
  fillDaily,
  mergeSources,
  projectsDetailPayloadForUser,
  resolveCaliber,
  resolveProjectKey,
  type DayBucket,
  type SourceBucket,
} from "@/lib/api/projects-detail";
import { projectsHourlyPayloadForUser } from "@/lib/api/projects-hourly";
import { projectsPayloadForUser } from "@/lib/api/projects";
import { resetPricingForTests } from "@/lib/pricing";

import { USER_ID, initContractEnv } from "../contract/helpers";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";

const fake = new FakeSupabase();
const DEVICE_A = "55555555-5555-4555-8555-555555555555";
const DEVICE_REVOKED = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-10-25T04:00:00.000Z");
// UTC-fixed day keys keep the expected daily series deterministic.
const WINDOW = "from=2026-10-19&to=2026-10-25&tz_offset_minutes=0";

interface DetailTotals {
  total_tokens: number;
  input_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  conversation_count: number;
  total_cost_usd: string;
  credits: number;
}

interface DailyWire {
  date: string;
  total_tokens: number;
  conversation_count: number;
  total_cost_usd: string;
  sources: Record<string, number>;
}

interface SourceWire {
  source: string;
  total_tokens: number;
  conversation_count: number;
  days_active: number;
  total_cost_usd: string;
}

interface DetailPayload {
  from: string;
  to: string;
  days: number;
  caliber: "sessions" | "hourly";
  project_key: string | null;
  totals: DetailTotals;
  range_total_tokens: number;
  days_active: number;
  daily: DailyWire[];
  sources: SourceWire[];
}

function session(over: Row): Row {
  return {
    user_id: USER_ID,
    device_id: DEVICE_A,
    source: "codex",
    session_id: "s-1",
    project_key: "alpha",
    started_at: "2026-10-20T00:00:00.000Z",
    ended_at: "2026-10-20T01:00:00.000Z",
    input_tokens: 100,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 50,
    reasoning_output_tokens: 0,
    total_tokens: 150,
    billable_total_tokens: null,
    credits: 0,
    // No models => read-time cost is 0 for every session by default.
    models: [],
    ...over,
  };
}

function hourly(over: Row = {}): Row {
  return {
    user_id: USER_ID,
    device_id: DEVICE_A,
    hour_start: "2026-10-20T01:00:00.000Z",
    source: "claude",
    model: "test-unpriced-model",
    project_key: "alpha",
    input_tokens: 100,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 50,
    reasoning_output_tokens: 0,
    total_tokens: 150,
    billable_total_tokens: null,
    conversations: 1,
    total_cost_usd: 0,
    credits: 0,
    ...over,
  };
}

function seedDevices(): void {
  fake.table("token_devices").push(
    {
      id: DEVICE_A,
      user_id: USER_ID,
      device_name: "PC One",
      platform: "cli-device-flow",
      default_device_name: "PC One",
      revoked_at: null,
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-09-01T00:00:00.000Z",
    },
    {
      id: DEVICE_REVOKED,
      user_id: USER_ID,
      device_name: "PC Old",
      platform: "cli-device-flow",
      default_device_name: "PC Old",
      revoked_at: "2026-10-01T00:00:00.000Z",
      created_at: "2026-09-01T00:00:00.000Z",
      updated_at: "2026-10-01T00:00:00.000Z",
    },
  );
}

// Whole-window sessions (UTC 10-19..10-25). Alpha is the target in most tests:
// 600 tokens over days 10-20 (codex 100 + claude-code 200) and 10-22 (300).
// range_total_tokens = 100+200+300+50+40+60 = 750.
function seedSessions(): void {
  fake.table("token_sessions").push(
    session({
      session_id: "alpha-1",
      project_key: "alpha",
      source: "codex",
      ended_at: "2026-10-20T01:00:00.000Z",
      input_tokens: 60,
      cached_input_tokens: 10,
      cache_creation_input_tokens: 5,
      output_tokens: 20,
      reasoning_output_tokens: 5,
      total_tokens: 100,
      credits: 1.5,
    }),
    session({
      session_id: "alpha-2",
      project_key: "alpha",
      source: "claude-code",
      ended_at: "2026-10-20T02:00:00.000Z",
      input_tokens: 100,
      output_tokens: 100,
      total_tokens: 200,
      credits: 0.5,
    }),
    session({
      session_id: "alpha-3",
      project_key: "alpha",
      source: "codex",
      ended_at: "2026-10-22T03:00:00.000Z",
      input_tokens: 200,
      output_tokens: 100,
      total_tokens: 300,
      credits: 2,
    }),
    // Other attributed project.
    session({
      session_id: "beta-1",
      project_key: "beta",
      source: "codex",
      ended_at: "2026-10-21T02:00:00.000Z",
      input_tokens: 30,
      output_tokens: 20,
      total_tokens: 50,
    }),
    // Unattributed: null project_key.
    session({
      session_id: "none-1",
      project_key: null,
      source: "codex",
      ended_at: "2026-10-21T03:00:00.000Z",
      input_tokens: 40,
      output_tokens: 0,
      total_tokens: 40,
      credits: 0.25,
    }),
    // Unattributed: empty-string project_key is trimmed to null.
    session({
      session_id: "none-2",
      project_key: "",
      source: "claude-code",
      ended_at: "2026-10-23T03:00:00.000Z",
      input_tokens: 60,
      output_tokens: 0,
      total_tokens: 60,
      credits: 0.75,
    }),
    // Excluded: revoked device.
    session({
      session_id: "revoked-1",
      device_id: DEVICE_REVOKED,
      project_key: "alpha",
      total_tokens: 999,
      ended_at: "2026-10-21T04:00:00.000Z",
    }),
    // Excluded: account-level sources (never surface in the sessions caliber).
    session({
      session_id: "cursor-1",
      source: "cursor",
      project_key: "alpha",
      total_tokens: 777,
    }),
    session({
      session_id: "trae-1",
      source: "trae-cn",
      project_key: "alpha",
      total_tokens: 666,
    }),
  );
}

// Whole-window hourly buckets. Alpha = 100 (day 10-20, unpriced,
// 2 conversations) + 1_100_000 (day 10-22, composer-1 => read-time $2.25,
// 3 conversations). range_total_tokens = 100+1_100_000+50+200 = 1_100_350.
function seedHourly(): void {
  fake.table("token_usage_hourly").push(
    hourly({
      hour_start: "2026-10-20T01:00:00.000Z",
      source: "claude",
      project_key: "alpha",
      input_tokens: 60,
      output_tokens: 40,
      total_tokens: 100,
      conversations: 2,
      credits: 1,
    }),
    hourly({
      hour_start: "2026-10-22T03:00:00.000Z",
      source: "command-code",
      model: "composer-1",
      project_key: "alpha",
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      total_tokens: 1_100_000,
      conversations: 3,
      credits: 2,
      total_cost_usd: 0,
    }),
    hourly({
      hour_start: "2026-10-21T02:00:00.000Z",
      source: "claude",
      project_key: "beta",
      input_tokens: 30,
      output_tokens: 20,
      total_tokens: 50,
      conversations: 1,
    }),
    // Unattributed residual bucket (project_key "").
    hourly({
      hour_start: "2026-10-21T05:00:00.000Z",
      source: "claude",
      project_key: "",
      input_tokens: 200,
      output_tokens: 0,
      total_tokens: 200,
      conversations: 4,
    }),
    // Excluded by canonicalizeUsage (revoked device).
    hourly({
      hour_start: "2026-10-21T06:00:00.000Z",
      device_id: DEVICE_REVOKED,
      source: "claude",
      project_key: "alpha",
      input_tokens: 999,
      output_tokens: 0,
      total_tokens: 999,
    }),
  );
}

function request(search = ""): NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/app/projects-detail${search}`),
  } as unknown as NextRequest;
}

async function payload(
  search: string,
  now: Date = NOW,
): Promise<DetailPayload> {
  const response = await projectsDetailPayloadForUser(
    USER_ID,
    new URLSearchParams(search),
    now,
  );

  expect(response.status).toBe(200);

  return (await response.json()) as DetailPayload;
}

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  resetPricingForTests();
  seedDevices();
  auth.user = { id: USER_ID };
  auth.configured = true;
  // Force the sessions default regardless of the ambient deployment env.
  delete process.env.NEXT_PUBLIC_PROJECTS_CALIBER;
});

afterEach(() => {
  delete process.env.NEXT_PUBLIC_PROJECTS_CALIBER;
});

describe("GET /api/app/projects-detail — auth gate", () => {
  it("answers 401 without a browser session", async () => {
    auth.user = null;
    const response = await GET(request(`?project=alpha&${WINDOW}`));

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("answers 500 when browser auth is not configured", async () => {
    auth.configured = false;
    const response = await GET(request(`?project=alpha&${WINDOW}`));

    expect(response.status).toBe(500);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Auth not configured" });
  });

  it("serves the detail payload with no-store to a signed-in session", async () => {
    seedSessions();
    const response = await GET(request(`?project=alpha&${WINDOW}`));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as DetailPayload;

    expect(body.caliber).toBe("sessions");
    expect(body.totals.total_tokens).toBe(600);
  });
});

describe("resolveProjectKey / resolveCaliber", () => {
  it("resolves a project, __unattributed and missing/blank", () => {
    expect(resolveProjectKey(new URLSearchParams("project=alpha"))).toEqual({
      key: "alpha",
      unattributed: false,
    });
    expect(resolveProjectKey(new URLSearchParams("project=%20alpha%20"))).toEqual({
      key: "alpha",
      unattributed: false,
    });
    expect(
      resolveProjectKey(new URLSearchParams("project=__unattributed")),
    ).toEqual({ key: null, unattributed: true });
    expect(resolveProjectKey(new URLSearchParams(""))).toBeNull();
    expect(resolveProjectKey(new URLSearchParams("project="))).toBeNull();
    expect(resolveProjectKey(new URLSearchParams("project=%20%20"))).toBeNull();
  });

  it("defaults to sessions and flips only on the exact hourly env value", () => {
    expect(resolveCaliber(new URLSearchParams(""))).toBe("sessions");
    process.env.NEXT_PUBLIC_PROJECTS_CALIBER = "hourly";
    expect(resolveCaliber(new URLSearchParams(""))).toBe("hourly");
    process.env.NEXT_PUBLIC_PROJECTS_CALIBER = "Hourly";
    expect(resolveCaliber(new URLSearchParams(""))).toBe("sessions");
  });

  it("lets the query param override the env default", () => {
    process.env.NEXT_PUBLIC_PROJECTS_CALIBER = "hourly";
    expect(resolveCaliber(new URLSearchParams("caliber=sessions"))).toBe(
      "sessions",
    );
    expect(resolveCaliber(new URLSearchParams("caliber=bogus"))).toBeNull();
  });
});

describe("projectsDetailPayloadForUser — sessions caliber", () => {
  it("returns the exact field set, token composition and continuous daily fill", async () => {
    seedSessions();
    const body = await payload(`project=alpha&${WINDOW}`);

    expect(body.from).toBe("2026-10-19");
    expect(body.to).toBe("2026-10-25");
    expect(body.days).toBe(7);
    expect(body.caliber).toBe("sessions");
    expect(body.project_key).toBe("alpha");

    expect(body.totals).toEqual({
      total_tokens: 600,
      input_tokens: 360,
      cached_input_tokens: 10,
      cache_creation_input_tokens: 5,
      output_tokens: 220,
      reasoning_output_tokens: 5,
      conversation_count: 3,
      total_cost_usd: "0.000000",
      credits: 4,
    });
    // Token composition adds back up to total_tokens (credits excluded).
    expect(
      body.totals.input_tokens +
        body.totals.cached_input_tokens +
        body.totals.cache_creation_input_tokens +
        body.totals.output_tokens +
        body.totals.reasoning_output_tokens,
    ).toBe(body.totals.total_tokens);

    expect(body.range_total_tokens).toBe(750);
    expect(body.days_active).toBe(2);

    // 7 continuous days from 10-19 to min(to, today) = 10-25, zero-filled.
    expect(body.daily.map((day) => day.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
      "2026-10-23",
      "2026-10-24",
      "2026-10-25",
    ]);
    expect(body.daily.map((day) => day.total_tokens)).toEqual([
      0, 300, 0, 300, 0, 0, 0,
    ]);
    expect(body.daily[1]).toEqual({
      date: "2026-10-20",
      total_tokens: 300,
      conversation_count: 2,
      total_cost_usd: "0.000000",
      sources: { codex: 100, "claude-code": 200 },
    });
    expect(body.daily[3].sources).toEqual({ codex: 300 });

    // The per-window source list uses canonical display ids (raw
    // `claude-code` folds into `claude`); the per-day map keeps raw ids and
    // the dialog folds them for display.
    expect(body.sources).toEqual([
      {
        source: "codex",
        total_tokens: 400,
        conversation_count: 2,
        days_active: 2,
        total_cost_usd: "0.000000",
      },
      {
        source: "claude",
        total_tokens: 200,
        conversation_count: 1,
        days_active: 1,
        total_cost_usd: "0.000000",
      },
    ]);
  });

  it("aligns range_total_tokens with the list payload totals", async () => {
    seedSessions();
    const body = await payload(`project=alpha&${WINDOW}`);
    const listResponse = await projectsPayloadForUser(
      USER_ID,
      new URLSearchParams(WINDOW),
      NOW,
    );
    const list = (await listResponse.json()) as {
      totals: { attributed_tokens: number; unattributed_tokens: number };
    };
    const listTotal =
      list.totals.attributed_tokens + list.totals.unattributed_tokens;

    expect(body.range_total_tokens).toBe(750);
    expect(body.range_total_tokens).toBe(listTotal);
    // The target is only one part of the whole-window denominator.
    expect(body.totals.total_tokens).toBeLessThan(body.range_total_tokens);
  });

  it("re-costs sessions at read time per model entry", async () => {
    seedSessions();
    fake.table("token_sessions").push(
      session({
        session_id: "alpha-cost",
        project_key: "alpha",
        source: "command-code",
        ended_at: "2026-10-24T01:00:00.000Z",
        input_tokens: 0,
        output_tokens: 200_000,
        total_tokens: 200_000,
        models: [
          {
            model: "composer-1",
            input_tokens: 0,
            cached_input_tokens: 0,
            cache_creation_input_tokens: 0,
            output_tokens: 200_000,
            reasoning_output_tokens: 0,
            total_tokens: 200_000,
          },
        ],
      }),
    );
    const body = await payload(`project=alpha&${WINDOW}`);

    // 200k output at composer-1's $10/M = $2.00 (read-time estimate).
    expect(body.totals.total_cost_usd).toBe("2.000000");
    expect(body.totals.total_tokens).toBe(200_600); // 600 + the 200k cost row
    expect(body.sources.find((s) => s.source === "command-code")).toEqual({
      source: "command-code",
      total_tokens: 200_000,
      conversation_count: 1,
      days_active: 1,
      total_cost_usd: "2.000000",
    });
  });

  it("keeps credits out of every token column", async () => {
    fake.table("token_sessions").push(
      session({
        session_id: "credits-only",
        project_key: "alpha",
        total_tokens: 10,
        input_tokens: 10,
        output_tokens: 0,
        credits: 12_345,
      }),
    );
    const body = await payload(`project=alpha&${WINDOW}`);

    expect(body.totals.total_tokens).toBe(10);
    expect(body.totals.input_tokens).toBe(10);
    expect(body.totals.output_tokens).toBe(0);
    expect(body.totals.credits).toBe(12_345);
    expect(body.range_total_tokens).toBe(10);
    expect(body.daily.reduce((sum, day) => sum + day.total_tokens, 0)).toBe(10);
  });

  it("returns an all-zero project payload (not 404) when not found", async () => {
    seedSessions();
    const body = await payload(`project=does-not-exist&${WINDOW}`);

    expect(body.project_key).toBe("does-not-exist");
    expect(body.totals).toEqual({
      total_tokens: 0,
      input_tokens: 0,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 0,
      conversation_count: 0,
      total_cost_usd: "0.000000",
      credits: 0,
    });
    expect(body.days_active).toBe(0);
    expect(body.sources).toEqual([]);
    expect(body.daily).toHaveLength(7);
    expect(body.daily.every((day) => day.total_tokens === 0)).toBe(true);
    // The denominator still describes the whole window, even on an empty hit.
    expect(body.range_total_tokens).toBe(750);
  });
});

describe("projectsDetailPayloadForUser — __unattributed group", () => {
  it("groups null and empty-string project keys into the null group", async () => {
    seedSessions();
    const body = await payload(`project=__unattributed&${WINDOW}`);

    expect(body.project_key).toBeNull();
    expect(body.totals.total_tokens).toBe(100); // 40 (null) + 60 ("")
    expect(body.totals.conversation_count).toBe(2);
    expect(body.totals.credits).toBe(1); // 0.25 + 0.75
    expect(body.range_total_tokens).toBe(750);
    expect(body.days_active).toBe(2);
    expect(body.daily.find((day) => day.date === "2026-10-21")?.total_tokens)
      .toBe(40);
    expect(body.daily.find((day) => day.date === "2026-10-23")?.total_tokens)
      .toBe(60);
    // Sources sorted by tokens desc, canonical ids: claude 60 > codex 40.
    expect(body.sources.map((s) => s.source)).toEqual([
      "claude",
      "codex",
    ]);
  });
});

describe("projectsDetailPayloadForUser — hourly caliber (caliber override)", () => {
  it("uses Σconversations, hour_start day keys and read-time cost", async () => {
    seedHourly();
    const body = await payload(`project=alpha&caliber=hourly&${WINDOW}`);

    expect(body.caliber).toBe("hourly");
    expect(body.project_key).toBe("alpha");
    expect(body.totals).toEqual({
      total_tokens: 1_100_100,
      input_tokens: 1_000_060,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 100_040,
      reasoning_output_tokens: 0,
      conversation_count: 5, // 2 + 3 bucket conversations, NOT session rows
      total_cost_usd: "2.250000",
      credits: 3,
    });
    expect(body.range_total_tokens).toBe(1_100_350);
    expect(body.days_active).toBe(2);
    expect(body.daily.map((day) => day.total_tokens)).toEqual([
      0, 100, 0, 1_100_000, 0, 0, 0,
    ]);
    expect(body.daily[1].conversation_count).toBe(2);
    expect(body.daily[3].conversation_count).toBe(3);
    expect(body.sources.map((s) => s.source)).toEqual([
      "command-code",
      "claude",
    ]);
    expect(body.sources[0].total_cost_usd).toBe("2.250000");
  });

  it("aligns hourly range_total_tokens with the hourly list totals", async () => {
    seedHourly();
    const body = await payload(`project=alpha&caliber=hourly&${WINDOW}`);
    const listResponse = await projectsHourlyPayloadForUser(
      USER_ID,
      new URLSearchParams(WINDOW),
      NOW,
    );
    const list = (await listResponse.json()) as {
      totals: { attributed_tokens: number; unattributed_tokens: number };
    };
    const listTotal =
      list.totals.attributed_tokens + list.totals.unattributed_tokens;

    expect(body.range_total_tokens).toBe(1_100_350);
    expect(body.range_total_tokens).toBe(listTotal);
  });

  it("defaults to hourly when NEXT_PUBLIC_PROJECTS_CALIBER=hourly", async () => {
    process.env.NEXT_PUBLIC_PROJECTS_CALIBER = "hourly";
    seedHourly();
    const body = await payload(`project=alpha&${WINDOW}`);

    expect(body.caliber).toBe("hourly");
    expect(body.totals.conversation_count).toBe(5);
    expect(body.range_total_tokens).toBe(1_100_350);
  });

  it("groups the empty-string residual bucket under __unattributed", async () => {
    seedHourly();
    const body = await payload(
      `project=__unattributed&caliber=hourly&${WINDOW}`,
    );

    expect(body.project_key).toBeNull();
    expect(body.totals.total_tokens).toBe(200);
    expect(body.totals.conversation_count).toBe(4);
    expect(body.range_total_tokens).toBe(1_100_350);
  });
});

describe("projectsDetailPayloadForUser — sources ordering / daily window", () => {
  it("sorts sources by tokens desc then source asc on ties", async () => {
    fake.table("token_sessions").push(
      session({
        session_id: "s1",
        source: "zeta",
        total_tokens: 100,
        input_tokens: 100,
        output_tokens: 0,
      }),
      session({
        session_id: "s2",
        source: "alpha",
        total_tokens: 100,
        input_tokens: 100,
        output_tokens: 0,
      }),
      session({
        session_id: "s3",
        source: "beta",
        total_tokens: 250,
        input_tokens: 250,
        output_tokens: 0,
      }),
    );
    const body = await payload(`project=alpha&${WINDOW}`);

    expect(body.sources.map((s) => s.source)).toEqual([
      "beta",
      "alpha",
      "zeta",
    ]);
  });

  it("caps daily at min(to, today) and keeps the full window in totals", async () => {
    seedSessions();
    const body = await payload(
      "project=alpha&from=2026-10-19&to=2026-11-10&tz_offset_minutes=0",
    );

    expect(body.days).toBe(23); // full window, matches the list payload
    expect(body.daily).toHaveLength(7); // truncated at today = 10-25
    expect(body.daily[0].date).toBe("2026-10-19");
    expect(body.daily.at(-1)?.date).toBe("2026-10-25");
    expect(body.range_total_tokens).toBe(750);
    expect(body.totals.total_tokens).toBe(600);
  });

  it("rejects a missing project, a bad caliber and an invalid window", async () => {
    const missing = await projectsDetailPayloadForUser(
      USER_ID,
      new URLSearchParams(WINDOW),
      NOW,
    );

    expect(missing.status).toBe(400);
    expect(missing.headers.get("cache-control")).toBe("no-store");
    expect(await missing.json()).toEqual({ error: "Missing project" });

    const badCaliber = await projectsDetailPayloadForUser(
      USER_ID,
      new URLSearchParams(`project=alpha&caliber=bogus&${WINDOW}`),
      NOW,
    );

    expect(badCaliber.status).toBe(400);
    expect(await badCaliber.json()).toEqual({ error: "Invalid caliber" });

    for (const search of [
      `project=alpha&from=2026-10-19`,
      `project=alpha&from=2026-10-25&to=2026-10-19&tz_offset_minutes=0`,
    ]) {
      const badWindow = await projectsDetailPayloadForUser(
        USER_ID,
        new URLSearchParams(search),
        NOW,
      );

      expect(badWindow.status).toBe(400);
      expect(await badWindow.json()).toEqual({ error: "Invalid from/to" });
    }
  });
});

describe("pure builders — fillDaily / mergeSources", () => {
  it("fillDaily fills a continuous range, truncates to today and caps at 60", () => {
    const byDay = new Map<string, DayBucket>([
      [
        "2026-10-20",
        {
          total_tokens: 300,
          conversation_count: 2,
          total_cost_usd: 0,
          sources: new Map([["codex", 300]]),
        },
      ],
    ]);

    const filled = fillDaily("2026-10-19", "2026-10-22", "2026-10-22", byDay);

    expect(filled.map((day) => day.date)).toEqual([
      "2026-10-19",
      "2026-10-20",
      "2026-10-21",
      "2026-10-22",
    ]);
    expect(filled[0]).toEqual({
      date: "2026-10-19",
      total_tokens: 0,
      conversation_count: 0,
      total_cost_usd: "0.000000",
      sources: {},
    });
    expect(filled[1].sources).toEqual({ codex: 300 });

    // to in the future: the series stops at `today`.
    const truncated = fillDaily(
      "2026-10-19",
      "2026-12-31",
      "2026-10-25",
      byDay,
    );

    expect(truncated.at(-1)?.date).toBe("2026-10-25");
    expect(truncated).toHaveLength(7);

    // > 60 days: only the most recent 60 survive.
    const capped = fillDaily(
      "2026-01-01",
      "2026-12-31",
      "2026-12-31",
      new Map(),
    );

    expect(capped).toHaveLength(60);
    expect(capped.at(-1)?.date).toBe("2026-12-31");
    expect(capped.every((day) => day.total_tokens === 0)).toBe(true);
  });

  it("mergeSources folds alias sources into one canonical row", () => {
    const bySource = new Map<string, SourceBucket>([
      [
        "pi",
        {
          source: "pi",
          total_tokens: 300,
          conversation_count: 4,
          total_cost_usd: 0.5,
          dayTokens: new Map([
            ["2026-10-20", 100],
            ["2026-10-21", 200],
          ]),
        },
      ],
      [
        "pi-stepfun",
        {
          source: "pi-stepfun",
          total_tokens: 700,
          conversation_count: 6,
          total_cost_usd: 1,
          // Same day as the alias above: the active-day count is a union, not
          // a sum, so this still counts as two days overall.
          dayTokens: new Map([["2026-10-21", 700]]),
        },
      ],
    ]);

    expect(mergeSources(bySource)).toEqual([
      {
        source: "pi",
        total_tokens: 1000,
        conversation_count: 10,
        days_active: 2,
        total_cost_usd: "1.500000",
      },
    ]);
  });

  it("mergeSources sorts desc, ties by source and computes days_active", () => {
    const bySource = new Map<string, SourceBucket>([
      [
        "zeta",
        {
          source: "zeta",
          total_tokens: 100,
          conversation_count: 1,
          total_cost_usd: 0,
          dayTokens: new Map([
            ["2026-10-20", 100],
            ["2026-10-21", 0],
          ]),
        },
      ],
      [
        "alpha",
        {
          source: "alpha",
          total_tokens: 100,
          conversation_count: 2,
          total_cost_usd: 1.5,
          dayTokens: new Map([["2026-10-20", 100]]),
        },
      ],
      [
        "beta",
        {
          source: "beta",
          total_tokens: 250,
          conversation_count: 3,
          total_cost_usd: 0,
          dayTokens: new Map([["2026-10-22", 250]]),
        },
      ],
    ]);

    expect(mergeSources(bySource)).toEqual([
      {
        source: "beta",
        total_tokens: 250,
        conversation_count: 3,
        days_active: 1,
        total_cost_usd: "0.000000",
      },
      {
        source: "alpha",
        total_tokens: 100,
        conversation_count: 2,
        days_active: 1,
        total_cost_usd: "1.500000",
      },
      {
        source: "zeta",
        total_tokens: 100,
        conversation_count: 1,
        days_active: 1,
        total_cost_usd: "0.000000",
      },
    ]);
  });
});
