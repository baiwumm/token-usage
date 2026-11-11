// Golden contract tests for the project-profiles series
// (docs/cli-contract.md §2.13, added 2026-11-11): read-only mirror of the
// /api/app/projects profile merge, served to the desktop via the CLI's
// `tokenusage project-profiles` subcommand. The cookie-face contract tests
// live in project-profiles.test.ts; this file covers the device-token series.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { handleFunctionsGet as seriesGet } from "@/lib/api/account-series-router";
import { FakeSupabase } from "../helpers/fake-supabase";
import {
  TOKEN_A,
  TOKEN_ON_REVOKED_DEVICE,
  USER_ID,
  base,
  initContractEnv,
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
  fake.table("token_project_profiles").push(
    {
      user_id: USER_ID,
      project_key: "token-usage",
      display_name: "Token Usage",
      repo_url: "https://github.com/baiwumm/token-usage",
      repo_hidden: false,
      logo_url: "https://example.test/logo.png",
      logo_object: "project-logos/token-usage.png",
    },
    {
      user_id: USER_ID,
      project_key: "margin",
      display_name: null,
      repo_url: null,
      repo_hidden: true,
      logo_url: null,
      logo_object: null,
    },
  );
  fake.table("token_project_repos").push(
    {
      device_id: "22222222-2222-4222-8222-222222222222",
      project_key: "margin",
      repo_url: "https://github.com/baiwumm/margin",
      updated_at: "2026-04-01T00:00:00.000Z",
    },
    {
      // A revoked device's detection must drop out (same rule as every
      // aggregate): this newer row would otherwise win for "margin".
      device_id: "44444444-4444-4444-8444-444444444444",
      project_key: "margin",
      repo_url: "https://github.com/evil/revoked",
      updated_at: "2026-05-01T00:00:00.000Z",
    },
  );
});

function get(token: string | null = TOKEN_A): Promise<Response> {
  return seriesGet(
    new Request(base("account-project-profiles"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
    { params: Promise.resolve({ slug: ["token-usage-account-project-profiles"] }) },
  );
}

describe("GET /api/functions/token-usage-project-profiles (§2.13)", () => {
  it("returns the merged profiles ordered by project_key", async () => {
    const res = await get();

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      profiles: Array<Record<string, unknown>>;
    };

    expect(body.profiles).toHaveLength(2);
    expect(body.profiles.map((profile) => profile.project_key)).toEqual([
      "margin",
      "token-usage",
    ]);

    const [margin, tokenUsage] = body.profiles;

    // Manual repo_hidden=true suppresses the device detection (web merge rule).
    expect(margin).toMatchObject({
      display_name: null,
      repo_url: null,
      repo_source: null,
      repo_hidden: true,
      logo_url: null,
      logo_upload_url: null,
    });
    expect(tokenUsage).toMatchObject({
      display_name: "Token Usage",
      repo_url: "https://github.com/baiwumm/token-usage",
      repo_source: "manual",
      repo_hidden: false,
      logo_url: "https://example.test/logo.png",
    });
    // Uploaded logos surface as a public storage direct link.
    expect(String(tokenUsage.logo_upload_url)).toContain("project-logos/");
  });

  it("requires a bearer token (401); revoked devices 401 on the GET face (§1.4)", async () => {
    const anonymous = await get(null);

    expect(anonymous.status).toBe(401);

    const revoked = await get(TOKEN_ON_REVOKED_DEVICE);

    expect(revoked.status).toBe(401);
  });

  it("is read-only: the fake tables are unchanged after a call", async () => {
    const before = JSON.stringify(fake.tables);
    await get();

    expect(JSON.stringify(fake.tables)).toBe(before);
  });

  it("keeps the contract 404 + series catalog for unknown slugs (§2.7)", async () => {
    const res = await seriesGet(
      new Request(base("account-nonexistent"), {
        headers: { Authorization: `Bearer ${TOKEN_A}` },
      }),
      { params: Promise.resolve({ slug: ["token-usage-account-nonexistent"] }) },
    );

    expect(res.status).toBe(404);
    const body = (await res.json()) as { series?: string[] };

    expect(body.series).toContain("project-profiles");
  });
});
