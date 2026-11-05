// Spec-first golden contract tests for the public badge endpoint
// (docs/badge.md §2) and the badge config endpoint (§7.1). The route modules
// land with P2; while they are absent the suites skip themselves (see
// tests/helpers/spec-first.ts) so `pnpm verify` stays green. Responses must
// never carry the raw token, its hash or the user id (§1 privacy stance).

import { createHash } from "node:crypto";

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as { id: string; user_metadata?: { display_name?: string } } | null,
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

import { FakeSupabase } from "../helpers/fake-supabase";
import { loadSpecModule, unwrapSpecModule } from "../helpers/spec-first";
import { DEVICE_A, USER_ID, initContractEnv } from "./helpers";

type BadgeRoute = {
  GET: (request: Request) => Promise<Response>;
  POST: () => Promise<Response>;
  OPTIONS: () => Promise<Response>;
};

type BadgeAppRoute = {
  GET: (request: NextRequest) => Promise<Response>;
  POST: (request: NextRequest) => Promise<Response>;
  PUT: (request: NextRequest) => Promise<Response>;
  DELETE: (request: NextRequest) => Promise<Response>;
};

const badgeRoute = await loadSpecModule<BadgeRoute>("../../src/app/api/badge/route");
const badgeAppRoute = await loadSpecModule<BadgeAppRoute>(
  "../../src/app/api/app/badge/route",
);

const fake = new FakeSupabase();

const BADGE_TOKEN = `tu_badge_${"a".repeat(32)}`;
const BADGE_HASH = createHash("sha256").update(BADGE_TOKEN).digest("hex");
const BADGE_URL = "http://localhost/api/badge";
const APP_URL = "http://localhost/api/app/badge";
const SVG_SUCCESS_CACHE =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";

function jsonPostPut(method: string, body: unknown): NextRequest {
  return new NextRequest(APP_URL, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function seedBadgeScenario(): void {
  fake.table("token_public_badges").push({
    user_id: USER_ID,
    token_hash: BADGE_HASH,
    token_last4: BADGE_TOKEN.slice(-4),
    enabled: true,
    display_name: "Ming Wei",
    timezone: "Asia/Shanghai",
    allowed_projects: ["token-usage"],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  });

  // The badge reads the dashboard's canonical rows, which keep active
  // devices only — the usage below belongs to this paired machine.
  fake.table("token_devices").push({
    id: DEVICE_A,
    user_id: USER_ID,
    device_name: "PC One #aaaa1111",
    platform: "cli-device-flow",
    machine_id: "machine-aaaa-1111",
    machine_cluster_id: "machine-aaaa-1111",
    default_device_name: "PC One #aaaa1111",
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });

  // Two distinct owner-timezone days (2026-10-01 / 2026-10-03 in +08:00),
  // total 18,480,200,000 tokens → "18.48B". Cost is the dashboard's read-time
  // pricing (2026-11-02 operator call), not the stored column: gpt-5.2-codex
  // at $1.75/M in + $14/M out → $111,720 + $1.2075 → "$111,721".
  fake.table("token_usage_hourly").push(
    {
      user_id: USER_ID,
      device_id: DEVICE_A,
      hour_start: "2026-10-01T02:00:00.000Z",
      source: "codex",
      model: "gpt-5.2-codex",
      input_tokens: 12000000000,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 6480000000,
      reasoning_output_tokens: 0,
      total_tokens: 18480000000,
      billable_total_tokens: null,
      conversations: 400,
      total_cost_usd: 1318.4,
      updated_at: "2026-10-01T03:00:00.000Z",
    },
    {
      user_id: USER_ID,
      device_id: DEVICE_A,
      hour_start: "2026-10-02T18:30:00.000Z",
      source: "codex",
      model: "gpt-5.2-codex",
      input_tokens: 130000,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 70000,
      reasoning_output_tokens: 0,
      total_tokens: 200000,
      billable_total_tokens: null,
      conversations: 2,
      total_cost_usd: 0,
      updated_at: "2026-10-02T19:30:00.000Z",
    },
  );

  // Repo sessions: "token-usage" is allow-listed, "other-repo" is not — the
  // repo badge must never aggregate across the two (§4.2 exact match).
  const sessionBase = {
    user_id: USER_ID,
    device_id: DEVICE_A,
    source: "codex",
    started_at: "2026-10-01T02:00:00.000Z",
    ended_at: "2026-10-01T03:00:00.000Z",
    input_tokens: 1000,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 500,
    reasoning_output_tokens: 0,
    total_tokens: 1500,
    billable_total_tokens: null,
    created_at: "2026-10-01T03:00:00.000Z",
    updated_at: "2026-10-01T03:00:00.000Z",
  };
  const sessionModels = [
    {
      model: "gpt-5.2-codex",
      input_tokens: 1000,
      cached_input_tokens: 0,
      cache_creation_input_tokens: 0,
      output_tokens: 500,
      reasoning_output_tokens: 0,
      total_tokens: 1500,
    },
  ];
  fake.table("token_sessions").push(
    {
      ...sessionBase,
      session_id: "session-allowlisted",
      project_key: "token-usage",
      models: sessionModels,
    },
    {
      ...sessionBase,
      session_id: "session-other-repo",
      project_key: "other-repo",
      models: sessionModels,
    },
  );
}

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  auth.user = null;
  seedBadgeScenario();
});

