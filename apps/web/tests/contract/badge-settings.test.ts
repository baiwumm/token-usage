// Contract tests for the settings side of the multi-badge model
// (docs/badge.md §7.1–7.3): GET shape, create, revoke/restore, delete, the
// 10-badge cap, cross-user isolation, the knownProjects projection and the
// session-authenticated owner preview. Fabricated values only.

import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  user: null as { id: string; user_metadata?: { display_name?: string } } | null,
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
  authConfig: () => ({
    url: "http://fake-auth.test",
    publishableKey: "fake-publishable-key",
  }),
}));

import { GET, POST, PUT } from "@/app/api/app/badge/route";
import { DELETE, PATCH } from "@/app/api/app/badge/links/[id]/route";
import { GET as publicBadgeGet } from "@/app/api/badge/route";

import { FakeSupabase, type Row } from "../helpers/fake-supabase";
import { DEVICE_A, USER_ID, initContractEnv } from "./helpers";

const fake = new FakeSupabase();
const APP_URL = "http://localhost/api/app/badge";
const PUBLIC_URL = "http://localhost/api/badge";
const BADGE_TOKEN = `tu_badge_${"a".repeat(32)}`;
const BADGE_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_USER_ID = "99999999-9999-4999-8999-999999999999";
const OTHER_BADGE_ID = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER_BADGE_TOKEN = `tu_badge_${"b".repeat(32)}`;

function session(id: string, project: string | null, tokens: number): Row {
  return {
    user_id: USER_ID,
    device_id: DEVICE_A,
    source: "codex",
    session_id: id,
    project_key: project,
    started_at: "2026-10-01T02:00:00.000Z",
    ended_at: "2026-10-01T03:00:00.000Z",
    input_tokens: tokens,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 0,
    reasoning_output_tokens: 0,
    total_tokens: tokens,
    billable_total_tokens: null,
    models: [
      {
        model: "test-unpriced-model",
        input_tokens: tokens,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: tokens,
      },
    ],
    created_at: "2026-10-01T03:00:00.000Z",
    updated_at: "2026-10-01T03:00:00.000Z",
  };
}

function badgeRow(over: Row = {}): Row {
  return {
    id: BADGE_ID,
    user_id: USER_ID,
    token: BADGE_TOKEN,
    label: "README 徽章",
    style: "panel",
    theme: "auto",
    range: "all",
    project: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    revoked_at: null,
    ...over,
  };
}

function settingsRow(over: Row = {}): Row {
  return {
    user_id: USER_ID,
    enabled: false,
    display_name: "Ming Wei",
    timezone: "UTC",
    allowed_projects: ["alpha"],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    ...over,
  };
}

