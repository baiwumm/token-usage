// Tests for the /api/app/projects-hourly data path (docs/projects-page-plan.md
// §5 批次 4): the exact bucket caliber that groups token_usage_hourly by
// project_key. Covers the double-count guard (project rows already exclude the
// "" residual), the pinned unattributed group, revoked-device exclusion and
// the absolute window, while the session caliber route stays untouched.

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

import { GET } from "@/app/api/app/projects-hourly/route";
import {
  projectsHourlyPayloadForUser,
} from "@/lib/api/projects-hourly";
import type { ProjectsPayload } from "@/lib/dashboard/api";

import { USER_ID, initContractEnv } from "../contract/helpers";
import { FakeSupabase, type Row } from "../helpers/fake-supabase";

const fake = new FakeSupabase();
const DEVICE_A = "55555555-5555-4555-8555-555555555555";
const DEVICE_REVOKED = "66666666-6666-4666-8666-666666666666";
const NOW = new Date("2026-10-25T04:00:00.000Z");

function hourly(over: Row = {}): Row {
  return {
    user_id: USER_ID,
    device_id: DEVICE_A,
    hour_start: "2026-10-20T01:00:00.000Z",
    source: "claude",
    model: "claude-x",
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
      updated_at: "2026-09-01T00:00:00.000Z",
    },
  );
}

function request(search = ""): NextRequest {
  return {
    nextUrl: new URL(`http://localhost/api/app/projects-hourly${search}`),
  } as unknown as NextRequest;
}

async function payload(
  search: string,
  now: Date = NOW,
): Promise<ProjectsPayload> {
  const response = await projectsHourlyPayloadForUser(
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

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  seedDevices();
  auth.user = { id: USER_ID };
  auth.configured = true;
});

