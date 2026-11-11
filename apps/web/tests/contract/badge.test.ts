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
const badgeDataRoute = await loadSpecModule<BadgeRoute>(
  "../../src/app/api/badge/data/route",
);
const badgeAppRoute = await loadSpecModule<BadgeAppRoute>(
  "../../src/app/api/app/badge/route",
);

const fake = new FakeSupabase();

const BADGE_TOKEN = `tu_badge_${"a".repeat(32)}`;
const BADGE_HASH = createHash("sha256").update(BADGE_TOKEN).digest("hex");
const BADGE_URL = "http://localhost/api/badge";
const DATA_URL = "http://localhost/api/badge/data";
const APP_URL = "http://localhost/api/app/badge";
const SVG_SUCCESS_CACHE =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";
const JSON_SUCCESS_CACHE =
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

  it("prefers custom_avatar_url and never inlines a provider avatar_url (§5.2)", async () => {
    const { GET } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const png = Buffer.from("89504e470d0a1a0a", "hex");

    // The OAuth overwrite case (2026-11-08): every GitHub login rewrites
    // user_metadata.avatar_url to the provider picture, which must stay
    // outside the own-bucket allowlist; the uploaded reference lives in
    // custom_avatar_url and wins.
    fake.adminUsers.set(USER_ID, {
      user_metadata: {
        avatar_url: "https://avatars.githubusercontent.com/u/40554571?v=4",
        custom_avatar_url: `${fake.url}/storage/v1/object/public/avatars/owner.webp`,
      },
    });
    fake.storageObjects.set("owner.webp", { type: "image/webp", body: png });

    const res = await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));

    expect(await res.text()).toContain(
      `href="data:image/webp;base64,${png.toString("base64")}"`,
    );

    // Provider-only metadata: the allowlist rejects the URL outright — no
    // fetch, no inline, first-letter fallback.
    fake.adminUsers.set(USER_ID, {
      user_metadata: {
        avatar_url: "https://avatars.githubusercontent.com/u/40554571?v=4",
      },
    });

    const fallback = await GET(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));

    // Single read: a Response body must not be consumed twice.
    const fallbackText = await fallback.text();

    expect(fallbackText).not.toContain("data:image/webp");
    expect(fallbackText).not.toContain("data:image/png");
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