function request(
  url: string,
  method: string,
  body?: unknown,
): NextRequest {
  return new NextRequest(url, {
    method,
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function context(id: string) {
  return { params: Promise.resolve({ id }) };
}

function seed(): void {
  fake.table("token_public_badge_settings").push(settingsRow());
  fake.table("token_public_badges").push(badgeRow());
  fake.table("token_devices").push({
    id: DEVICE_A,
    user_id: USER_ID,
    device_name: "PC One #aaaa1111",
    platform: "cli-device-flow",
    revoked_at: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  });
  fake.table("token_sessions").push(
    session("s1", "alpha", 100),
    session("s2", "beta", 500),
    session("s3", null, 900),
    session("s4", "beta", 50),
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
  auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };
  seed();
});

describe("/api/app/badge multi-badge config (docs/badge.md §7.1–7.3)", () => {
  it("GET returns the account config plus every badge row, tokens included", async () => {
    const res = await GET(new NextRequest(APP_URL));

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body).toMatchObject({
      enabled: false,
      timezone: "UTC",
      allowedProjects: ["alpha"],
      displayName: "Ming Wei",
      knownProjects: ["beta", "alpha"],
    });
    expect(body.badges).toEqual([
      {
        id: BADGE_ID,
        token: BADGE_TOKEN,
        label: "README 徽章",
        style: "panel",
        theme: "auto",
        range: "all",
        project: null,
        createdAt: "2026-10-01T00:00:00.000Z",
        revokedAt: null,
      },
    ]);
    // §4.1: the single-token fields are gone for good.
    expect(body).not.toHaveProperty("hasToken");
    expect(body).not.toHaveProperty("tokenLast4");
  });

  it("GET answers the documented defaults when no settings row exists yet", async () => {
    fake.tables.token_public_badge_settings.rows = [];
    fake.tables.token_public_badges.rows = [];

    const body = await (await GET(new NextRequest(APP_URL))).json();

    expect(body).toMatchObject({
      enabled: false,
      timezone: "UTC",
      allowedProjects: [],
      displayName: "",
      badges: [],
    });
  });

  it("previews the owner's badge by session, even while disabled", async () => {
    const res = await GET(
      new NextRequest(`${APP_URL}?preview=1&style=panel&theme=light`),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/svg+xml; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-store");
    const svg = await res.text();

    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("Ming Wei");
    expect(svg).not.toContain(BADGE_TOKEN);
    expect(svg).not.toContain(USER_ID);
  });

  it("keeps the allowlist on repo previews and rejects the retired scope", async () => {
    const allowed = await GET(
      new NextRequest(`${APP_URL}?preview=1&project=alpha`),
    );

    expect(await allowed.text()).toContain("ALPHA");

    const outside = await GET(
      new NextRequest(`${APP_URL}?preview=1&project=beta`),
    );

    expect(await outside.text()).toContain("unknown project");

    // 2026-11-13: scope is gone; a legacy preview URL is a bad request.
    const legacy = await GET(
      new NextRequest(`${APP_URL}?preview=1&scope=repo&project=alpha`),
    );

    expect(await legacy.text()).toContain("bad request");
  });

  it("requires the browser session for previews", async () => {
    auth.user = null;
    const res = await GET(new NextRequest(`${APP_URL}?preview=1`));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });

  it("POST adds one badge, enables the switch and leaves existing links working", async () => {
    const res = await POST(
      request(APP_URL, "POST", { label: "Docs", style: "compact" }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.enabled).toBe(true);
    expect(body.badge.token).toMatch(/^tu_badge_[A-Za-z0-9_-]{32}$/);
    expect(body.badge).toMatchObject({
      label: "Docs",
      style: "compact",
      theme: "auto",
      range: "all",
      project: null,
      revokedAt: null,
    });

    const settings = fake.table("token_public_badge_settings")[0] as Row;

    expect(settings.enabled).toBe(true);

    const badges = fake.table("token_public_badges");

    expect(badges).toHaveLength(2);

    // The original token is untouched and now public (the switch went on).
    const original = await publicBadgeGet(
      new Request(`${PUBLIC_URL}?token=${BADGE_TOKEN}`),
    );

    expect(await original.text()).toContain("Ming Wei");
  });

  it("POST snapshots the profile name when creating the first badge", async () => {
    fake.tables.token_public_badge_settings.rows = [];

    const res = await POST(
      request(APP_URL, "POST", { timezone: "Asia/Shanghai" }),
    );

    expect(res.status).toBe(200);

    const settings = fake.table("token_public_badge_settings")[0] as Row;

    expect(settings).toMatchObject({
      user_id: USER_ID,
      enabled: true,
      display_name: "Ming Wei",
      timezone: "Asia/Shanghai",
      allowed_projects: [],
    });
  });

  it("POST defaults a new badge to the sparkline style (2026-11-14)", async () => {
    const res = await POST(request(APP_URL, "POST", {}));

    expect(res.status).toBe(200);
    expect((await res.json()).badge).toMatchObject({ style: "sparkline" });
  });

  it("PUT cascades badges off a project that left the allowlist (§7.1)", async () => {
    // One badge keeps a project that stays allowlisted; one loses its project;
    // the account badge has no project and is untouched.
    (fake.table("token_public_badge_settings")[0] as Row).allowed_projects = [
      "alpha",
      "beta",
    ];
    const keptId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc01";
    const droppedId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc02";

    fake.table("token_public_badges").push(
      badgeRow({
        id: keptId,
        token: `tu_badge_${"c".repeat(32)}`,
        project: "beta",
      }),
      badgeRow({
        id: droppedId,
        token: `tu_badge_${"d".repeat(32)}`,
        project: "alpha",
      }),
    );

    const res = await PUT(request(APP_URL, "PUT", { allowedProjects: ["beta"] }));

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.allowedProjects).toEqual(["beta"]);
    expect(body.badges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: BADGE_ID, project: null }),
        expect.objectContaining({ id: keptId, project: "beta" }),
        expect.objectContaining({ id: droppedId, project: null }),
      ]),
    );
    expect(body.fallbackBadgeIds).toEqual([droppedId]);

    // The row itself was rewritten, not just the response.
    const dropped = fake
      .table("token_public_badges")
      .find((row) => row.id === droppedId) as Row;

    expect(dropped.project).toBeNull();

    // A GET after the cascade sees the rewritten row.
    const after = await (await GET(new NextRequest(APP_URL))).json();

    expect(
      (after.badges as Array<{ id: string; project: string | null }>).find(
        (badge) => badge.id === droppedId,
      )?.project,
    ).toBeNull();
  });

  it("PUT truncates the public name to 30 characters (2026-11-14)", async () => {
    const res = await PUT(
      request(APP_URL, "PUT", { displayName: "x".repeat(35) }),
    );

    expect(res.status).toBe(200);
    expect((await res.json()).displayName).toBe("x".repeat(30));
  });

  it("POST rejects the 11th badge with 409 (revoked rows keep their slot)", async () => {
    for (let index = 1; index < 10; index += 1) {
      fake.table("token_public_badges").push(
        badgeRow({
          id: `cccccccc-cccc-4ccc-8ccc-cccccccccc${String(index).padStart(2, "0")}`,
          token: `tu_badge_${String(index).repeat(32).slice(0, 32)}`,
        }),
      );
    }

    const res = await POST(request(APP_URL, "POST", {}));

    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({ error: "Badge limit reached" });
  });

  it("PATCH revokes and restores the SAME link", async () => {
    (fake.table("token_public_badge_settings")[0] as Row).enabled = true;

    const revoked = await PATCH(
      request(`${APP_URL}/links/${BADGE_ID}`, "PATCH", { revoked: true }),
      context(BADGE_ID),
    );

    expect(revoked.status).toBe(200);
    expect((await revoked.json()).revokedAt).not.toBeNull();

    const hidden = await publicBadgeGet(
      new Request(`${PUBLIC_URL}?token=${BADGE_TOKEN}`),
    );

    expect(await hidden.text()).toContain("badge unavailable");

    const restored = await PATCH(
      request(`${APP_URL}/links/${BADGE_ID}`, "PATCH", { revoked: false }),
      context(BADGE_ID),
    );
    const restoredBody = await restored.json();

    expect(restored.status).toBe(200);
    expect(restoredBody.revokedAt).toBeNull();
    expect(restoredBody.token).toBe(BADGE_TOKEN);

    const visible = await publicBadgeGet(
      new Request(`${PUBLIC_URL}?token=${BADGE_TOKEN}`),
    );

    expect(await visible.text()).toContain("Ming Wei");
  });

  it("PATCH display defaults change what already-embedded links render", async () => {
    const res = await PATCH(
      request(`${APP_URL}/links/${BADGE_ID}`, "PATCH", {
        label: "Compact",
        style: "compact",
        theme: "light",
        project: "alpha",
      }),
      context(BADGE_ID),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      label: "Compact",
      style: "compact",
      theme: "light",
      project: "alpha",
    });

    // The README link carries no parameters and follows the row.
    const svg = await (
      await publicBadgeGet(new Request(`${PUBLIC_URL}?token=${BADGE_TOKEN}`))
    ).text();

    expect(svg).toContain('height="20"');
  });

  it("PATCH enforces the allowlist and field validity", async () => {
    const outside = await PATCH(
      request(`${APP_URL}/links/${BADGE_ID}`, "PATCH", { project: "beta" }),
      context(BADGE_ID),
    );

    expect(outside.status).toBe(400);
    expect(await outside.json()).toEqual({ error: "Project not allowed" });

    const style = await PATCH(
      request(`${APP_URL}/links/${BADGE_ID}`, "PATCH", { style: "banner" }),
      context(BADGE_ID),
    );

    expect(style.status).toBe(400);
  });

  it("DELETE removes the row for good and the link answers unavailable", async () => {
    const res = await DELETE(
      new NextRequest(`${APP_URL}/links/${BADGE_ID}`, { method: "DELETE" }),
      context(BADGE_ID),
    );

    expect(res.status).toBe(204);
    expect(fake.table("token_public_badges")).toHaveLength(0);

    const hidden = await publicBadgeGet(
      new Request(`${PUBLIC_URL}?token=${BADGE_TOKEN}`),
    );

    expect(await hidden.text()).toContain("badge unavailable");

    const body = await (await GET(new NextRequest(APP_URL))).json();

    expect(body.badges).toEqual([]);
  });

  it("another user's badge id answers 404 and stays untouched", async () => {
    fake.table("token_public_badges").push(
      badgeRow({
        id: OTHER_BADGE_ID,
        user_id: OTHER_USER_ID,
        token: OTHER_BADGE_TOKEN,
      }),
    );

    const patched = await PATCH(
      request(`${APP_URL}/links/${OTHER_BADGE_ID}`, "PATCH", {
        revoked: true,
      }),
      context(OTHER_BADGE_ID),
    );

    expect(patched.status).toBe(404);

    const deleted = await DELETE(
      new NextRequest(`${APP_URL}/links/${OTHER_BADGE_ID}`, {
        method: "DELETE",
      }),
      context(OTHER_BADGE_ID),
    );

    expect(deleted.status).toBe(404);

    const other = fake
      .table("token_public_badges")
      .find((row) => row.id === OTHER_BADGE_ID) as Row;

    expect(other.revoked_at).toBeNull();
  });
});
