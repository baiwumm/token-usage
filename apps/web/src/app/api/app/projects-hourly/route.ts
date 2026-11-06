// Exact bucket caliber for the projects page (docs/ui-spec.md「项目（`/projects`）」节
// 批次 4): same cookie-session auth as /api/app/projects, over the hourly
// bucket payload builder. Both routes stay live so the page can switch (or
// revert) without changing the session caliber.

import type { NextRequest } from "next/server";

import { requireAppSession } from "@/lib/api/app-session";
import { projectsHourlyPayloadForUser } from "@/lib/api/projects-hourly";

export async function GET(request: NextRequest) {
  const session = await requireAppSession();

  if ("response" in session) return session.response;

  return projectsHourlyPayloadForUser(session.userId, request.nextUrl.searchParams);
}
