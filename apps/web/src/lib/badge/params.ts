// URL parameter layer for GET /api/badge (docs/badge.md §2.1). Pure parsing:
// the token's validity is the data layer's lookup, and project_key
// normalization lives there too (§2.1) — this layer only validates shape.
//
// 2026-11-13 (multi-badge model): the parameters are now *overrides*. Every
// badge row stores its own style/theme/range/project defaults, so an absent
// query parameter means "use the row's value". `null` here distinguishes
// "absent" from "present but invalid". The retired `scope` parameter is
// rejected outright: its links died with the token reset, and `project` alone
// has selected the repo badge since 2026-11-04.

import type { BadgeRange, BadgeStyle, BadgeTheme } from "./types";

export type ParsedBadgeParams =
  | {
      ok: true;
      token: string;
      /** Raw project key, normalized in the data layer (§4.2). */
      project: string | null;
      /** `null` = fall back to the badge row's stored default. */
      style: BadgeStyle | null;
      theme: BadgeTheme | null;
      range: BadgeRange | null;
    }
  | { ok: false; reason: "bad_request" };

const STYLES: readonly BadgeStyle[] = ["panel", "compact", "sparkline"];
const THEMES: readonly BadgeTheme[] = ["dark", "light", "auto"];
const RANGES: readonly BadgeRange[] = ["all", "30d"];
const MAX_PROJECT_LENGTH = 120;

// Absent → null (fall back to the badge row's stored default); present but
// outside the set → also null, which `parseBadgeParams` classifies as
// bad_request by checking `has()` together with the value.
function pick<T extends string>(
  search: URLSearchParams,
  key: string,
  allowed: readonly T[],
): T | null {
  if (!search.has(key)) return null;

  const value = search.get(key) ?? "";

  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

/** Issued tokens are `tu_badge_` + base64url(24 bytes), i.e. 41 chars. */
const MAX_TOKEN_LENGTH = 128;
const TOKEN_CHARS = /^[A-Za-z0-9_-]+$/;

/**
 * Shape check shared by §2.1 and the §2.4 snapshot endpoint. Both are public
 * and unauthenticated, so junk / oversized tokens are rejected here before
 * they reach the database.
 */
export function isValidBadgeToken(token: string): boolean {
  return (
    token.length > 0 &&
    token.length <= MAX_TOKEN_LENGTH &&
    TOKEN_CHARS.test(token)
  );
}

export function parseBadgeParams(search: URLSearchParams): ParsedBadgeParams {
  const token = (search.get("token") ?? "").trim();
  const style = pick(search, "style", STYLES);
  const theme = pick(search, "theme", THEMES);
  const range = pick(search, "range", RANGES);

  if (
    !isValidBadgeToken(token) ||
    (style === null && search.has("style")) ||
    (theme === null && search.has("theme")) ||
    (range === null && search.has("range")) ||
    // Retired 2026-11-13: an old embed carrying `scope` is as dead as its
    // token, and silently ignoring it would hide a broken link.
    search.has("scope")
  ) {
    return { ok: false, reason: "bad_request" };
  }

  const project = (search.get("project") ?? "").trim();

  if (project.length > MAX_PROJECT_LENGTH) {
    return { ok: false, reason: "bad_request" };
  }

  return {
    ok: true,
    token,
    // Normalization happens on both sides of the comparison in the data layer.
    project: project || null,
    style,
    theme,
    range,
  };
}
