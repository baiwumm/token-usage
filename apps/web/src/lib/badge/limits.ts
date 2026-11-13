// Shared numeric limits for the badge model (docs/badge.md §3 / §7.1). They
// live in one module so the route handlers and the settings UI can never drift
// apart — the client disables "add" at the same count the server rejects.

/** One row per badge; revoked rows still occupy a slot until deleted. */
export const MAX_BADGES = 10;
/** Badge label (备注名), characters after trimming. */
export const MAX_BADGE_LABEL = 40;
/** Public display name snapshot (settings level). */
export const MAX_DISPLAY_NAME = 80;
/** Repository allowlist size. */
export const MAX_PROJECTS = 32;
/** Single project_key length, checked before normalization. */
export const MAX_PROJECT_LENGTH = 120;
