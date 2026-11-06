// Dashboard's own sync-runs data path (docs/cli-contract.md §2.12): the first
// /api/app/* route. Authenticates the BROWSER session via @supabase/ssr
// cookies (the /api/functions/* contract gate and its bearer auth do not
// apply here), then reuses the service-role payload builder shared with the
// contract series — parameters and response stay byte-identical to §2.12.

import type { NextRequest } from "next/server";

import { syncRunsPayloadForUser } from "@/lib/api/account-series-handlers";
import { requireAppSession } from "@/lib/api/app-session";

export async function GET(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  return syncRunsPayloadForUser(session.userId, request.nextUrl.searchParams);
}
