// Dashboard's own sync-runs data path (docs/cli-contract.md §2.12): the first
// /api/app/* route. Authenticates the BROWSER session via @supabase/ssr
// cookies (the /api/functions/* contract gate and its bearer auth do not
// apply here), then reuses the service-role payload builder shared with the
// contract series — parameters and response stay byte-identical to §2.12.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { syncRunsPayloadForUser } from "@/lib/api/account-series-handlers";

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
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

  return syncRunsPayloadForUser(user.id, request.nextUrl.searchParams);
}
