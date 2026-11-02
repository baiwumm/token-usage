// Contract-layer request gate (docs/cli-contract.md §1.2) + M2 page guard.
//
// Next 16's proxy convention (the successor of middleware) runs before
// routing. Two independent duties live here:
//
// 1. Contract gate (M1, behavior frozen): for every /api/functions/* request,
//    OPTIONS answers 204 with the CORS headers, and everything besides GET
//    and POST — HEAD included, matching the reference handlers' method checks
//    — gets the JSON 405 envelope. GET/POST on a legacy tokentracker-* path
//    then rewrites to its canonical token-usage-* handler (§1.5). The gate
//    never consults the session: CLI traffic follows the contract's own auth
//    rules.
// 2. Page guard (M2): protected pages redirect unauthenticated browsers to
//    /login, carrying the original path + query in ?next= (the pairing link's
//    ?user_code= must survive the hop — docs/requirements.md 路由约定,
//    2026-10-24 二次修订). The dashboard at / requires login; only /login,
//    /auth/callback and the CLI API are public and outside the guard.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { CORS_HEADERS } from "@/lib/api/http";

const CONTRACT_API_PREFIX = "/api/functions/";
const LEGACY_ALIAS_PREFIX = `${CONTRACT_API_PREFIX}tokentracker-`;
const CANONICAL_PREFIX = `${CONTRACT_API_PREFIX}token-usage-`;

// Legacy path alias (docs/cli-contract.md §1.5, frozen): the pinned
// tokentracker-cli 1.4.x hardcodes the old tokentracker-* slugs. Only that one
// path segment is renamed; method, body, headers and query reach the
// canonical handler unchanged. It lives here instead of next.config rewrites
// because EdgeOne Makers ignores those (2026-11-02), and a proxy rewrite
// behaves the same on every host. Like the old `:slug` rule it matches a
// single segment — deeper paths fall through to routing untouched.
function legacyAliasTarget(request: NextRequest): URL | null {
  const { pathname } = request.nextUrl;

  if (!pathname.startsWith(LEGACY_ALIAS_PREFIX)) return null;
  const slug = pathname.slice(LEGACY_ALIAS_PREFIX.length);

  if (!slug || slug.includes("/")) return null;
  const target = request.nextUrl.clone();

  target.pathname = `${CANONICAL_PREFIX}${slug}`;

  return target;
}

// Protected pages per docs/requirements.md 范围表 (2026-10-24 二次修订):
// the dashboard IS / — everything except /login, /auth/callback and the CLI
// API requires login.
const PROTECTED_PAGES = [
  "/",
  "/sessions",
  "/sync-runs",
  "/settings",
  "/wrapped",
  "/achievements",
  "/service-status",
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

    const alias = legacyAliasTarget(request);

    return alias ? NextResponse.rewrite(alias) : NextResponse.next();
  }

  if (!isProtectedPage(pathname)) return NextResponse.next();

  const config = authConfig();

  if (!config) {
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
    const login = request.nextUrl.clone();

    login.pathname = LOGIN_PATH;
    login.search = "";
    login.searchParams.set("next", pathname + request.nextUrl.search);

    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: [
    "/api/functions/:path*",
    "/",
    "/sessions/:path*",
    "/sync-runs/:path*",
    "/settings/:path*",
    "/wrapped/:path*",
    "/achievements/:path*",
    "/service-status/:path*",
    "/device/:path*",
  ],
};
