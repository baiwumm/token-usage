// Dashboard's own projects data path (docs/projects-page-plan.md 批次 1):
// cookie-session auth like /api/app/sync-runs, then the shared service-role
// payload builder over token_sessions.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { projectsPayloadForUser } from "@/lib/api/projects";

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

  return projectsPayloadForUser(user.id, request.nextUrl.searchParams);
}
