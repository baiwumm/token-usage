// Browser client for /api/app/badge (docs/badge.md §7.1) — cookie-
// authenticated like lib/achievements/api.ts (no bearer header; same-origin
// cookies ride along). 401 means the page must send the browser to login.

import type { BadgeRange, BadgeStyle, BadgeTheme } from "./types";

/** One row of the multi-badge model (§3.2); the token is always readable. */
export type BadgeLink = {
  id: string;
  token: string;
  label: string;
  style: BadgeStyle;
  theme: BadgeTheme;
  range: BadgeRange;
  /** null → account badge; a project key → that repository (§2.1). */
  project: string | null;
  createdAt: string | null;
  /** Non-null = revoked: the link answers "badge unavailable" but the row and
   *  the token are kept, so restoring brings the same link back. */
  revokedAt: string | null;
};

export type BadgeConfig = {
  enabled: boolean;
  timezone: string;
  allowedProjects: string[];
  /** The publicly rendered name; "" falls back to "AI Coding Usage" (§5.2). */
  displayName: string;
};

export type BadgeSettings = BadgeConfig & {
  knownProjects: string[];
  badges: BadgeLink[];
};

/**
 * PUT /api/app/badge response: the fresh config plus the badge rows — rows are
 * included because the allowlist save may cascade `project` back to null
 * (§7.1), and the caller must see the rows as the server stored them.
 */
export type BadgeConfigResult = BadgeConfig & {
  badges: BadgeLink[];
  /** Rows whose inline project left the allowlist and fell back to null. */
  fallbackBadgeIds: string[];
};

export type BadgeLinkInput = {
  label?: string;
  style?: BadgeStyle;
  theme?: BadgeTheme;
  range?: BadgeRange;
  project?: string | null;
  revoked?: boolean;
};

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

async function request<T>(
  path = "",
  init?: RequestInit,
  query = "",
): Promise<T> {
  const response = await fetch(`/api/app/badge${path}${query}`, {
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

/** Create one more badge; existing links keep working (§3.2). */
export async function createBadge(
  input: BadgeLinkInput & { timezone?: string },
): Promise<BadgeLink> {
  const payload = await request<{ badge: BadgeLink }>("", {
    method: "POST",
    body: JSON.stringify(input),
  });

  return payload.badge;
}

/** Edit the row's label/display defaults, or revoke/restore it. */
export function updateBadgeLink(
  id: string,
  patch: BadgeLinkInput,
): Promise<BadgeLink> {
  return request<BadgeLink>(`/links/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(patch),
  });
}

/** Hard delete: the row and its link are gone for good. */
export async function deleteBadgeLink(id: string): Promise<void> {
  const response = await fetch(
    `/api/app/badge/links/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

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
}

export function updateBadgeConfig(patch: {
  enabled?: boolean;
  timezone?: string;
  allowedProjects?: string[];
  /** Empty string clears the public name (§7.1). */
  displayName?: string;
}): Promise<BadgeConfigResult> {
  return request<BadgeConfigResult>("", {
    method: "PUT",
    body: JSON.stringify(patch),
  });
}

/** The four display knobs a badge row stores (§2.1). */
export type BadgeView = {
  style: BadgeStyle;
  theme: BadgeTheme;
  range: BadgeRange;
  project: string | null;
};

// The preview query; the public link itself carries no parameters, so its
// snippets follow the row's stored defaults forever (§7.4).
export function badgeQuery(view: BadgeView): URLSearchParams {
  const query = new URLSearchParams();

  query.set("style", view.style);
  query.set("theme", view.theme);
  if (view.range !== "all") query.set("range", view.range);
  if (view.project) query.set("project", view.project);

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