describe.skipIf(!badgeRoute)("GET /api/badge (docs/badge.md §2)", () => {
  it("renders the account badge with the documented success headers (§2.2)", async () => {
    const { GET } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const res = await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe(SVG_SUCCESS_CACHE);
    const svg = await res.text();
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Ming Wei");
    expect(svg).toContain("TOKENS");
    expect(svg).toContain("18.48B");
    expect(svg).toContain("$111,721");
  });

  it("degrades to fallback SVGs with no-store per §2.3", async () => {
    const { GET } = unwrapSpecModule(badgeRoute, "app/api/badge/route");

    const unknownToken = await GET(
      new Request(`${BADGE_URL}?token=tu_badge_${"b".repeat(32)}`),
    );
    expect(unknownToken.status).toBe(200);
    expect(unknownToken.headers.get("cache-control")).toBe("no-store");
    expect(await unknownToken.text()).toContain("badge unavailable");

    (fake.table("token_public_badges")[0] as { enabled: boolean }).enabled = false;
    const disabled = await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));
    expect(disabled.headers.get("cache-control")).toBe("no-store");
    expect(await disabled.text()).toContain("badge disabled");

    const unknownProject = await GET(
      new Request(`${BADGE_URL}?token=${BADGE_TOKEN}&scope=repo&project=nope`),
    );
    expect(unknownProject.status).toBe(200);
    expect(await unknownProject.text()).toContain("unknown project");

    const badParams = await GET(
      new Request(`${BADGE_URL}?token=${BADGE_TOKEN}&style=banner`),
    );
    expect(badParams.status).toBe(200);
    expect(await badParams.text()).toContain("bad request");
  });

  it("renders an allow-listed repo badge without cross-project leakage (§4.2)", async () => {
    const { GET } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    // §2.1 (2026-11-04): project alone selects the repo badge.
    const res = await GET(
      new Request(`${BADGE_URL}?token=${BADGE_TOKEN}&project=token-usage`),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe(SVG_SUCCESS_CACHE);
    const svg = await res.text();
    expect(svg).toContain("TOTAL USAGE · TOKEN-USAGE");
    expect(svg).toContain("TOP SOURCES");
    expect(svg).not.toContain("other-repo");
  });

  it("inlines the owner avatar on both scopes (§5.2)", async () => {
    const { GET } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const png = Buffer.from("89504e470d0a1a0a", "hex");

    fake.adminUsers.set(USER_ID, {
      user_metadata: {
        avatar_url: `${fake.url}/storage/v1/object/public/avatars/owner.png`,
      },
    });
    fake.storageObjects.set("owner.png", { type: "image/png", body: png });

    // The account badge carried no avatar until 2026-11-03: the user branch
    // returned the aggregates without `avatarDataUri`.
    const account = await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));

    expect(await account.text()).toContain(
      `href="data:image/png;base64,${png.toString("base64")}"`,
    );

    const repo = await GET(
      new Request(
        `${BADGE_URL}?token=${BADGE_TOKEN}&scope=repo&project=token-usage`,
      ),
    );

    expect(await repo.text()).toContain("data:image/png;base64,");
  });

  it("answers POST with the 405 envelope and OPTIONS with 204 (§2.2)", async () => {
    const { POST, OPTIONS } = unwrapSpecModule(badgeRoute, "app/api/badge/route");

    const post = await POST();
    expect(post.status).toBe(405);
    expect(await post.json()).toEqual({ error: "Method not allowed" });

    const options = await OPTIONS();
    expect(options.status).toBe(204);
  });

  it("never leaks the token, its hash or the user id in any response (§1)", async () => {
    const { GET, POST } = unwrapSpecModule(badgeRoute, "app/api/badge/route");

    const responses = [
      await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`)),
      await GET(new Request(`${BADGE_URL}?token=nope`)),
      await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}&scope=repo&project=token-usage`)),
      await POST(),
    ];

    for (const res of responses) {
      const body = await res.text();
      expect(body).not.toContain(BADGE_TOKEN);
      expect(body).not.toContain(BADGE_HASH);
      expect(body).not.toContain(USER_ID);
    }
  });
});

