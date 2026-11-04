// Exact bucket caliber for the projects page (docs/projects-page-plan.md §5
// 批次 4): same cookie-session auth as /api/app/projects, over the hourly
// bucket payload builder. Both routes stay live so the page can switch (or
// revert) without changing the session caliber.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { authConfig } from "@/lib/auth/config";
import { projectsHourlyPayloadForUser } from "@/lib/api/projects-hourly";

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

  return projectsHourlyPayloadForUser(user.id, request.nextUrl.searchParams);
}
