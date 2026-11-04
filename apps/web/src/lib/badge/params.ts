// URL parameter layer for GET /api/badge (docs/badge.md §2.1). Pure parsing:
// the token's validity is the data layer's hash lookup, and project_key
// normalization lives there too (§2.1) — this layer only validates shape and
// applies the documented defaults.

import type { BadgeRange, BadgeStyle, BadgeTheme } from "./types";

export type ParsedBadgeParams =
  | {
      ok: true;
      token: string;
      scope: "user" | "repo";
      project: string | null;
      style: BadgeStyle;
      theme: BadgeTheme;
      range: BadgeRange;
    }
  | { ok: false; reason: "bad_request" };

const SCOPES = ["user", "repo"] as const;
const STYLES: readonly BadgeStyle[] = ["panel", "compact", "sparkline"];
const THEMES: readonly BadgeTheme[] = ["dark", "light", "auto"];
const RANGES: readonly BadgeRange[] = ["all", "30d"];
const MAX_PROJECT_LENGTH = 120;

// Absent → documented default; present but outside the set → invalid (null),
// which §2.3 classifies as bad_request.
function pick<T extends string>(
  search: URLSearchParams,
  key: string,
  allowed: readonly T[],
  fallback: T,
): T | null {
  const value = search.get(key);

  if (value == null) return fallback;

  return (allowed as readonly string[]).includes(value) ? (value as T) : null;
}

// §2.1 (2026-11-04 operator call): `project` is the switch — present renders
// the repo badge, absent renders the account badge. The old `scope` parameter
// is still accepted (existing README embeds) but no longer decides anything;
// its value stays validated, and `scope=repo` without a project is still an
// error so a stale link can never quietly turn into an account badge.
export function parseBadgeParams(search: URLSearchParams): ParsedBadgeParams {
  const token = (search.get("token") ?? "").trim();
  const style = pick(search, "style", STYLES, "panel");
  const theme = pick(search, "theme", THEMES, "dark");
  const range = pick(search, "range", RANGES, "all");
  const scopeRaw = search.get("scope");
  const scopeValid =
    scopeRaw === null || (SCOPES as readonly string[]).includes(scopeRaw);

  if (!token || !style || !theme || !range || !scopeValid) {
    return { ok: false, reason: "bad_request" };
  }

  const project = search.get("project") ?? "";
  const trimmed = project.trim();

  if (trimmed) {
    // §2.1: ≤120 字符；通过后原样透传，归一在数据层（§4.2）。
    if (trimmed.length > MAX_PROJECT_LENGTH) {
      return { ok: false, reason: "bad_request" };
    }

    return {
      ok: true,
      token,
      scope: "repo",
      project,
      style,
      theme,
      range,
    };
  }

  if (scopeRaw === "repo") {
    return { ok: false, reason: "bad_request" };
  }

  return { ok: true, token, scope: "user", project: null, style, theme, range };
}
