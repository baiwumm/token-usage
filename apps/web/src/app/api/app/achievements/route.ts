// Dashboard's own achievements data path (docs/achievements-plan.md §3.1):
// authenticates the BROWSER session via @supabase/ssr cookies (the
// /api/functions/* contract gate and its bearer auth do not apply here), then
// delegates to the payload builder with the resolved user id.
//
// tz / tz_offset_minutes follow the dashboard series convention
// (parseTzContext): an invalid zone falls back to the numeric offset and then
// to UTC, so a bad browser value never fails the request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { achievementsPayloadForUser } from "@/lib/achievements/payload";
import { authConfig } from "@/lib/auth/config";

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

  return achievementsPayloadForUser(user.id, request.nextUrl.searchParams);
}
