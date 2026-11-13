// Validation of the settings-side badge fields (docs/badge.md §7.1). Shared by
// create (POST /api/app/badge) and edit (PATCH /api/app/badge/links/[id]) so
// both answer the same 400 codes for the same input.

import type { BadgeRange, BadgeStyle, BadgeTheme } from "./types";

import { normalizeBadgeProject, normalizeBadgeTimezone } from "./data";
import { MAX_BADGE_LABEL, MAX_PROJECT_LENGTH } from "./limits";

const STYLES: readonly BadgeStyle[] = ["panel", "compact", "sparkline"];
const THEMES: readonly BadgeTheme[] = ["dark", "light", "auto"];
const RANGES: readonly BadgeRange[] = ["all", "30d"];

export type BadgeInput = Partial<{
  label: string;
  style: BadgeStyle;
  theme: BadgeTheme;
  range: BadgeRange;
  project: string | null;
  revoked: boolean;
  timezone: string;
}>;

export function parseBadgeInput(
  body: unknown,
  allowedProjects: string[],
): { ok: true; input: BadgeInput } | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Invalid body" };
  }
  const raw = body as Record<string, unknown>;
  const input: BadgeInput = {};

  if (raw.label !== undefined) {
    if (typeof raw.label !== "string") {
      return { ok: false, error: "Invalid label" };
    }
    const trimmed = raw.label.trim();

    // 2026-11-14: the label is the badge's name — set through the shared
    // add/edit dialog, so an empty value is a client bug, not a blank slate.
    if (trimmed.length === 0 || trimmed.length > MAX_BADGE_LABEL) {
      return { ok: false, error: "Invalid label" };
    }
    input.label = trimmed;
  }
  if (raw.style !== undefined) {
    if (!(STYLES as readonly unknown[]).includes(raw.style)) {
      return { ok: false, error: "Invalid style" };
    }
    input.style = raw.style as BadgeStyle;
  }
  if (raw.theme !== undefined) {
    if (!(THEMES as readonly unknown[]).includes(raw.theme)) {
      return { ok: false, error: "Invalid theme" };
    }
    input.theme = raw.theme as BadgeTheme;
  }
  if (raw.range !== undefined) {
    if (!(RANGES as readonly unknown[]).includes(raw.range)) {
      return { ok: false, error: "Invalid range" };
    }
    input.range = raw.range as BadgeRange;
  }
  if (raw.revoked !== undefined) {
    if (typeof raw.revoked !== "boolean") {
      return { ok: false, error: "Invalid revoked" };
    }
    input.revoked = raw.revoked;
  }
  if (raw.timezone !== undefined) {
    // §3.4: invalid zones normalize to UTC instead of failing the save.
    input.timezone = normalizeBadgeTimezone(raw.timezone);
  }
  if (raw.project !== undefined) {
    if (raw.project !== null && typeof raw.project !== "string") {
      return { ok: false, error: "Invalid project" };
    }
    if (typeof raw.project === "string") {
      // Length is checked on the raw entry: the normalizer would silently cut
      // an over-long name down to 120 characters.
      if (raw.project.trim().length > MAX_PROJECT_LENGTH) {
        return { ok: false, error: "Invalid project" };
      }
      const key = normalizeBadgeProject(raw.project);

      if (!key) return { ok: false, error: "Invalid project" };
      // §4.2: the allowlist is the exposure boundary — a badge can never point
      // at a repository the operator has not published.
      if (!allowedProjects.includes(key)) {
        return { ok: false, error: "Project not allowed" };
      }
      input.project = key;
    } else {
      input.project = null;
    }
  }

  return { ok: true, input };
}