describe.skipIf(!badgeAppRoute)("/api/app/badge config (docs/badge.md §7.1)", () => {
  it("requires the browser session", async () => {
    const { GET } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    const res = await GET(new NextRequest(APP_URL));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("GET returns the config shape without the raw token", async () => {
    const { GET } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const res = await GET(new NextRequest(APP_URL));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      enabled: true,
      timezone: "Asia/Shanghai",
      allowedProjects: ["token-usage"],
      hasToken: true,
      tokenLast4: BADGE_TOKEN.slice(-4),
    });
    // 2026-11-05: the public page section switches were removed from the
    // config surface; heatmap and achievements are always on.
    expect(body).not.toHaveProperty("showHeatmap");
    expect(body).not.toHaveProperty("showAchievements");
    expect(JSON.stringify(body)).not.toContain(BADGE_TOKEN);
  });

  it("POST generate returns the token exactly once and rotates on the next call", async () => {
    const { POST } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const first = await POST(jsonPostPut("POST", { action: "generate" }));
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.token).toMatch(/^tu_badge_[A-Za-z0-9_-]{32}$/);

    const second = await POST(jsonPostPut("POST", { action: "generate" }));
    const secondBody = await second.json();
    expect(secondBody.token).toMatch(/^tu_badge_[A-Za-z0-9_-]{32}$/);
    expect(secondBody.token).not.toBe(firstBody.token);

    // Rotation invalidates the previous token immediately (§3.2).
    const { GET: badgeGet } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const oldBadge = await badgeGet(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));
    expect(await oldBadge.text()).toContain("badge unavailable");
  });

  it("PUT updates the allowlist and normalizes an invalid timezone to UTC", async () => {
    const { GET, PUT } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const put = await PUT(
      jsonPostPut("PUT", {
        timezone: "Not/AZone",
        allowedProjects: ["token-usage", "My.Repo-2"],
      }),
    );
    expect(put.status).toBe(200);

    const body = await (await GET(new NextRequest(APP_URL))).json();
    expect(body.timezone).toBe("UTC");
    expect(body.allowedProjects).toEqual(["token-usage", "My.Repo-2"]);
  });

  it("PUT rejects allowlist entries over 120 characters with 400", async () => {
    const { PUT } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const res = await PUT(
      jsonPostPut("PUT", { allowedProjects: ["x".repeat(121)] }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: expect.any(String) });
  });

  it("DELETE revokes: badge renders disabled afterwards", async () => {
    const { DELETE } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const del = await DELETE(new NextRequest(APP_URL, { method: "DELETE" }));
    expect(del.status).toBe(200);

    const { GET: badgeGet } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const badge = await badgeGet(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));
    expect(await badge.text()).toContain("badge disabled");
  });
});
