// Badge-side session gate (docs/badge.md §7.1): the cookie session plus the
// profile-name snapshot the create flow stores when the public name is still
// empty. Both /api/app/badge and /api/app/badge/links/[id] share it so the
// 401 envelope and the name derivation stay identical.

import type { NextResponse } from "next/server";

import { MAX_DISPLAY_NAME } from "./limits";

import { requireAppSession } from "@/lib/api/app-session";

export type BadgeSession =
  { userId: string; displayName: string } | { response: NextResponse };

export async function authenticateBadge(): Promise<BadgeSession> {
  const session = await requireAppSession();

  if ("response" in session) return session;

  // §3.1: the display name is a session snapshot — never the email.
  const metadata = (session.user.user_metadata ?? {}) as {
    display_name?: unknown;
  };
  const displayName =
    typeof metadata.display_name === "string"
      ? metadata.display_name.trim().slice(0, MAX_DISPLAY_NAME)
      : "";

  return { userId: session.userId, displayName };
}
