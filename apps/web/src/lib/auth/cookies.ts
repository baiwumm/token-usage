// Cookie plumbing for server-side @supabase/ssr clients that must work
// against a plain Request (the /auth/callback route handler is unit-tested
// with fabricated requests, outside Next's request-scope next/headers API).

export interface RequestCookie {
  name: string;
  value: string;
}

/** Minimal RFC 6265 Cookie-header parser (name=value pairs, ";"-separated). */
export function parseCookieHeader(header: string | null): RequestCookie[] {
  if (!header) return [];
  const cookies: RequestCookie[] = [];

  for (const part of header.split(";")) {
    const eq = part.indexOf("=");

    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();

    if (name) cookies.push({ name, value });
  }

  return cookies;
}

export function requestCookies(request: Request): RequestCookie[] {
  return parseCookieHeader(request.headers.get("cookie"));
}
