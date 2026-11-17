// Demo instance gate (docs/demo-instance-plan.md §5/§10, P1).
//
// The gate lives in the proxy so the frozen contract handlers keep their error
// codes untouched. These tests pin the three behaviors that matter: writes
// answer 403 with one envelope, the contract's own 405 still wins for verbs it
// already rejects, reads and the demo sign-in stay reachable, and anonymous
// page hits go straight to the demo sign-in instead of the login form.

import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { DEMO_WRITE_ERROR, demoWriteNotice, isDemoWriteError } from "@/lib/demo";
import { proxy } from "@/proxy";

function request(path: string, method = "GET"): NextRequest {
  return new NextRequest(`http://demo.localhost${path}`, { method });
}

function isPassThrough(response: Response): boolean {
  return (
    response.headers.get("x-middleware-next") === "1" &&
    !response.headers.get("location")
  );
}

beforeEach(() => {
  process.env.TOKEN_USAGE_DEMO = "on";
  process.env.TOKEN_USAGE_DEMO_EMAIL = "demo@example.test";
  process.env.TOKEN_USAGE_DEMO_PASSWORD = "fake-demo-password";
  process.env.TOKEN_USAGE_DASHBOARD_URL = "https://demo.token-usage.test";
});

afterEach(() => {
  delete process.env.TOKEN_USAGE_DEMO;
  delete process.env.TOKEN_USAGE_DEMO_EMAIL;
  delete process.env.TOKEN_USAGE_DEMO_PASSWORD;
  delete process.env.TOKEN_USAGE_DASHBOARD_URL;
});

describe("demo write gate", () => {
  it.each(["POST", "PUT", "PATCH", "DELETE"])(
    "rejects %s on /api/app/*",
    async (method) => {
      const response = await proxy(request("/api/app/badge", method));

      expect(response.status).toBe(403);
      expect(await response.json()).toEqual({ error: DEMO_WRITE_ERROR });
      expect(response.headers.get("cache-control")).toBe("no-store");
    },
  );

  it("rejects contract writes but keeps the frozen 405 for other verbs", async () => {
    expect(
      (await proxy(request("/api/functions/token-usage-ingest", "POST"))).status,
    ).toBe(403);
    // The contract gate runs first, so its envelope is unchanged on demo.
    expect(
      (await proxy(request("/api/functions/token-usage-ingest", "PUT"))).status,
    ).toBe(405);
  });

  it("lets reads through", async () => {
    expect(
      isPassThrough(await proxy(request("/api/app/badge", "GET"))),
    ).toBe(true);
    expect(
      isPassThrough(
        await proxy(request("/api/functions/token-usage-public-config")),
      ),
    ).toBe(true);
  });

  it("keeps the demo sign-in reachable", async () => {
    const response = await proxy(request("/api/app/demo-login?next=%2F"));

    // Not a 403: the route itself decides (GET, demo mode only).
    expect(response.status).not.toBe(403);
  });
});

describe("demo page guard", () => {
  it("sends anonymous visitors into the demo sign-in with the original target", async () => {
    const response = await proxy(request("/settings?section=devices"));
    const target = new URL(response.headers.get("location") || "");

    expect([302, 307]).toContain(response.status);
    expect(target.pathname).toBe("/api/app/demo-login");
    expect(target.searchParams.get("next")).toBe("/settings?section=devices");
  });

  it("fails closed when demo mode is misconfigured", async () => {
    process.env.TOKEN_USAGE_DASHBOARD_URL = "https://token-usage.baiwumm.com";
    const response = await proxy(request("/"));

    expect(response.status).toBe(500);
  });
});

describe("demo write-error copy", () => {
  // The browser clients turn the 403 envelope into their own error class, so
  // the UI matches on shape, not on instanceof.
  it("recognises the gate envelope and nothing else", () => {
    expect(
      isDemoWriteError({ status: 403, message: DEMO_WRITE_ERROR }),
    ).toBe(true);
    expect(isDemoWriteError({ status: 401, message: "unauthorized" })).toBe(
      false,
    );
    expect(isDemoWriteError(new Error(DEMO_WRITE_ERROR))).toBe(false);
    expect(isDemoWriteError(null)).toBe(false);
  });

  it("maps to the shared read-only line instead of 'save failed'", () => {
    const error = { status: 403, message: DEMO_WRITE_ERROR };

    expect(demoWriteNotice(error, "zh")).toBe("演示实例不可修改");
    expect(demoWriteNotice(error, "en")).toBe(
      "Not editable on the demo instance",
    );
    expect(demoWriteNotice({ status: 500, message: "boom" }, "zh")).toBe(
      null,
    );
  });
});

describe("demo login form", () => {
  // These tests call proxy() directly, which bypasses config.matcher — so the
  // routing premise of demoLoginRedirect is pinned separately in
  // tests/contract/route-guard.test.ts ("/login" must stay in the matcher).
  //
  // The redirect only fires when the deployment could actually sign someone
  // in (demo credentials + browser-auth env), so these tests provide the auth
  // pair the other cases leave out.
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://demo-auth.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-publishable-key";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  });

  it("forwards /login to the shared-account sign-in, keeping ?next=", async () => {
    const response = await proxy(request("/login?next=%2Fsessions"));
    const target = new URL(response.headers.get("location") || "");

    expect([302, 307]).toContain(response.status);
    expect(target.pathname).toBe("/api/app/demo-login");
    expect(target.searchParams.get("next")).toBe("/sessions");
  });

  it("keeps /login?error=… reachable as the failure landing page", async () => {
    // demo-login redirects its own failures here; forwarding again would loop.
    expect(
      isPassThrough(await proxy(request("/login?error=demo_unavailable"))),
    ).toBe(true);
  });

  it("leaves /login usable when demo auth is not configured", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    expect(isPassThrough(await proxy(request("/login")))).toBe(true);
  });
});

describe("production deployments", () => {
  it("is inert without the demo flag", async () => {
    delete process.env.TOKEN_USAGE_DEMO;

    expect(
      isPassThrough(await proxy(request("/api/app/badge", "POST"))),
    ).toBe(true);

    // No browser-auth env in tests → the page guard keeps its frozen
    // fail-closed envelope (there is no demo sign-in to fall back to).
    const response = await proxy(request("/"));

    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Auth not configured" });
  });

  it("leaves the login form alone even with auth configured", async () => {
    delete process.env.TOKEN_USAGE_DEMO;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://prod-auth.example.test";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-publishable-key";

    try {
      expect(isPassThrough(await proxy(request("/login")))).toBe(true);
      expect(
        isPassThrough(await proxy(request("/login?next=%2Fsessions"))),
      ).toBe(true);
    } finally {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    }
  });
});