describe.skipIf(!badgeDataRoute)(
  "GET /api/badge/data aggregate snapshot (docs/badge.md §2.4)",
  () => {
    it("returns the documented JSON envelope and the shared aggregates (§2.4.2)", async () => {
      const { GET } = unwrapSpecModule(
        badgeDataRoute,
        "app/api/badge/data/route",
      );
      const res = await GET(new Request(`${DATA_URL}?token=${BADGE_TOKEN}`));

      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("application/json");
      expect(res.headers.get("cache-control")).toBe(JSON_SUCCESS_CACHE);

      const body = await res.json();

      expect(body.schemaVersion).toBe(1);
      // Same totals the SVG badge renders from BadgeData (18.48B + 0.2M).
      expect(body.totals).toEqual({
        tokens: 18480200000,
        costUsd: expect.any(Number),
        activeDays: 2,
      });
      // Money is capped at cents; shares at 4 decimals.
      expect(Math.round(body.totals.costUsd * 100) / 100).toBe(
        body.totals.costUsd,
      );

      expect(body.meta).toMatchObject({
        firstDay: "2026-10-01",
        lastDay: "2026-10-03",
        sourceCount: 1,
        modelCount: 1,
        longestStreakDays: 1,
      });
      expect(body.meta.peakDay).toEqual({
        day: "2026-10-01",
        tokens: 18480000000,
      });

      // 52 weeks of [day, tokens, level] triples, week-major, ending today in
      // the owner's timezone.
      expect(body.heatmap.cells).toHaveLength(364);
      expect(body.heatmap.activeDays).toBe(2);
      expect(body.fetchedAt).toBe(body.heatmap.to);
      for (const cell of body.heatmap.cells) {
        expect(cell).toHaveLength(3);
        expect(cell[2]).toBeGreaterThanOrEqual(0);
        expect(cell[2]).toBeLessThanOrEqual(4);
      }
      const peak = body.heatmap.cells.find(
        (cell: [string, number, number]) => cell[0] === "2026-10-01",
      );
      expect(peak?.[1]).toBe(18480000000);
      expect(peak?.[2]).toBe(4);

      expect(body.sources).toEqual([
        { label: expect.any(String), tokens: 18480200000, share: 1 },
      ]);
      expect(body.models).toEqual([
        { label: expect.any(String), tokens: 18480200000 },
      ]);
      expect(body.series).toHaveLength(30);
    });

    it("rejects junk tokens with 400 and hides unknown or disabled ones behind 404 (§2.4.3)", async () => {
      const { GET } = unwrapSpecModule(
        badgeDataRoute,
        "app/api/badge/data/route",
      );

      const missing = await GET(new Request(DATA_URL));
      expect(missing.status).toBe(400);
      expect(await missing.json()).toEqual({ error: "bad request" });
      expect(missing.headers.get("cache-control")).toBe("no-store");

      const junk = await GET(new Request(`${DATA_URL}?token=${"x".repeat(200)}`));
      expect(junk.status).toBe(400);

      const unknown = await GET(
        new Request(`${DATA_URL}?token=tu_badge_${"b".repeat(32)}`),
      );
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({ error: "badge unavailable" });

      (fake.table("token_public_badges")[0] as { enabled: boolean }).enabled =
        false;
      const disabled = await GET(
        new Request(`${DATA_URL}?token=${BADGE_TOKEN}`),
      );
      expect(disabled.status).toBe(404);
      expect(await disabled.json()).toEqual({ error: "badge unavailable" });
    });

    it("answers 405/204 and never echoes the token, hash or user id (§2.4.3-4)", async () => {
      const { GET, POST, OPTIONS } = unwrapSpecModule(
        badgeDataRoute,
        "app/api/badge/data/route",
      );

      const post = await POST();
      expect(post.status).toBe(405);
      expect(await post.json()).toEqual({ error: "Method not allowed" });
      expect((await OPTIONS()).status).toBe(204);

      const body = await (
        await GET(new Request(`${DATA_URL}?token=${BADGE_TOKEN}`))
      ).text();

      expect(body).not.toContain(BADGE_TOKEN);
      expect(body).not.toContain(BADGE_HASH);
      expect(body).not.toContain(USER_ID);
      expect(body).not.toContain("data:image/");
    });
  },
);

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
      displayName: "Ming Wei",
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

  it("PUT rewrites the public name without touching the token (§7.1)", async () => {
    const { GET, PUT } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const put = await PUT(
      jsonPostPut("PUT", { displayName: "  Octocat  " }),
    );
    expect(put.status).toBe(200);
    expect((await put.json()).displayName).toBe("Octocat");

    const body = await (await GET(new NextRequest(APP_URL))).json();
    expect(body.displayName).toBe("Octocat");

    // The public surface picks the rewritten snapshot up; the token is intact.
    const { GET: badgeGet } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const badge = await badgeGet(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));
    const svg = await badge.text();

    expect(svg).toContain("Octocat");
    expect(svg).not.toContain("Ming Wei");
    expect(svg).not.toContain(BADGE_TOKEN);
  });

  it("PUT clears the public name and the renderer falls back (§5.2)", async () => {
    const { PUT } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const put = await PUT(jsonPostPut("PUT", { displayName: "" }));
    expect(put.status).toBe(200);
    expect((await put.json()).displayName).toBe("");

    const { GET: badgeGet } = unwrapSpecModule(badgeRoute, "app/api/badge/route");
    const badge = await badgeGet(new Request(`${BADGE_URL}?token=${BADGE_TOKEN}`));

    expect(await badge.text()).toContain("AI Coding Usage");

    // §7.3 parity: the owner preview must match the public badge — an empty
    // row value stays empty (generic label), it does not fall back to the
    // profile name.
    const { GET: appGet } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    const preview = await appGet(
      new NextRequest(`${APP_URL}?preview=1&style=panel&theme=light`),
    );

    const svg = await preview.text();

    expect(svg).toContain("AI Coding Usage");
    expect(svg).not.toContain("Ming Wei");
  });

  it("PUT rejects a non-string displayName with 400", async () => {
    const { PUT } = unwrapSpecModule(badgeAppRoute, "app/api/app/badge/route");
    auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };

    const res = await PUT(jsonPostPut("PUT", { displayName: 42 }));
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
