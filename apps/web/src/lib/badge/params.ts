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

export function parseBadgeParams(search: URLSearchParams): ParsedBadgeParams {
  const token = (search.get("token") ?? "").trim();
  const scope = pick(search, "scope", SCOPES, "user");
  const style = pick(search, "style", STYLES, "panel");
  const theme = pick(search, "theme", THEMES, "dark");
  const range = pick(search, "range", RANGES, "all");

  if (!token || !scope || !style || !theme || !range) {
    return { ok: false, reason: "bad_request" };
  }

  let project: string | null = null;

  if (scope === "repo") {
    // §2.1: repo 必填且 ≤120 字符；通过后原样透传，归一在数据层（§4.2）。
    const raw = search.get("project") ?? "";
    const trimmed = raw.trim();

    if (!trimmed || trimmed.length > MAX_PROJECT_LENGTH) {
      return { ok: false, reason: "bad_request" };
    }
    project = raw;
  }

  return { ok: true, token, scope, project, style, theme, range };
}
