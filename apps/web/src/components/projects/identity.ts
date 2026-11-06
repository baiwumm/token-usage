// Project display-name resolution (docs/ui-spec.md「项目（`/projects`）」节).
// token_sessions.project_key is already the directory basename, so identical
// basenames across devices and paths merge into one row naturally. The
// optional manual display name (project profile, 2026-11-06) is display-layer
// only: search, keys and the API keep using the basename.

import type { ProjectProfile } from "@/lib/projects/profile";

export function resolveProjectDisplayName(
  key: string,
  profile?: ProjectProfile,
): string {
  return profile?.display_name || key;
}
