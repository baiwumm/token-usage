// Contract-layer request gate (docs/cli-contract.md §1.2) + M2 page guard.
//
// Next 16's proxy convention (the successor of middleware) runs before
// routing. Two independent duties live here:
//
// 1. Contract gate (M1, behavior frozen): for every /api/functions/* request,
//    OPTIONS answers 204 with the CORS headers, and everything besides GET
//    and POST — HEAD included, matching the reference handlers' method checks
//    — gets the JSON 405 envelope. The gate never consults the session: CLI
//    traffic follows the contract's own auth rules.
// 2. Page guard (M2): protected pages redirect unauthenticated browsers to
//    /login, carrying the original path + query in ?next= (the pairing link's
//    ?user_code= must survive the hop — docs/requirements.md 路由约定,
//    2026-10-24 二次修订); a bare hit on the default destination / omits the
//    redundant parameter (its absence resolves to the same path). The
//    dashboard at / requires login; only /login, /auth/callback and the CLI
//    API are public and outside the guard.
// 3. Demo gate (2026-11-16, docs/demo-instance-plan.md §5): when the
//    deployment runs with TOKEN_USAGE_DEMO=on, every write verb under /api/**
//    answers 403 with one stable envelope, and anonymous page hits go straight
//    to /api/app/demo-login instead of the login form. Gating here — not in
//    each handler — keeps the frozen contract error codes untouched.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { loginPathFor } from "@/lib/auth/next-path";
import { CORS_HEADERS } from "@/lib/api/http";
import {
  DEMO_WRITE_ERROR,
  demoMisconfiguration,
  isDemoInstance,
} from "@/lib/demo";

const CONTRACT_API_PREFIX = "/api/functions/";

// Demo mode: the only API prefix that may accept a write is the demo sign-in
// route itself, and that one is a GET; listing the prefixes keeps the intent
// explicit.
const DEMO_GATED_PREFIXES = [CONTRACT_API_PREFIX, "/api/app/"];
const DEMO_LOGIN_PATH = "/api/app/demo-login";

function isWriteMethod(method: string): boolean {
  return method !== "GET" && method !== "HEAD" && method !== "OPTIONS";
}

/**
 * Demo write gate (docs/demo-instance-plan.md §5). Null = the request may
 * proceed. Called from the contract branch too, because that branch returns
 * before the shared path below.
 */
function demoWriteResponse(
  method: string,
  pathname: string,
): NextResponse | null {
  if (!isDemoInstance()) return null;
  if (!isWriteMethod(method)) return null;
  if (pathname === DEMO_LOGIN_PATH) return null;
  if (!DEMO_GATED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return null;
  }

  return new NextResponse(JSON.stringify({ error: DEMO_WRITE_ERROR }), {
    status: 403,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// Protected pages per docs/requirements.md 范围表 (2026-10-24 二次修订):
// the dashboard IS / — everything except /login, /auth/callback and the CLI
// API requires login. /service-status was removed on 2026-11-07 (its self-
// check moved into the Settings · 设备 实例诊断 card).
//
// Exported for the route-guard test, which asserts config.matcher and this
// list stay in exact parity (the matcher below must remain a static literal —
// Next's proxy config analysis rejects computed values, so parity is enforced
// by the test, not by derivation).
export const PROTECTED_PAGES = [
  "/",
  "/sessions",
  "/projects",
  "/sync-runs",
  "/settings",
  "/wrapped",
  "/achievements",
  "/device",
];

function isProtectedPage(pathname: string): boolean {
  return PROTECTED_PAGES.some(
    (page) => pathname === page || pathname.startsWith(`${page}/`),
  );
}

export async function proxy(request: NextRequest) {
  const method = request.method.toUpperCase();
  const { pathname } = request.nextUrl;

  if (pathname.startsWith(CONTRACT_API_PREFIX)) {
    if (method === "OPTIONS") {
      return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
    }

    if (method !== "GET" && method !== "POST") {
      return new NextResponse(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: {
          ...CORS_HEADERS,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      });
    }

    const blocked = demoWriteResponse(method, pathname);

    if (blocked) return blocked;

    return NextResponse.next();
  }

  const demoBlocked = demoWriteResponse(method, pathname);

  if (demoBlocked) return demoBlocked;

  if (!isProtectedPage(pathname)) return NextResponse.next();

  // Isolation guard (decision #19): a demo deployment that points at the
  // production instance or lacks a demo account is a misconfiguration, not a
  // page to render.
  const demoProblem = demoMisconfiguration();

  if (demoProblem) {
    return new NextResponse(
      JSON.stringify({ error: "Demo instance misconfigured" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        },
      },
    );
  }

  const config = authConfig();

  if (!config) {
    if (isDemoInstance()) {
      // A demo deploy without browser auth cannot sign anyone in; the sign-in
      // route falls back to /login?error=demo_unavailable, which explains the
      // state, instead of a raw 500 on every page.
      const demoLogin = new URL(DEMO_LOGIN_PATH, request.nextUrl.origin);

      demoLogin.searchParams.set("next", pathname + request.nextUrl.search);

      return NextResponse.redirect(demoLogin);
    }

    // Fail closed: a deployment without browser-auth configuration must not
    // expose the (empty) pages, but the contract gate above still runs.
    return new NextResponse(JSON.stringify({ error: "Auth not configured" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  let response = NextResponse.next({ request });
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // Validation goes through Supabase Auth; a stale cookie session gets
  // refreshed here and the new cookies ride along on the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    if (isDemoInstance()) {
      // Demo visitors never see the login form: the shared account is signed
      // in server-side, so "open the demo" is one hop into the dashboard.
      const demoLogin = new URL(DEMO_LOGIN_PATH, request.nextUrl.origin);

      demoLogin.searchParams.set("next", pathname + request.nextUrl.search);

      return NextResponse.redirect(demoLogin);
    }

    // Bare-domain hits on the default destination bounce to a clean /login;
    // deep links keep their path + query riding ?next= (loginPathFor).
    const login = new URL(
      loginPathFor(pathname + request.nextUrl.search),
      request.nextUrl.origin,
    );

    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/api/functions/:path*",
    "/api/app/:path*",
    "/",
    "/sessions/:path*",
    "/projects/:path*",
    "/sync-runs/:path*",
    "/settings/:path*",
    "/wrapped/:path*",
    "/achievements/:path*",
    "/device/:path*",
  ],
};
