// Project display-name resolution (docs/ui-spec.md「项目（`/projects`）」节).
// token_sessions.project_key is already the directory basename, so identical
// basenames across devices and paths merge into one row naturally. The
// optional manual display name (project profile, 2026-11-06) is display-layer
// only: search, keys and the API keep using the basename.

import type { ProjectProfile } from "@/lib/projects/profile";

// Display-only strip of invisible Unicode (Cc control characters and Cf
// format characters such as BiDi marks and zero-width joiners). Stored keys,
// search and the API keep the raw basename — the wire-level cleanup lives in
// lib/ingest/normalize.ts — so a hostile directory name can never render as
// spliced or reversed text on the projects page.
const INVISIBLE_RE = /[\p{Cc}\p{Cf}]/gu;

export function resolveProjectDisplayName(
  key: string,
  profile?: ProjectProfile,
): string {
  const raw = profile?.display_name || key;

  return raw.replace(INVISIBLE_RE, "");
}
