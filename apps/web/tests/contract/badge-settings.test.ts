// Contract tests for the settings-side additions to /api/app/badge
// (docs/badge.md §7.1–7.3): the knownProjects projection that feeds the
// allowlist picker, and the session-authenticated owner preview. Fabricated
// values only.

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

import { GET } from "@/app/api/app/badge/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import { DEVICE_A, USER_ID, initContractEnv } from "./helpers";

const fake = new FakeSupabase();
const APP_URL = "http://localhost/api/app/badge";
const STORED_HASH = "f".repeat(64);

function session(id: string, project: string | null, tokens: number) {
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

beforeAll(async () => {
  initContractEnv(await fake.listen());
});

afterAll(async () => {
  await fake.close();
});

beforeEach(() => {
  fake.reset();
  auth.user = { id: USER_ID, user_metadata: { display_name: "Ming Wei" } };
  fake.table("token_public_badges").push({
    user_id: USER_ID,
    token_hash: STORED_HASH,
    token_last4: "abcd",
    enabled: false,
    display_name: "Ming Wei",
    timezone: "UTC",
    allowed_projects: ["alpha"],
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
  });
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
});

describe("/api/app/badge settings additions (docs/badge.md §7.1–7.3)", () => {
  it("lists known projects busiest first and skips sessions without one", async () => {
    const res = await GET(new NextRequest(APP_URL));

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.knownProjects).toEqual(["beta", "alpha"]);
    expect(body.tokenLast4).toBe("abcd");
    expect(JSON.stringify(body)).not.toContain(STORED_HASH);
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
    expect(svg).not.toContain(STORED_HASH);
    expect(svg).not.toContain(USER_ID);
  });

  it("keeps the allowlist on repo previews", async () => {
    const allowed = await GET(
      new NextRequest(`${APP_URL}?preview=1&scope=repo&project=alpha`),
    );

    expect(await allowed.text()).toContain("alpha");

    const outside = await GET(
      new NextRequest(`${APP_URL}?preview=1&scope=repo&project=beta`),
    );

    expect(await outside.text()).toContain("unknown project");
  });

  it("requires the browser session for previews", async () => {
    auth.user = null;
    const res = await GET(new NextRequest(`${APP_URL}?preview=1`));

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "Unauthorized" });
  });
});
