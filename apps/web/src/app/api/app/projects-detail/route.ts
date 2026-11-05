// Dashboard's per-project detail data path (docs/projects-page-plan.md):
// cookie-session auth identical to /api/app/projects, then the shared
// service-role detail payload builder over token_sessions / token_usage_hourly.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { projectsDetailPayloadForUser } from "@/lib/api/projects-detail";

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

  return projectsDetailPayloadForUser(user.id, request.nextUrl.searchParams);
}
