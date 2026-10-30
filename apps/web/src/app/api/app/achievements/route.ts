// Dashboard's own achievements data path (docs/achievements-plan.md §3.1):
// authenticates the BROWSER session via @supabase/ssr cookies (the
// /api/functions/* contract gate and its bearer auth do not apply here), then
// delegates to the payload builder with the resolved user id.
//
// POST records the account's seen watermark (the "new" badge and the unlock
// toast follow the account across devices). It lives on this route instead of
// its own handler so the deployment keeps the same function count.
//
// tz / tz_offset_minutes follow the dashboard series convention
// (parseTzContext): an invalid zone falls back to the numeric offset and then
// to UTC, so a bad browser value never fails the request.

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";

import { isDayKey } from "@/lib/achievements/highlights";
import { achievementsPayloadForUser } from "@/lib/achievements/payload";
import { advanceAchievementSeen } from "@/lib/achievements/seen";
import { jsonResponse } from "@/lib/api/http";
import { authConfig } from "@/lib/auth/config";

const MIN_SEEN_DAY = "2000-01-01";
const DAY_MS = 86_400_000;

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

type Session = { userId: string } | { response: NextResponse };

async function authenticate(): Promise<Session> {
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

  return { userId: user.id };
}

export async function GET(request: NextRequest) {
  const session = await authenticate();

  if ("response" in session) return session.response;

  return achievementsPayloadForUser(
    session.userId,
    request.nextUrl.searchParams,
  );
}

export async function POST(request: NextRequest) {
  const session = await authenticate();

  if ("response" in session) return session.response;

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Invalid seen_through");
  }

  const day = (body as { seen_through?: unknown } | null)?.seen_through;
  const latestAllowed = new Date(Date.now() + DAY_MS)
    .toISOString()
    .slice(0, 10);

  // A local day can be a day ahead of UTC (UTC+14), hence `+1`.
  if (!isDayKey(day) || day < MIN_SEEN_DAY || day > latestAllowed) {
    return jsonError(400, "Invalid seen_through");
  }

  try {
    const effective = await advanceAchievementSeen(session.userId, day);

    return jsonResponse(200, { seen_through: effective });
  } catch {
    return jsonError(503, "Seen marker unavailable");
  }
}
