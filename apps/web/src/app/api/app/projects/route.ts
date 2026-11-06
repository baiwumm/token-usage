// Dashboard's own projects data path (docs/ui-spec.md「项目（`/projects`）」节):
// cookie-session auth like /api/app/sync-runs, then the shared service-role
// payload builder over token_sessions.

import type { NextRequest } from "next/server";

import { requireAppSession } from "@/lib/api/app-session";
import { projectsPayloadForUser } from "@/lib/api/projects";

export async function GET(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  return projectsPayloadForUser(session.userId, request.nextUrl.searchParams);
}
