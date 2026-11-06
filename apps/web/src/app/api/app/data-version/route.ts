// Dashboard's own data-version signal (2026-11-01 cache gate): authenticates
// the BROWSER session via @supabase/ssr cookies exactly like
// /api/app/sync-runs, then answers with the created_at of the latest
// non-empty token_sync_runs row (server clock — see dataVersionForUser).
// One indexed limit-1 read, so the client can afford it before every load.

import { dataVersionForUser } from "@/lib/api/account-series-handlers";
import { requireAppSession } from "@/lib/api/app-session";

export async function GET() {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  return dataVersionForUser(session.userId);
}
