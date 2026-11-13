// Badge config for the signed-in operator (docs/badge.md §7.1): the browser
// session authenticates via @supabase/ssr cookies exactly like
// /api/app/achievements (the /api/functions contract gate does not apply),
// then all reads and writes go through service-role.
//
// 2026-11-13 (multi-badge model): one row per badge in token_public_badges,
// plus one settings row per user. The token is stored in plaintext and handed
// back on every GET — it is a public identifier, and the settings page must be
// able to show the link again at any time. Creating a badge never touches the
// others; revoking sets revoked_at (reversible, same link), deleting removes
// the row for good (per-badge route).
//
// GET ?preview=1 renders the owner's badge SVG from the session instead of a
// token (§7.3). It lives on this route so the deployment keeps the same
// function count.

import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { jsonResponse } from "@/lib/api/http";
import { insert, update, upsert } from "@/lib/api/supabase-rest";
import {
  invalidateBadgeData,
  loadBadgeData,
  loadKnownProjects,
  normalizeBadgeAllowlist,
  normalizeBadgeProject,
  normalizeBadgeTimezone,
  type BadgeDefaults,
} from "@/lib/badge/data";
import { parseBadgeInput } from "@/lib/badge/input";
import {
  MAX_BADGES,
  MAX_DISPLAY_NAME,
  MAX_PROJECTS,
  MAX_PROJECT_LENGTH,
} from "@/lib/badge/limits";
import { parseBadgeParams } from "@/lib/badge/params";
import { renderBadgeSvg, renderFallbackBadge } from "@/lib/badge/render";
import { authenticateBadge } from "@/lib/badge/session";
import {
  BADGES_TABLE,
  SETTINGS_TABLE,
  TOKEN_PREFIX,
  badgePayload,
  configPayload,
  loadBadges,
  loadSettings,
  type BadgeRow,
} from "@/lib/badge/store";

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

// Storage failures answer one generic envelope; details stay server-side.
function logError(error: unknown): void {
  // eslint-disable-next-line no-console
  console.error(error);
}

function unavailable(error: unknown): NextResponse {
  logError(error);

  return jsonError(503, "Badge config unavailable");
}

