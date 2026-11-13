// README snippet builders for the badge tab (docs/badge.md §7.4). Pure: the
// card passes the deployment's own origin (self-hosted origins differ) and the
// badge's token.
//
// 2026-11-13: the chip link carries NO display parameters — style/theme/range/
// project live on the badge row, so restyling in settings updates every embed
// without touching the README. Only the dual-theme variant overrides `theme`,
// because it needs one URL per GitHub color scheme.

import type { BadgeLink } from "@/lib/badge/api";
import type { BadgeRange, BadgeStyle, BadgeTheme } from "@/lib/badge/types";
import type { BadgeCopy } from "@/lib/copy/badge";

const ALT_TEXT = "Token Usage badge";
// GitHub maps prefers-color-scheme in README pictures to the viewer's GitHub
// theme, unlike theme=auto which follows the OS.
const DUAL_THEME = ["dark", "light"] as const;

export function badgeUrl(origin: string, token: string): string {
  return `${origin}/api/badge?token=${token}`;
}

export function pageUrl(origin: string, token: string): string {
  return `${origin}/u/${token}`;
}

/** Single-theme snippet: one image linking to the public page. */
export function singleThemeSnippet(origin: string, token: string): string {
  return `<a href="${pageUrl(origin, token)}"><img src="${badgeUrl(origin, token)}" alt="${ALT_TEXT}"></a>`;
}

/** Dual-theme snippet: a <picture> that follows GitHub's own theme setting. */
export function dualThemeSnippet(origin: string, token: string): string {
  const [dark, light] = DUAL_THEME;

  return [
    `<a href="${pageUrl(origin, token)}">`,
    "  <picture>",
    `    <source media="(prefers-color-scheme: dark)" srcset="${badgeUrl(origin, token)}&theme=${dark}">`,
    `    <img src="${badgeUrl(origin, token)}&theme=${light}" alt="${ALT_TEXT}">`,
    "  </picture>",
    "</a>",
  ].join("\n");
}

/** List/detail display name: the operator's label, or the generic fallback. */
export function badgeName(
  copy: BadgeCopy,
  badge: Pick<BadgeLink, "label">,
): string {
  return badge.label.trim() || copy.untitled;
}

function styleLabel(copy: BadgeCopy, style: BadgeStyle): string {
  if (style === "compact") return copy.styleCompact;
  if (style === "sparkline") return copy.styleSparkline;

  return copy.stylePanel;
}

function themeLabel(copy: BadgeCopy, theme: BadgeTheme): string {
  if (theme === "dark") return copy.themeDark;
  if (theme === "light") return copy.themeLight;

  return copy.themeAuto;
}

function rangeLabel(copy: BadgeCopy, range: BadgeRange): string {
  return range === "30d" ? copy.range30d : copy.rangeAll;
}

/** One-line summary for the list row: what this badge actually renders. */
export function badgeSummary(
  copy: BadgeCopy,
  badge: Pick<BadgeLink, "style" | "theme" | "range" | "project">,
): string {
  const parts = [
    styleLabel(copy, badge.style),
    themeLabel(copy, badge.theme),
    rangeLabel(copy, badge.range),
  ];

  if (badge.project) parts.push(badge.project);

  return parts.join(" · ");
}
