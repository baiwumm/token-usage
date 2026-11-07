// Post-login redirect target handling. The route guard forwards the original
// path + query (e.g. /device?user_code=XXXX-XXXX) through ?next=; both the
// login page and /auth/callback sanitize it before honoring it.

// The dashboard lives at / and requires login (docs/requirements.md 路由约定,
// 2026-10-24 二次修订): a bare sign-in lands there.
export const DEFAULT_POST_LOGIN_PATH = "/";

export const LOGIN_PATH = "/login";

const MAX_LENGTH = 512;

/**
 * Accepts only same-origin relative paths. Rejects absolute URLs, protocol
 * relatives ("//host"), backslash tricks, the login page itself (loop) and
 * oversized values. Returns null when the value should be discarded.
 */
export function sanitizeNextPath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const candidate = raw.trim().slice(0, MAX_LENGTH);

  if (!candidate.startsWith("/")) return null;
  if (candidate.startsWith("//") || candidate.startsWith("/\\")) return null;
  if (candidate === LOGIN_PATH || candidate.startsWith(`${LOGIN_PATH}/`)) {
    return null;
  }

  return candidate;
}

/** Sanitized ?next= or the default destination. */
export function resolvePostLoginPath(raw: unknown): string {
  return sanitizeNextPath(raw) ?? DEFAULT_POST_LOGIN_PATH;
}

/**
 * Builds the /login bounce URL for a post-login target. The default
 * destination omits ?next=: its absence already resolves back to "/" (see
 * resolvePostLoginPath), so a bare-domain bounce keeps a clean /login while
 * deep links still carry their path + query through the parameter.
 */
export function loginPathFor(target: string): string {
  if (target === DEFAULT_POST_LOGIN_PATH) return LOGIN_PATH;

  return `${LOGIN_PATH}?next=${encodeURIComponent(target)}`;
}
