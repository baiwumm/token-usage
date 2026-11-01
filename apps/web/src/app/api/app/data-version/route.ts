// Dashboard's own data-version signal (2026-11-01 cache gate): authenticates
// the BROWSER session via @supabase/ssr cookies exactly like
// /api/app/sync-runs, then answers with the created_at of the latest
// non-empty token_sync_runs row (server clock — see dataVersionForUser).
// One indexed limit-1 read, so the client can afford it before every load.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { dataVersionForUser } from "@/lib/api/account-series-handlers";

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET() {
  const config = authConfig();

  if (!config) return jsonError(500, "Auth not configured");

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

  if (!user) return jsonError(401, "Unauthorized");

  return dataVersionForUser(user.id);
}
