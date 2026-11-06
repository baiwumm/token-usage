// Shared cookie-session gate for the dashboard's own /api/app/* routes.
// The /api/functions/* contract gate and its bearer auth do not apply here:
// these handlers authenticate the BROWSER session via @supabase/ssr cookies
// with a single getUser() call. Keeping it in one place closes the long tail
// where a route could forget to check the session at all. proxy.ts
// intentionally does NOT cover /api/app/* (an extra Auth round-trip per
// internal request), so the gate stays at the route layer.

import type { User } from "@supabase/supabase-js";

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/config";

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

// The full user object is returned so routes that need session metadata (e.g.
// the badge display-name snapshot) can derive it without a second getUser().
export type AppSession =
  { userId: string; user: User } | { response: NextResponse };

export async function requireAppSession(): Promise<AppSession> {
  const config = authConfig();

  if (!config) return { response: jsonError(500, "Auth not configured") };

  const cookieStore = await cookies();
  const supabase = createServerClient(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        // Route handlers may write cookies; a read-only store (static
        // prerender) must not crash the auth refresh — fail soft.
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // The session cookies then just stay unrefreshed on this response.
        }
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { response: jsonError(401, "Unauthorized") };

  return { userId: user.id, user };
}
