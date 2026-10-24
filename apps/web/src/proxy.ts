// Contract-layer request gate (docs/cli-contract.md §1.2) + M2 page guard.
//
// Next 16's proxy convention (the successor of middleware) runs before
// routing. Two independent duties live here:
//
// 1. Contract gate (M1, behavior frozen): for every /api/functions/* request,
//    OPTIONS answers 204 with the CORS headers, and everything besides GET
//    and POST — HEAD included, matching the reference handlers' method checks
//    — gets the JSON 405 envelope. Requests arriving through the legacy
//    tokentracker-* rewrites pass through here too. The gate never consults
//    the session: CLI traffic follows the contract's own auth rules.
// 2. Page guard (M2): protected pages redirect unauthenticated browsers to
//    /login, carrying the original path + query in ?next= (the pairing link's
//    ?user_code= must survive the hop — docs/requirements.md 路由约定). The
//    landing page, /login and /auth/callback are public and outside the
//    matcher.

import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { LOGIN_PATH } from "@/lib/auth/next-path";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, apikey, x-api-key",
  "Access-Control-Max-Age": "86400",
};

const CONTRACT_API_PREFIX = "/api/functions/";

// Protected pages per docs/requirements.md 范围表 (everything except the
// public landing page and the CLI API).
const PROTECTED_PAGES = [
  "/dashboard",
  "/settings",
  "/wrapped",
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

    return NextResponse.next();
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
    "/dashboard/:path*",
    "/settings/:path*",
    "/wrapped/:path*",
    "/service-status/:path*",
    "/device/:path*",
  ],
};
