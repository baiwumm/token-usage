// Project profile wire shape and display helpers shared by the
// /api/app/project-profiles route and the projects page (docs/ui-spec.md
// 「项目（`/projects`）」节). Client-safe: no server imports.
//
// Display rules (resolved server-side into the wire fields):
// - name: display_name, else the project_key (directory basename);
// - repo: the manual link, else the CLI-detected one unless repo_hidden;
// - logo: logo_url, then logo_upload_url, then initials — kept as separate
//   candidates so the browser can fall back level by level on a load error.

export type RepoSource = "manual" | "detected";

export interface ProjectProfile {
  project_key: string;
  display_name: string | null;
  /** Effective link: the manual one, else the detected one unless hidden. */
  repo_url: string | null;
  repo_source: RepoSource | null;
  /** Newest non-null CLI detection among non-revoked devices (contract v3). */
  detected_repo_url: string | null;
  manual_repo_url: string | null;
  repo_hidden: boolean;
  /** Typed logo URL — the first logo candidate. */
  logo_url: string | null;
  /** Public URL of the uploaded logo — the second logo candidate. */
  logo_upload_url: string | null;
}

export interface ProjectProfilesPayload {
  /** False when the optional avatars bucket is not deployed. */
  upload_enabled: boolean;
  profiles: ProjectProfile[];
}

export type RepoHost = "github" | "gitee" | "other";

export function repoHostOf(url: string): RepoHost {
  try {
    const host = new URL(url).hostname.toLowerCase();

    if (host === "github.com") return "github";
    if (host === "gitee.com") return "gitee";
  } catch {
    // Not a URL: treat as a generic link.
  }

  return "other";
}

export type LogoSources = Pick<ProjectProfile, "logo_url" | "logo_upload_url">;

/** Logo candidates in display order (typed URL first, then the upload). */
export function logoCandidates(profile: LogoSources | undefined): string[] {
  if (!profile) return [];

  return [profile.logo_url, profile.logo_upload_url].filter(
    (url): url is string => Boolean(url),
  );
}

/** GitHub serves every owner's avatar at github.com/<owner>.png. */
export function githubOwnerAvatar(repoUrl: string | null): string | null {
  if (!repoUrl) return null;
  try {
    const url = new URL(repoUrl);

    if (url.hostname.toLowerCase() !== "github.com") return null;
    const owner = url.pathname.split("/").filter(Boolean)[0];

    return owner ? `https://github.com/${owner}.png` : null;
  } catch {
    return null;
  }
}

// Field validation shared by the edit dialog and /api/app/project-profiles
// (the route stays authoritative; the dialog only shows the same verdict
// inline). Limits match the token_project_profiles CHECK constraints.

export const MAX_DISPLAY_NAME = 60;
const MAX_URL_LENGTH = 500;

export type Parsed<T> = { ok: true; value: T } | { ok: false };

/** Optional display name: trimmed, 1–60 characters, no control characters. */
export function parseDisplayName(value: unknown): Parsed<string | null> {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();

  if (!trimmed) return { ok: true, value: null };
  // Code points, matching char_length() in the table's CHECK.
  if (
    /\p{Cc}/u.test(trimmed) ||
    Array.from(trimmed).length > MAX_DISPLAY_NAME
  ) {
    return { ok: false };
  }

  return { ok: true, value: trimmed };
}

/**
 * Optional https URL (manual repo link or typed logo): no whitespace or
 * control characters, no embedded credentials, ≤500 characters once
 * normalized by the URL parser. Anything else — http, javascript:, data: —
 * is rejected rather than rewritten.
 */
export function parseHttpsUrl(value: unknown): Parsed<string | null> {
  if (value == null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const trimmed = value.trim();

  if (!trimmed) return { ok: true, value: null };
  if (/[\s\p{Cc}]/u.test(trimmed)) return { ok: false };
  let url: URL;

  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false };
  }
  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password
  ) {
    return { ok: false };
  }
  const href = url.href;

  if (href.length > MAX_URL_LENGTH || /[\s\p{Cc}]/u.test(href)) {
    return { ok: false };
  }

  return { ok: true, value: href };
}
