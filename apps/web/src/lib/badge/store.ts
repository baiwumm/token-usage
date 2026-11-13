// Badge storage helpers shared by /api/app/badge and its per-badge child route
// (docs/badge.md §3 / §7.1). Service-role only; the settings row and the badge
// rows live in two tables (2026-11-13 model). The settings row also owns the
// per-user public page token (2026-11-14): /u/<page_token> is the only way in.

import { randomBytes } from "node:crypto";

import { normalizeBadgeAllowlist, normalizeBadgeTimezone } from "./data";

import { select, update } from "@/lib/api/supabase-rest";

export const SETTINGS_TABLE = "token_public_badge_settings";
export const BADGES_TABLE = "token_public_badges";
export const TOKEN_PREFIX = "tu_badge_";
export const PAGE_TOKEN_PREFIX = "tu_page_";

export type SettingsRow = {
  enabled: boolean | null;
  display_name: string | null;
  timezone: string | null;
  allowed_projects: unknown;
  page_token: string | null;
  page_enabled: boolean | null;
};

/** §3.2: tu_page_ + 32 base64url chars from 24 CSPRNG bytes. */
export function generatePageToken(): string {
  return `${PAGE_TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

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
    select:
      "enabled,display_name,timezone,allowed_projects,page_token,page_enabled",
    filters: [["user_id", "eq", userId]],
    limit: 1,
  });

  return rows[0] as SettingsRow | undefined;
}

/**
 * Backfills page_token for rows created before the 2026-11-14 migration (and
 * for callers that just created a row without one). Writes only when missing
 * and returns the row with the token in place.
 */
export async function ensurePageToken(
  userId: string,
  row: SettingsRow,
): Promise<SettingsRow> {
  if (row.page_token) return row;

  const page_token = generatePageToken();

  await update(SETTINGS_TABLE, { page_token }, [["user_id", "eq", userId]], {
    returning: false,
  });

  return { ...row, page_token };
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
    // §3.2: the page has its own switch — off = the URL answers 404. The badge
    // master switch (`enabled`) never touches the page.
    pageEnabled: row?.page_enabled !== false,
    /** /u/<page_token> — the one account-level public page URL key (§3.2). */
    pageToken: typeof row?.page_token === "string" ? row.page_token : null,
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
    style: String(row.style ?? "sparkline"),
    theme: String(row.theme ?? "auto"),
    range: String(row.range ?? "all"),
    project:
      typeof row.project === "string" && row.project ? row.project : null,
    createdAt: row.created_at,
    revokedAt: row.revoked_at,
  };
}
