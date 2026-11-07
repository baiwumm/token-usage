// GET /auth/callback — magic-link / OAuth session exchange (PKCE).
//
// The email link lands here with ?code=; the PKCE verifier rides in cookies
// written when the flow started in the browser. On success the session
// cookies are set on the redirect response and the user lands on ?next= (or
// the default destination). Failures bounce back to /login with a stable
// error code the login form renders; the default destination omits the
// redundant ?next= there (urlWithNext).

import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { requestCookies } from "@/lib/auth/cookies";
import {
  LOGIN_PATH,
  resolvePostLoginPath,
  urlWithNext,
} from "@/lib/auth/next-path";

export const dynamic = "force-dynamic";

export function loginRedirect(
  origin: string,
  errorCode: string,
  next: string,
): NextResponse {
  const url = new URL(urlWithNext(LOGIN_PATH, next), origin);

  url.searchParams.set("error", errorCode);

  return NextResponse.redirect(url);
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = resolvePostLoginPath(url.searchParams.get("next"));
  const config = authConfig();

  // Provider-side failures come back as ?error=… (e.g. signup_disabled with
  // the registration gate closed, access_denied when the user cancels the
  // consent screen). Forward them as stable `oauth_<code>` login-page codes
  // so the form can show a specific message; the login form falls back to
  // its generic copy for unknown ones.
  const providerError = url.searchParams.get("error");

  if (providerError) {
    return loginRedirect(url.origin, `oauth_${providerError}`, next);
  }

  if (!code || !config) {
    return loginRedirect(url.origin, "auth_code_missing", next);
  }

  let response = NextResponse.redirect(new URL(next, url.origin));
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    // A failed exchange must not leak the half-built response.
    return loginRedirect(url.origin, "auth_exchange_failed", next);
  }

  return response;
}