function svgResponse(svg: string): NextResponse {
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

// §7.3 owner preview: the same params, loader and renderer as the public
// endpoint, authenticated by the session. Renders regardless of the enabled
// flag so a style can be chosen before going public; the allowlist still
// applies to repo previews. Preview is parameter-driven (the client passes the
// selected badge's stored values), so it always matches what the public link
// would render.
async function previewResponse(
  session: { userId: string; displayName: string },
  search: URLSearchParams,
): Promise<NextResponse> {
  const query = new URLSearchParams(search);

  query.set("token", "preview");
  const params = parseBadgeParams(query);

  if (!params.ok) return svgResponse(renderFallbackBadge("bad request"));

  try {
    const settings = await loadSettings(session.userId);
    let project: string | null = null;

    if (params.project) {
      project = normalizeBadgeProject(params.project);
      if (
        !project ||
        !normalizeBadgeAllowlist(settings?.allowed_projects).includes(project)
      ) {
        return svgResponse(renderFallbackBadge("unknown project"));
      }
    }
    const data = await loadBadgeData(
      session.userId,
      {
        // Nullish coalescing on purpose (§7.3 parity): an existing row's empty
        // display_name is a legitimate "show the generic label" value — falling
        // back on || would preview the profile name while the public badge says
        // "AI Coding Usage". Only a missing row previews the profile name.
        displayName: settings?.display_name ?? session.displayName,
        timezone: normalizeBadgeTimezone(settings?.timezone),
      },
      project ? "repo" : "user",
      project,
      params.range ?? "all",
    );

    return svgResponse(
      renderBadgeSvg(data, {
        style: params.style ?? "sparkline",
        theme: params.theme ?? "auto",
      }),
    );
  } catch (error) {
    logError(error);

    return svgResponse(renderFallbackBadge("badge unavailable"));
  }
}

export async function GET(request: NextRequest) {
  const session = await authenticateBadge();

  if ("response" in session) return session.response;

  const search = request.nextUrl.searchParams;

  if (search.get("preview") === "1") return previewResponse(session, search);

  try {
    const [settings, badges, knownProjects] = await Promise.all([
      loadSettings(session.userId),
      loadBadges(session.userId),
      loadKnownProjects(session.userId),
    ]);

    return jsonResponse(200, {
      ...configPayload(settings),
      knownProjects,
      badges: badges.map(badgePayload),
    });
  } catch (error) {
    return unavailable(error);
  }
}

// Create one more badge. Existing badges are untouched — that is the whole
// point of the multi-badge model (§3.2).
export async function POST(request: NextRequest) {
  const session = await authenticateBadge();

  if ("response" in session) return session.response;

  const settings = await loadSettings(session.userId);
  const allowedProjects = normalizeBadgeAllowlist(settings?.allowed_projects);
  const parsed = parseBadgeInput(await readJson(request), allowedProjects);

  if (!parsed.ok) return jsonError(400, parsed.error);

  try {
    if ((await loadBadges(session.userId)).length >= MAX_BADGES) {
      return jsonError(409, "Badge limit reached");
    }

    // §3.2: tu_badge_ + 32 base64url chars from 24 CSPRNG bytes.
    const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
    const now = new Date().toISOString();
    const defaults: BadgeDefaults = {
      style: parsed.input.style ?? "sparkline",
      theme: parsed.input.theme ?? "auto",
      range: parsed.input.range ?? "all",
      project: parsed.input.project ?? null,
    };
    const inserted = await insert(BADGES_TABLE, {
      user_id: session.userId,
      token,
      label: parsed.input.label ?? "",
      style: defaults.style,
      theme: defaults.theme,
      range: defaults.range,
      project: defaults.project,
      created_at: now,
      updated_at: now,
      revoked_at: null,
    });

    // Creating a badge turns the public switch on (the old generate did the
    // same); the first badge also snapshots the profile name and the browser
    // zone, so a fresh account never starts with an unsaved settings row.
    if (settings) {
      if (!settings.enabled) {
        await update(
          SETTINGS_TABLE,
          { enabled: true, updated_at: now },
          [["user_id", "eq", session.userId]],
          { returning: false },
        );
      }
    } else {
      await upsert(
        SETTINGS_TABLE,
        {
          user_id: session.userId,
          enabled: true,
          display_name: session.displayName,
          timezone: parsed.input.timezone ?? "UTC",
          allowed_projects: [],
          updated_at: now,
        },
        "user_id",
        { returning: false },
      );
    }
    invalidateBadgeData(session.userId);

    return jsonResponse(200, {
      badge: badgePayload(inserted[0] as BadgeRow),
      enabled: true,
    });
  } catch (error) {
    return unavailable(error);
  }
}

export async function PUT(request: NextRequest) {
  const session = await authenticateBadge();

  if ("response" in session) return session.response;

  const body = await readJson(request);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Invalid body");
  }
  const input = body as {
    enabled?: unknown;
    timezone?: unknown;
    allowedProjects?: unknown;
    displayName?: unknown;
  };
  const patch: Record<string, unknown> = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return jsonError(400, "Invalid enabled");
    }
    patch.enabled = input.enabled;
  }
  if (input.displayName !== undefined) {
    // §7.1: the public name is decoupled from the profile name — trimmed and
    // capped like the create snapshot; an empty string is legal and makes the
    // renderer fall back to the generic "AI Coding Usage" label.
    if (typeof input.displayName !== "string") {
      return jsonError(400, "Invalid displayName");
    }
    patch.display_name = input.displayName.trim().slice(0, MAX_DISPLAY_NAME);
  }
  if (input.timezone !== undefined) {
    // §3.4: invalid zones normalize to UTC instead of failing the save.
    patch.timezone = normalizeBadgeTimezone(input.timezone);
  }
  if (input.allowedProjects !== undefined) {
    const list = input.allowedProjects;

    if (!Array.isArray(list) || list.length > MAX_PROJECTS) {
      return jsonError(400, "Invalid allowedProjects");
    }
    const projects: string[] = [];

    for (const entry of list) {
      // Length is checked on the raw entry: the normalizer would silently cut
      // an over-long name down to 120 characters.
      if (typeof entry !== "string" || entry.length > MAX_PROJECT_LENGTH) {
        return jsonError(400, "Invalid allowedProjects");
      }
      const key = normalizeBadgeProject(entry);

      if (!key) return jsonError(400, "Invalid allowedProjects");
      if (!projects.includes(key)) projects.push(key);
    }
    patch.allowed_projects = projects;
  }
  try {
    patch.updated_at = new Date().toISOString();
    const existing = await loadSettings(session.userId);

    if (existing) {
      await update(SETTINGS_TABLE, patch, [["user_id", "eq", session.userId]], {
        returning: false,
      });
    } else {
      await upsert(
        SETTINGS_TABLE,
        { user_id: session.userId, ...patch },
        "user_id",
        { returning: false },
      );
    }

    // §7.1 cascade: a badge whose inline project just left the allowlist falls
    // back to the account badge, so a stale row can never render "unknown
    // project" on the public face. URL ?project= overrides keep their own
    // whitelist check at render time — an explicitly pinned removed project
    // still degrades there (§2.3), which is the operator's own URL.
    const previous = normalizeBadgeAllowlist(existing?.allowed_projects);
    const next = Array.isArray(patch.allowed_projects)
      ? (patch.allowed_projects as string[])
      : previous;
    const removed = previous.filter((key) => !next.includes(key));
    const fallbackBadgeIds: string[] = [];

    if (removed.length > 0) {
      for (const row of await loadBadges(session.userId)) {
        if (!row.project || !removed.includes(row.project)) continue;
        const updated = await update(
          BADGES_TABLE,
          { project: null, updated_at: patch.updated_at },
          [
            ["id", "eq", row.id],
            ["user_id", "eq", session.userId],
          ],
          { returning: true },
        );

        fallbackBadgeIds.push(String(updated[0]?.id ?? row.id));
      }
    }

    invalidateBadgeData(session.userId);

    // §7.1: the PUT response carries the fresh badge rows (the cascade may
    // have rewritten them) plus which rows fell back.
    const [settings, badges] = await Promise.all([
      loadSettings(session.userId),
      loadBadges(session.userId),
    ]);

    return jsonResponse(200, {
      ...configPayload(settings),
      badges: badges.map(badgePayload),
      fallbackBadgeIds,
    });
  } catch (error) {
    return unavailable(error);
  }
}
