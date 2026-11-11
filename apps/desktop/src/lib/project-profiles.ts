// Web-edited project profiles, mirrored through the CLI
// (docs/cli-contract.md §2.13): `tokenusage project-profiles --json` prints
// the account payload as one JSON line, and the desktop captures it via
// run_cli. The desktop never reads the device token file itself
// (docs/desktop-plan.md §3 boundary 1) — the CLI, which already holds the
// pairing credential, fetches on its behalf.
//
// The payload is a display-only projection: display name, logo link and repo
// URL. Editing stays on the web dashboard.

export interface ProjectProfile {
  project_key: string;
  display_name: string | null;
  repo_url: string | null;
  repo_source: "manual" | "detected" | null;
  detected_repo_url: string | null;
  manual_repo_url: string | null;
  repo_hidden: boolean;
  logo_url: string | null;
  logo_upload_url: string | null;
}

export interface ProjectProfilesPayload {
  profiles: ProjectProfile[];
}

function asStringOrNull(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function toProfile(raw: unknown): ProjectProfile | null {
  if (raw === null || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const key = asStringOrNull(row.project_key);

  if (!key) return null;
  const repoSource =
    row.repo_source === "manual" || row.repo_source === "detected"
      ? row.repo_source
      : null;

  return {
    project_key: key,
    display_name: asStringOrNull(row.display_name),
    repo_url: asStringOrNull(row.repo_url),
    repo_source: repoSource,
    detected_repo_url: asStringOrNull(row.detected_repo_url),
    manual_repo_url: asStringOrNull(row.manual_repo_url),
    repo_hidden: row.repo_hidden === true,
    logo_url: asStringOrNull(row.logo_url),
    logo_upload_url: asStringOrNull(row.logo_upload_url),
  };
}

/**
 * Parse the CLI's single-line JSON payload. Malformed or partial output
 * degrades to an empty map rather than throwing — the monitor keeps showing
 * queue-derived names/logos until the next successful read.
 */
export function parseProjectProfiles(
  stdout: string,
): Map<string, ProjectProfile> {
  const map = new Map<string, ProjectProfile>();

  try {
    const parsed: unknown = JSON.parse(stdout);
    const profiles =
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as ProjectProfilesPayload).profiles)
        ? (parsed as ProjectProfilesPayload).profiles
        : [];

    for (const raw of profiles) {
      const profile = toProfile(raw);

      if (profile) map.set(profile.project_key, profile);
    }
  } catch {
    return map;
  }

  return map;
}

/**
 * Logo candidates in the web's display order (docs/ui-spec.md「项目与仓库」):
 * the typed `logo_url` first, then the uploaded link. The order matters — the
 * upload survives a typed-URL edit on the web, so preferring it kept showing
 * the old logo after a web change.
 */
export function profileLogoUrls(profile: ProjectProfile | null): string[] {
  if (!profile) return [];

  return [profile.logo_url, profile.logo_upload_url].filter(
    (url): url is string => Boolean(url),
  );
}

/** First logo candidate, or null when the account set no logo. */
export function profileLogoUrl(profile: ProjectProfile | null): string | null {
  return profileLogoUrls(profile)[0] ?? null;
}

/** Display name for a key, or null when the account has not set one. */
export function profileDisplayName(
  profile: ProjectProfile | null,
): string | null {
  return profile?.display_name ?? null;
}
