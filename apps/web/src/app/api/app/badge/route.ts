// Badge config for the signed-in operator (docs/badge.md §7.1): the browser
// session authenticates via @supabase/ssr cookies exactly like
// /api/app/achievements (the /api/functions contract gate does not apply),
// then all reads and writes go through service-role.
//
// The raw badge token exists only inside a generate response: the row keeps
// its SHA-256 hash plus the last four characters for the settings display.
// DELETE disables (hash kept, §3.2) so the public badge reads
// "badge disabled"; only a generate rotates the hash away.
//
// GET ?preview=1 renders the owner's badge SVG from the session instead of
// the token (§7.3) — the settings page never holds the plaintext after the
// one-time reveal. It lives on this route so the deployment keeps the same
// function count.

import { randomBytes } from "node:crypto";

import { NextResponse, type NextRequest } from "next/server";

import { requireAppSession } from "@/lib/api/app-session";
import { jsonResponse } from "@/lib/api/http";
import { select, update, upsert } from "@/lib/api/supabase-rest";
import {
  invalidateBadgeData,
  loadBadgeData,
  loadKnownProjects,
  normalizeBadgeAllowlist,
  normalizeBadgeProject,
  normalizeBadgeTimezone,
} from "@/lib/badge/data";
import { parseBadgeParams } from "@/lib/badge/params";
import { renderBadgeSvg, renderFallbackBadge } from "@/lib/badge/render";
import { sha256Hex } from "@/lib/device-codes";

const TABLE = "token_public_badges";
const TOKEN_PREFIX = "tu_badge_";
const MAX_PROJECTS = 32;
const MAX_PROJECT_LENGTH = 120;
const MAX_DISPLAY_NAME = 80;

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

type Session =
  { userId: string; displayName: string } | { response: NextResponse };

async function authenticate(): Promise<Session> {
  const session = await requireAppSession();

  if ("response" in session) return session;

  // §3.1: the display name is a session snapshot — never the email.
  const metadata = (session.user.user_metadata ?? {}) as {
    display_name?: unknown;
  };
  const displayName =
    typeof metadata.display_name === "string"
      ? metadata.display_name.trim().slice(0, MAX_DISPLAY_NAME)
      : "";

  return { userId: session.userId, displayName };
}

type BadgeRow = {
  token_hash: string | null;
  token_last4: string | null;
  enabled: boolean | null;
  display_name: string | null;
  timezone: string | null;
  allowed_projects: unknown;
};

async function loadRow(userId: string): Promise<BadgeRow | undefined> {
  const rows = await select(TABLE, {
    select:
      "token_hash,token_last4,enabled,display_name,timezone,allowed_projects",
    filters: [["user_id", "eq", userId]],
    limit: 1,
  });

  return rows[0] as BadgeRow | undefined;
}

// §7.1 GET shape — the raw token never appears, only whether one exists and
// its last four characters.
function configPayload(row: BadgeRow | undefined) {
  return {
    enabled: row?.enabled === true,
    timezone: normalizeBadgeTimezone(row?.timezone),
    allowedProjects: normalizeBadgeAllowlist(row?.allowed_projects),
    hasToken: Boolean(row?.token_hash),
    tokenLast4: row?.token_hash && row.token_last4 ? row.token_last4 : null,
  };
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
// applies to repo previews.
async function previewResponse(
  session: { userId: string; displayName: string },
  search: URLSearchParams,
): Promise<NextResponse> {
  const query = new URLSearchParams(search);

  query.set("token", "preview");
  const params = parseBadgeParams(query);

  if (!params.ok) return svgResponse(renderFallbackBadge("bad request"));

  try {
    const row = await loadRow(session.userId);
    let project: string | null = null;

    if (params.scope === "repo") {
      project = normalizeBadgeProject(params.project);
      if (
        !project ||
        !normalizeBadgeAllowlist(row?.allowed_projects).includes(project)
      ) {
        return svgResponse(renderFallbackBadge("unknown project"));
      }
    }
    const data = await loadBadgeData(
      session.userId,
      {
        displayName: row?.display_name || session.displayName,
        timezone: normalizeBadgeTimezone(row?.timezone),
      },
      params.scope,
      project,
      params.range,
    );

    return svgResponse(
      renderBadgeSvg(data, { style: params.style, theme: params.theme }),
    );
  } catch (error) {
    logError(error);

    return svgResponse(renderFallbackBadge("badge unavailable"));
  }
}

export async function GET(request: NextRequest) {
  const session = await authenticate();

  if ("response" in session) return session.response;

  const search = request.nextUrl.searchParams;

  if (search.get("preview") === "1") return previewResponse(session, search);

  try {
    const [row, knownProjects] = await Promise.all([
      loadRow(session.userId),
      loadKnownProjects(session.userId),
    ]);

    return jsonResponse(200, { ...configPayload(row), knownProjects });
  } catch (error) {
    return unavailable(error);
  }
}

export async function POST(request: NextRequest) {
  const session = await authenticate();

  if ("response" in session) return session.response;

  const body = (await readJson(request)) as { action?: unknown } | undefined;

  if (body?.action !== "generate") return jsonError(400, "Unsupported action");

  // §3.2: tu_badge_ + 32 base64url chars from 24 CSPRNG bytes.
  const token = `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;

  try {
    // Upsert only names the token columns, so timezone and the allowlist of
    // an existing row survive a rotation.
    await upsert(
      TABLE,
      {
        user_id: session.userId,
        token_hash: sha256Hex(token),
        token_last4: token.slice(-4),
        enabled: true,
        display_name: session.displayName,
        updated_at: new Date().toISOString(),
      },
      "user_id",
      { returning: false },
    );
    invalidateBadgeData(session.userId);

    return jsonResponse(200, { token });
  } catch (error) {
    return unavailable(error);
  }
}

export async function PUT(request: NextRequest) {
  const session = await authenticate();

  if ("response" in session) return session.response;

  const body = await readJson(request);

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return jsonError(400, "Invalid body");
  }
  const input = body as {
    enabled?: unknown;
    timezone?: unknown;
    allowedProjects?: unknown;
  };
  const patch: Record<string, unknown> = {};

  if (input.enabled !== undefined) {
    if (typeof input.enabled !== "boolean") {
      return jsonError(400, "Invalid enabled");
    }
    patch.enabled = input.enabled;
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
    if (await loadRow(session.userId)) {
      await update(TABLE, patch, [["user_id", "eq", session.userId]], {
        returning: false,
      });
    } else {
      await upsert(TABLE, { user_id: session.userId, ...patch }, "user_id", {
        returning: false,
      });
    }
    invalidateBadgeData(session.userId);

    return jsonResponse(200, configPayload(await loadRow(session.userId)));
  } catch (error) {
    return unavailable(error);
  }
}

export async function DELETE() {
  const session = await authenticate();

  if ("response" in session) return session.response;

  try {
    await update(
      TABLE,
      { enabled: false, updated_at: new Date().toISOString() },
      [["user_id", "eq", session.userId]],
      { returning: false },
    );
    invalidateBadgeData(session.userId);

    return jsonResponse(200, configPayload(await loadRow(session.userId)));
  } catch (error) {
    return unavailable(error);
  }
}