describe("GET /api/app/projects-hourly — auth gate", () => {
  it("answers 401 without a browser session", async () => {
    auth.user = null;
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });

  it("serves the bucket payload to a signed-in browser session", async () => {
    fake.table("token_usage_hourly").push(
      hourly({ project_key: "alpha", total_tokens: 100 }),
    );
    const response = await GET(request("?from=2026-10-19&to=2026-10-25"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = (await response.json()) as ProjectsPayload;

    expect(body.total).toBe(1);
    expect(body.projects[0].project_key).toBe("alpha");
  });
});

describe("projectsHourlyPayloadForUser — grouping and double-count guard", () => {
  it("groups by project_key, pins the empty-string bucket as unattributed", async () => {
    fake.table("token_usage_hourly").push(
      // Same (hour, source, model): one project row plus the residual row the
      // CLI already writes under project_key "". They must never be merged.
      hourly({ project_key: "alpha", total_tokens: 100, hour_start: "2026-10-20T01:00:00.000Z" }),
      hourly({ project_key: "", total_tokens: 200, hour_start: "2026-10-20T01:00:00.000Z" }),
      hourly({ project_key: "beta", total_tokens: 50, hour_start: "2026-10-21T02:00:00.000Z" }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha", "beta", null]);
    expect(body.caliber).toBe("hourly");
    expect(body.totals).toEqual({
      attributed_tokens: 150,
      unattributed_tokens: 200,
      unattributed_sessions: 1,
      total_cost_usd: "0.000000",
      credits: 0,
    });
    // No double counting: the sum of every row still equals the table total.
    expect(body.projects.reduce((acc, p) => acc + p.total_tokens, 0)).toBe(350);

    const alpha = body.projects.find((p) => p.project_key === "alpha");

    expect(alpha?.total_tokens).toBe(100);
    expect(alpha?.session_count).toBe(1);
    const unattributed = body.projects.find((p) => p.project_key === null);

    expect(unattributed?.name).toBeNull();
    expect(unattributed?.total_tokens).toBe(200);
  });

  it("drops rows from revoked devices and rows outside the absolute window", async () => {
    fake.table("token_usage_hourly").push(
      hourly({ project_key: "alpha", total_tokens: 100 }),
      hourly({ device_id: DEVICE_REVOKED, project_key: "ghost", total_tokens: 999 }),
      // 2026-10-25T16:00Z is the exclusive upper bound for Shanghai 10-26.
      hourly({ hour_start: "2026-10-25T16:00:00.000Z", project_key: "late", total_tokens: 888 }),
      // One minute before the window opens (2026-10-19 00:00 Shanghai).
      hourly({ hour_start: "2026-10-18T15:59:00.000Z", project_key: "early", total_tokens: 777 }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25&tz=Asia/Shanghai");

    expect(keys(body)).toEqual(["alpha"]);
    expect(body.totals.attributed_tokens).toBe(100);
  });

  it("prices every bucket row at read time with the shared pricing engine", async () => {
    fake.table("token_usage_hourly").push(
      // Persisted bucket cost is the legacy 0; composer-1 is $1.25/M input and
      // $10/M output, so the row must be re-costed to 1.25 + 1.00 = 2.25.
      hourly({
        source: "command-code",
        model: "composer-1",
        project_key: "alpha",
        input_tokens: 1_000_000,
        output_tokens: 100_000,
        total_tokens: 1_100_000,
        conversations: 3,
        total_cost_usd: 0,
      }),
      hourly({
        project_key: "",
        total_tokens: 200,
        conversations: 2,
        total_cost_usd: 0,
      }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    const alpha = body.projects.find((p) => p.project_key === "alpha");

    expect(alpha?.total_cost_usd).toBe("2.250000");
    expect(body.totals.total_cost_usd).toBe("2.250000");
    expect(body.totals.total_cost_usd).toBe(
      body.projects
        .reduce((acc, p) => acc + Number(p.total_cost_usd), 0)
        .toFixed(6),
    );
    // Hourly has no session identity: the column is the sum of per-bucket
    // conversation counts (3 + 2), surfaced as bucket entries, not sessions.
    expect(body.totals.unattributed_sessions).toBe(2);
  });

  it("sorts by read-time cost numerically and keeps unattributed last", async () => {
    fake.table("token_usage_hourly").push(
      // Grok carries an authoritative provider-reported cost.
      hourly({ source: "grok", project_key: "alpha", total_tokens: 100, total_cost_usd: 2 }),
      hourly({ source: "grok", project_key: "beta", total_tokens: 50, total_cost_usd: 10 }),
      hourly({ source: "grok", project_key: "", total_tokens: 999, total_cost_usd: 5 }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25&sort=cost");

    expect(keys(body)).toEqual(["beta", "alpha", null]);
    expect(body.projects[0].total_cost_usd).toBe("10.000000");
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
      caliber: "hourly",
      projects: [],
    });
  });

  it("drops zero-usage project rows and reports how many were filtered", async () => {
    fake.table("token_usage_hourly").push(
      hourly({ project_key: "alpha", total_tokens: 100 }),
      // Fully attributed hour (residual is 0) plus an empty scratch bucket.
      hourly({ project_key: "beta", total_tokens: 0, conversations: 2 }),
      hourly({ project_key: "https-openai-com", total_tokens: 0, conversations: 0 }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha"]);
    expect(body.filtered_zero_usage_projects).toBe(2);
    // Same behavior as the session caliber: totals keep the whole window.
    expect(body.totals.attributed_tokens).toBe(100);
  });

  it("keeps the unattributed group even when it carries no usage", async () => {
    fake.table("token_usage_hourly").push(
      hourly({ project_key: "alpha", total_tokens: 100 }),
      // A fully attributed hour leaves a 0-token residual row under "".
      hourly({ project_key: "", total_tokens: 0, conversations: 0 }),
    );
    const body = await payload("from=2026-10-19&to=2026-10-25");

    expect(keys(body)).toEqual(["alpha", null]);
    expect(body.filtered_zero_usage_projects).toBe(0);
  });

  it("rejects malformed windows", async () => {
    const response = await projectsHourlyPayloadForUser(
      USER_ID,
      new URLSearchParams("from=2026-10-25&to=2026-10-19"),
      NOW,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid from/to" });
  });
});
