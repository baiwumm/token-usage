// Web deep links. The desktop has no router of its own: every "open in web"
// entry hands the paired instance's dashboard URL + a known path to the OS
// browser (docs/desktop-plan.md §12.3). Unpaired machines get null so the UI
// can hide the entry instead of inventing a host.

export type WebPage = "dashboard" | "projects" | "sessions" | "achievements";

/** This app's own repository (header entry + install guide). */
export const REPO_URL = "https://github.com/baiwumm/token-usage";
export const README_URL = `${REPO_URL}#readme`;

/** The project's own landing page (settings 网页 group, D11 acceptance). */
export const LANDING_URL = "https://token-usage.cc";

const PATHS: Record<WebPage, string> = {
  dashboard: "/",
  projects: "/projects",
  sessions: "/sessions",
  achievements: "/achievements",
};

/**
 * Join the dashboard base URL with a page path. Returns null for a missing or
 * non-http base so a corrupt config can never produce an OS-handoff string.
 */
export function webUrl(
  dashboardUrl: string | null,
  page: WebPage,
): string | null {
  if (dashboardUrl === null) return null;
  const base = dashboardUrl.trim().replace(/\/+$/, "");

  if (!/^https?:\/\//i.test(base) || /[\s\u0000-\u001f]/.test(base)) {
    return null;
  }

  return `${base}${PATHS[page]}`;
}
