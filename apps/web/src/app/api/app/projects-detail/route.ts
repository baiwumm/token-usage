// Dashboard's per-project detail data path (docs/ui-spec.md「项目（`/projects`）」节):
// cookie-session auth identical to /api/app/projects, then the shared
// service-role detail payload builder over token_sessions / token_usage_hourly.

import type { NextRequest } from "next/server";

import { requireAppSession } from "@/lib/api/app-session";
import { projectsDetailPayloadForUser } from "@/lib/api/projects-detail";

export async function GET(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  return projectsDetailPayloadForUser(session.userId, request.nextUrl.searchParams);
}
