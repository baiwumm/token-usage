// GET /api/app/demo-login — demo instance convenience sign-in
// (docs/demo-instance-plan.md §5).
//
// Landing links point at the demo root; the proxy sends unauthenticated
// visitors here instead of the login form, so "open the demo" is a single hop
// into the dashboard. The shared account's password stays server-side: the
// browser only ever receives session cookies.
//
// Inert on production deployments (demo mode off → 404).

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { requestCookies } from "@/lib/auth/cookies";
import { resolvePostLoginPath } from "@/lib/auth/next-path";
import { demoCredentials, isDemoInstance } from "@/lib/demo";

export const dynamic = "force-dynamic";

function loginError(origin: string): NextResponse {
  return NextResponse.redirect(
    new URL("/login?error=demo_unavailable", origin),
  );
}

export async function GET(request: Request) {
  if (!isDemoInstance()) {
    return new NextResponse(null, { status: 404 });
  }

  const url = new URL(request.url);
  const next = resolvePostLoginPath(url.searchParams.get("next"));
  const credentials = demoCredentials();
  const config = authConfig();

  if (!credentials || !config) {
    // demoMisconfiguration() reports the same condition at boot; this is the
    // request-time fallback so a bad deploy still renders a usable page.
    return loginError(url.origin);
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => requestCookies(request),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  const { error } = await supabase.auth.signInWithPassword(credentials);

  if (error) return loginError(url.origin);

  return response;
}
