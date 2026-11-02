// Browser client for /api/app/badge (docs/badge.md §7.1) — cookie-
// authenticated like lib/achievements/api.ts (no bearer header; same-origin
// cookies ride along). 401 means the page must send the browser to login.

import type { BadgeRange, BadgeStyle, BadgeTheme } from "./types";

export type BadgeConfig = {
  enabled: boolean;
  timezone: string;
  allowedProjects: string[];
  hasToken: boolean;
  tokenLast4: string | null;
};

export type BadgeSettings = BadgeConfig & { knownProjects: string[] };

export class BadgeApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BadgeApiError";
    this.status = status;
  }
}

export function isUnauthorized(error: unknown): boolean {
  return error instanceof BadgeApiError && error.status === 401;
}

async function request<T>(init?: RequestInit, query = ""): Promise<T> {
  const response = await fetch(`/api/app/badge${query}`, {
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });

  if (response.status === 401) throw new BadgeApiError("unauthorized", 401);
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw new BadgeApiError(
      payload.error || `HTTP ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function fetchBadgeSettings(): Promise<BadgeSettings> {
  return request<BadgeSettings>();
}

/** Generate or rotate the token; the plaintext comes back exactly once. */
export async function generateBadgeToken(): Promise<string> {
  const payload = await request<{ token: string }>({
    method: "POST",
    body: JSON.stringify({ action: "generate" }),
  });

  return payload.token;
}

export function updateBadgeConfig(patch: {
  enabled?: boolean;
  timezone?: string;
  allowedProjects?: string[];
}): Promise<BadgeConfig> {
  return request<BadgeConfig>({ method: "PUT", body: JSON.stringify(patch) });
}

export type BadgeView = {
  style: BadgeStyle;
  theme: BadgeTheme;
  range: BadgeRange;
  scope: "user" | "repo";
  project: string | null;
};

// The query every badge URL shares; documented defaults are omitted so the
// README snippets stay short.
export function badgeQuery(view: BadgeView): URLSearchParams {
  const query = new URLSearchParams();

  query.set("style", view.style);
  query.set("theme", view.theme);
  if (view.range !== "all") query.set("range", view.range);
  if (view.scope === "repo" && view.project) {
    query.set("scope", "repo");
    query.set("project", view.project);
  }

  return query;
}

/**
 * Session-authenticated owner preview (§7.3). `version` busts the browser
 * cache after a mutation so the image reloads with fresh data.
 */
export function badgePreviewUrl(view: BadgeView, version: number): string {
  const query = badgeQuery(view);

  query.set("preview", "1");
  query.set("v", String(version));

  return `/api/app/badge?${query.toString()}`;
}
