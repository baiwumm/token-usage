// README snippet builders for the badge card (docs/badge.md §7.4). Pure: the
// card passes the deployment's own origin (self-hosted origins differ) and
// either the freshly revealed token or the placeholder.

import { badgeQuery, type BadgeView } from "@/lib/badge/api";

export const TOKEN_PLACEHOLDER = "YOUR_BADGE_TOKEN";

const ALT_TEXT = "Token Usage badge";

// Tokens are base64url (URL-safe), so they are interpolated as-is — which
// also keeps the placeholder readable.
function badgeUrl(origin: string, token: string, view: BadgeView): string {
  return `${origin}/api/badge?token=${token}&${badgeQuery(view).toString()}`;
}

function pageUrl(origin: string, token: string): string {
  return `${origin}/u/${token}`;
}

/** Single-theme snippet: one image linking to the public page. */
export function singleThemeSnippet(
  origin: string,
  token: string,
  view: BadgeView,
): string {
  return `<a href="${pageUrl(origin, token)}"><img src="${badgeUrl(origin, token, view)}" alt="${ALT_TEXT}"></a>`;
}

/**
 * Dual-theme snippet: a <picture> whose dark source follows GitHub's own
 * theme setting (GitHub maps prefers-color-scheme in README pictures to the
 * viewer's GitHub theme), unlike theme=auto which follows the OS.
 */
export function dualThemeSnippet(
  origin: string,
  token: string,
  view: BadgeView,
): string {
  const dark = badgeUrl(origin, token, { ...view, theme: "dark" });
  const light = badgeUrl(origin, token, { ...view, theme: "light" });

  return [
    `<a href="${pageUrl(origin, token)}">`,
    "  <picture>",
    `    <source media="(prefers-color-scheme: dark)" srcset="${dark}">`,
    `    <img src="${light}" alt="${ALT_TEXT}">`,
    "  </picture>",
    "</a>",
  ].join("\n");
}
