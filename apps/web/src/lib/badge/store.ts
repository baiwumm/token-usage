// Badge storage helpers shared by /api/app/badge and its per-badge child route
// (docs/badge.md §3 / §7.1). Service-role only; the settings row and the badge
// rows live in two tables (2026-11-13 model).

import { normalizeBadgeAllowlist, normalizeBadgeTimezone } from "./data";

import { select } from "@/lib/api/supabase-rest";

export const SETTINGS_TABLE = "token_public_badge_settings";
export const BADGES_TABLE = "token_public_badges";
export const TOKEN_PREFIX = "tu_badge_";

export type SettingsRow = {
  enabled: boolean | null;
  display_name: string | null;
  timezone: string | null;
  allowed_projects: unknown;
};

export type BadgeRow = {
  id: string;
  token: string;
  label: string | null;
  style: string | null;
  theme: string | null;
  range: string | null;
  project: string | null;
  created_at: string | null;
  revoked_at: string | null;
};

export async function loadSettings(
  userId: string,
): Promise<SettingsRow | undefined> {
  const rows = await select(SETTINGS_TABLE, {
    select: "enabled,display_name,timezone,allowed_projects",
    filters: [["user_id", "eq", userId]],
    limit: 1,
  });

  return rows[0] as SettingsRow | undefined;
}

export async function loadBadges(userId: string): Promise<BadgeRow[]> {
  return (await select(BADGES_TABLE, {
    select: "id,token,label,style,theme,range,project,created_at,revoked_at",
    filters: [["user_id", "eq", userId]],
    order: "created_at.asc",
  })) as unknown as BadgeRow[];
}

export async function loadBadge(
  userId: string,
  id: string,
): Promise<BadgeRow | undefined> {
  const rows = await select(BADGES_TABLE, {
    select: "id,token,label,style,theme,range,project,created_at,revoked_at",
    filters: [
      ["user_id", "eq", userId],
      ["id", "eq", id],
    ],
    limit: 1,
  });

  return rows[0] as BadgeRow | undefined;
}

/** §7.1 GET shape: the account-level config. */
export function configPayload(row: SettingsRow | undefined) {
  return {
    enabled: row?.enabled === true,
    timezone: normalizeBadgeTimezone(row?.timezone),
    allowedProjects: normalizeBadgeAllowlist(row?.allowed_projects),
    displayName: typeof row?.display_name === "string" ? row.display_name : "",
  };
}

/**
 * §7.1 badge shape. Tokens are returned by design — the endpoint is
 * session-authenticated and the link must stay copyable forever.
 */
export function badgePayload(row: BadgeRow) {
  return {
    id: String(row.id),
    token: String(row.token),
    label: typeof row.label === "string" ? row.label : "",
    style: String(row.style ?? "panel"),
    theme: String(row.theme ?? "auto"),
    range: String(row.range ?? "all"),
    project:
      typeof row.project === "string" && row.project ? row.project : null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}
