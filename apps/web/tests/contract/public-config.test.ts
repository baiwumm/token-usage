// Golden contract tests for public-config (docs/cli-contract.md §2.5) and the
// global HTTP invariants (§1.2/§1.3, §3 invariant 8).

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { GET as publicConfigGet, POST as publicConfigPost, OPTIONS as publicConfigOptions } from "@/app/api/functions/token-usage-public-config/route";
import { GET as summaryGet, POST as summaryPost, OPTIONS as summaryOptions } from "@/app/api/functions/token-usage-account-summary/route";
import { GET as dashboardGet } from "@/app/api/functions/token-usage-dashboard/route";

import { FakeSupabase } from "../helpers/fake-supabase";
import { TOKEN_A, base, initContractEnv, seedScenario } from "./helpers";

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

describe("GET public-config", () => {
  it("returns only public client values", async () => {
    const res = await publicConfigGet();
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({
      supabase_url: fake.url,
      supabase_anon_key: "fake-anon-key",
      dashboard_url: "http://dashboard.test",
    });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(text).not.toContain("fake-service-role-key");
  });

  it("reports 503 without the public configuration", async () => {
    const previousUrl = process.env.SUPABASE_URL;
    const previousKey = process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    try {
      const res = await publicConfigGet();
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Supabase public configuration is not set" });
    } finally {
      process.env.SUPABASE_URL = previousUrl;
      process.env.SUPABASE_ANON_KEY = previousKey;
    }
  });

  it("POST answers the frozen 405 envelope; OPTIONS answers 204", async () => {
    const post = await publicConfigPost();
    expect(post.status).toBe(405);
    expect(await post.json()).toEqual({ error: "Method not allowed" });
    const options = await publicConfigOptions();
    expect(options.status).toBe(204);
  });
});

describe("global HTTP behavior (§1.2)", () => {
  it("every JSON response carries the CORS headers and no-store", async () => {
    const unauthorized = await summaryGet(new Request(base("account-summary")));
    expect(unauthorized.status).toBe(401);
    expect(unauthorized.headers.get("access-control-allow-origin")).toBe("*");
    expect(unauthorized.headers.get("cache-control")).toBe("no-store");
    expect(unauthorized.headers.get("content-type")).toBe("application/json; charset=utf-8");
  });

  it("401/404 error bodies use the {error} envelope", async () => {
    const unauthorized = await summaryGet(new Request(base("account-summary")));
    expect(await unauthorized.json()).toEqual({ error: "Unauthorized" });

    const notFound = await dashboardGet(
      new Request(base("dashboard"), { headers: { Authorization: "Bearer nope" } }),
    );
    expect(notFound.status).toBe(401);
  });

  it("OPTIONS on GET-only routes still answers 204 via the route export", async () => {
    const res = await summaryOptions();
    expect(res.status).toBe(204);
    expect(await res.text()).toBe("");
  });

  it("POST on a GET-only route answers the frozen 405 envelope", async () => {
    const res = await summaryPost();
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: "Method not allowed" });
  });
});
