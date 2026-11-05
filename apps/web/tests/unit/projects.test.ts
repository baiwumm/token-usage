// Tests for the /api/app/projects data path (docs/ui-spec.md「项目（`/projects`）」节
// 批次 1): cookie-auth gate, window/sort/limit handling, project_key grouping
// with the pinned unattributed group, revoked-device exclusion and the
// sessions-identical read-time cost pricing. The fake Supabase backend keeps
// these deterministic and secret-free.

import {
  afterAll,
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

import { GET } from "@/app/api/app/projects/route";
import { projectsPayloadForUser } from "@/lib/api/projects";
import type { ProjectsPayload } from "@/lib/dashboard/api";
import { resetPricingForTests } from "@/lib/pricing";

import { USER_ID, initContractEnv } from "../contract/helpers";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";

const fake = new FakeSupabase();
const DEVICE_A = "55555555-5555-4555-8555-555555555555";
const DEVICE_REVOKED = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-10-25T04:00:00.000Z");

// Unpriced model keeps cost math at 0 unless a test picks composer-1
// (curated: input 1.25 / output 10 per million).
const UNPRICED = "test-unpriced-model";

function modelEntry(model: string, tokens: Record<string, number>): Row {
  return {
    model,
    input_tokens: tokens.input ?? 0,
    cached_input_tokens: tokens.cached ?? 0,
    cache_creation_input_tokens: tokens.cacheCreation ?? 0,
    output_tokens: tokens.output ?? 0,
    reasoning_output_tokens: tokens.reasoning ?? 0,
    total_tokens: tokens.total ?? 0,
  };
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
    models: [modelEntry(UNPRICED, { input: 100, output: 50, total: 150 })],
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

function seedProjects(): void {
  fake.table("token_sessions").push(
    // alpha: two sessions on two tz days (UTC 2026-10-20 and 2026-10-21).
    session({
      session_id: "alpha-1",
      project_key: "alpha",
      total_tokens: 100,
      ended_at: "2026-10-20T01:00:00.000Z",
    }),
    session({
      session_id: "alpha-2",
      project_key: "alpha",
      total_tokens: 200,
      ended_at: "2026-10-21T01:00:00.000Z",
    }),
    // beta: one session.
    session({
      session_id: "beta-1",
      project_key: "beta",
      total_tokens: 50,
      ended_at: "2026-10-21T02:00:00.000Z",
    }),
    // Unattributed: null project_key groups into one pinned-bottom entry.
    session({
      session_id: "none-1",
      project_key: null,
      total_tokens: 40,
      ended_at: "2026-10-21T03:00:00.000Z",
    }),
    session({
      session_id: "none-2",
      project_key: null,
      total_tokens: 60,
      ended_at: "2026-10-22T03:00:00.000Z",
    }),
    // A revoked device's sessions never surface.
    session({
      session_id: "revoked-1",
      device_id: DEVICE_REVOKED,
      project_key: "ghost",
      total_tokens: 999,
      ended_at: "2026-10-21T04:00:00.000Z",
    }),
  );
}

function request(search = ""): NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/app/projects${search}`),
  } as unknown as NextRequest;
}

async function payload(
  search: string,
  now: Date = NOW,
): Promise<ProjectsPayload> {
  const response = await projectsPayloadForUser(
    USER_ID,
    new URLSearchParams(search),
    now,
  );

  expect(response.status).toBe(200);

  return (await response.json()) as ProjectsPayload;
}

function keys(body: ProjectsPayload): Array<string | null> {
  return body.projects.map((project) => project.project_key);
}

function find(
  body: ProjectsPayload,
  key: string | null,
): ProjectsPayload["projects"][number] {
  const found = body.projects.find((project) => project.project_key === key);

  if (!found) throw new Error(`missing project ${key}`);

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
  resetPricingForTests();
  seedDevices();
  auth.user = { id: USER_ID };
  auth.configured = true;
});

describe("GET /api/app/projects — auth gate", () => {
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

  it("serves the payload to a signed-in browser session", async () => {
    seedProjects();
    const response = await GET(request("?from=2026-10-19&to=2026-10-25"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as ProjectsPayload;

    expect(body.total).toBe(3);
  });
});

describe("projectsPayloadForUser — source icons", () => {
  it("orders a project's sources by token share, ties by id", async () => {
    fake.table("token_sessions").push(
      session({
        session_id: "gamma-1",
        project_key: "gamma",
        source: "codex",
        total_tokens: 100,
        ended_at: "2026-10-20T01:00:00.000Z",
      }),
      session({
        session_id: "gamma-2",
        project_key: "gamma",
        source: "claude-code",
        total_tokens: 300,
        ended_at: "2026-10-20T02:00:00.000Z",
      }),
      session({
        session_id: "gamma-3",
        project_key: "gamma",
        source: "zeta",
        total_tokens: 300,
        ended_at: "2026-10-20T03:00:00.000Z",
      }),
    );

    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(find(body, "gamma").sources).toEqual([
      "claude-code",
      "zeta",
      "codex",
    ]);
  });
});

describe("projectsPayloadForUser — grouping", () => {
  it("aggregates per project and pins the unattributed group last", async () => {
    seedProjects();
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha", "beta", null]);
    expect(body.total).toBe(3);
    expect(body.limit).toBe(200);
    expect(body.offset).toBe(0);

    const alpha = find(body, "alpha");

    expect(alpha.name).toBe("alpha");
    expect(alpha.total_tokens).toBe(300);
    expect(alpha.session_count).toBe(2);
    expect(alpha.total_cost_usd).toBe("0.000000");
    expect(alpha.last_active).toBe("2026-10-21T01:00:00.000Z");
    expect(alpha.day_peak).toEqual({
      date: "2026-10-21",
      total_tokens: 200,
    });

    const unattributed = find(body, null);

    expect(unattributed.name).toBeNull();
    expect(unattributed.total_tokens).toBe(100);
    expect(unattributed.session_count).toBe(2);

    expect(body.totals).toEqual({
      attributed_tokens: 350,
      unattributed_tokens: 100,
      unattributed_sessions: 2,
      total_cost_usd: "0.000000",
      credits: 0,
    });
    expect(body.caliber).toBe("sessions");
  });

  it("drops sessions from revoked devices and account-level sources", async () => {
    seedProjects();
    fake.table("token_sessions").push(
      session({
        session_id: "cursor-1",
        source: "cursor",
        project_key: "cursor-project",
        total_tokens: 777,
      }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).not.toContain("ghost");
    expect(keys(body)).not.toContain("cursor-project");
    expect(body.total).toBe(3);
  });

  it("answers an empty payload when nothing matches", async () => {
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(body).toEqual({
      from: "2026-10-19",
      to: "2026-10-25",
      days: 7,
      total: 0,
      limit: 200,
      offset: 0,
      totals: {
        attributed_tokens: 0,
        unattributed_tokens: 0,
        unattributed_sessions: 0,
        total_cost_usd: "0.000000",
        credits: 0,
      },
      filtered_zero_usage_projects: 0,
      caliber: "sessions",
      projects: [],
    });
  });
});

describe("projectsPayloadForUser — zero-usage rows", () => {
  it("drops zero-usage project rows (session shells) and reports the count", async () => {
    seedProjects();
    fake.table("token_sessions").push(
      // Codex Desktop onboarding dir and a Qoder subagent transcript: both
      // carry a project key but no tokens, cost or credits.
      session({
        session_id: "scratch-1",
        project_key: "https-openai-com",
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        models: [],
      }),
      session({
        session_id: "agents-1",
        project_key: "subagents",
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        models: [],
      }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha", "beta", null]);
    expect(body.total).toBe(3);
    expect(body.filtered_zero_usage_projects).toBe(2);
    // Totals still describe the whole window (the dropped rows were 0 anyway).
    expect(body.totals).toEqual({
      attributed_tokens: 350,
      unattributed_tokens: 100,
      unattributed_sessions: 2,
      total_cost_usd: "0.000000",
      credits: 0,
    });
  });

  it("keeps the unattributed group even when it carries no usage", async () => {
    fake.table("token_sessions").push(
      session({ session_id: "alpha-1", project_key: "alpha", total_tokens: 100 }),
      session({
        session_id: "none-zero",
        project_key: null,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        models: [],
      }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha", null]);
    expect(body.filtered_zero_usage_projects).toBe(0);
    expect(body.totals.unattributed_sessions).toBe(1);
  });
});

describe("projectsPayloadForUser — window", () => {
  it("defaults to the last 7 days ending today in the caller's tz", async () => {
    fake.table("token_sessions").push(
      // Inside the default window (Shanghai 2026-10-19..2026-10-25).
      session({ session_id: "in-1", ended_at: "2026-10-20T02:00:00.000Z" }),
      // 2026-10-18 23:59 Shanghai — one minute before the window opens.
      session({ session_id: "out-1", ended_at: "2026-10-18T15:59:00.000Z" }),
      // 2026-10-26 00:00 Shanghai — the exclusive upper bound.
      session({ session_id: "out-2", ended_at: "2026-10-25T16:00:00.000Z" }),
    );
    const body = await payload("tz=Asia/Shanghai");

    expect(body.from).toBe("2026-10-19");
    expect(body.to).toBe("2026-10-25");
    expect(body.days).toBe(7);
    expect(body.total).toBe(1);
    expect(find(body, "alpha").session_count).toBe(1);
  });

  it("buckets the day peak by the requested timezone", async () => {
    fake.table("token_sessions").push(
      // 2026-10-20T17:00Z is 2026-10-21 01:00 in Shanghai.
      session({ session_id: "peak-1", ended_at: "2026-10-20T17:00:00.000Z" }),
    );
    const shanghai = await payload(
      "from=2026-10-19&to=2026-10-25&tz=Asia/Shanghai",
    );

    expect(find(shanghai, "alpha").day_peak?.date).toBe("2026-10-21");

    const utc = await payload(
      "from=2026-10-19&to=2026-10-25&tz_offset_minutes=0",
    );

    expect(find(utc, "alpha").day_peak?.date).toBe("2026-10-20");
  });

  it("rejects malformed and reversed windows", async () => {
    for (const search of [
      "from=2026-10-19",
      "to=2026-10-25",
      "from=garbage&to=2026-10-25",
      "from=2026-10-25&to=2026-10-19",
    ]) {
      const response = await projectsPayloadForUser(
        USER_ID,
        new URLSearchParams(search),
        NOW,
      );

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "Invalid from/to" });
    }
  });
});

describe("projectsPayloadForUser — sort", () => {
  beforeEach(() => {
    fake.table("token_sessions").push(
      // alpha: more tokens, lower cost ($2: 200k output at composer-1 rates).
      session({
        session_id: "alpha-1",
        project_key: "alpha",
        input_tokens: 0,
        output_tokens: 200_000,
        total_tokens: 200_000,
        models: [
          modelEntry("composer-1", { output: 200_000, total: 200_000 }),
        ],
      }),
      // beta: fewer tokens, higher cost ($10).
      session({
        session_id: "beta-1",
        project_key: "beta",
        input_tokens: 0,
        output_tokens: 1_000_000,
        total_tokens: 150_000,
        models: [
          modelEntry("composer-1", { output: 1_000_000, total: 1_000_000 }),
        ],
      }),
    );
  });

  it("sorts by tokens desc by default", async () => {
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha", "beta"]);
    expect(find(body, "alpha").total_cost_usd).toBe("2.000000");
    expect(find(body, "beta").total_cost_usd).toBe("10.000000");
  });

  it("sorts by cost numerically (10 > 2, not string order)", async () => {
    const body = await payload("from=2026-10-19&to=2026-10-25&sort=cost");

    expect(keys(body)).toEqual(["beta", "alpha"]);
  });

  it("rejects an unknown sort key", async () => {
    const response = await projectsPayloadForUser(
      USER_ID,
      new URLSearchParams("sort=name"),
      NOW,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid sort" });
  });
});

describe("projectsPayloadForUser — paging", () => {
  beforeEach(() => {
    seedProjects();
  });

  it("clamps limit into 1..500 and defaults to 200", async () => {
    expect((await payload("from=2026-10-19&to=2026-10-25&limit=0")).limit).toBe(
      1,
    );
    expect(
      (await payload("from=2026-10-19&to=2026-10-25&limit=9999")).limit,
    ).toBe(500);
    expect(
      (await payload("from=2026-10-19&to=2026-10-25&limit=abc")).limit,
    ).toBe(200);
  });

  it("slices the page while total reflects the full group count", async () => {
    const first = await payload("from=2026-10-19&to=2026-10-25&limit=2");

    expect(first.total).toBe(3);
    expect(keys(first)).toEqual(["alpha", "beta"]);

    const second = await payload(
      "from=2026-10-19&to=2026-10-25&limit=2&offset=2",
    );

    expect(second.offset).toBe(2);
    expect(keys(second)).toEqual([null]);
  });
});
