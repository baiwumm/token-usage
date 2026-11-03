// Project display-name resolution (docs/projects-page-plan.md 建议 1).
// token_sessions.project_key is already the directory basename, so identical
// basenames across devices and paths merge into one row naturally — this
// passthrough is the seam where a future manual rename/merge mapping (stored
// in settings, display-layer only) will plug in without touching the API.

export function resolveProjectDisplayName(key: string): string {
  return key;
}
