// One badge by id (docs/badge.md §7.1, 2026-11-13 multi-badge model).
//
// PATCH edits the row (label and the stored display defaults) and owns the
// revoke/restore switch: `revoked: true` makes the public link answer exactly
// like an unknown token, `revoked: false` brings the SAME link back — the
// token never rotates, so a README never has to change.
//
// DELETE removes the row for good. The settings UI asks for a second
// confirmation; the link is gone immediately (cached embeds may lag up to the
// documented CDN window).

import { NextResponse, type NextRequest } from "next/server";

import { jsonResponse } from "@/lib/api/http";
import { remove, update } from "@/lib/api/supabase-rest";
import { invalidateBadgeData, normalizeBadgeAllowlist } from "@/lib/badge/data";
import { parseBadgeInput } from "@/lib/badge/input";
import { authenticateBadge } from "@/lib/badge/session";
import {
  BADGES_TABLE,
  badgePayload,
  loadBadges,
  loadBadge,
  loadSettings,
  type BadgeRow,
} from "@/lib/badge/store";

type RouteContext = { params: Promise<{ id: string }> };

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

export async function PATCH(request: NextRequest, context: RouteContext) {
  const session = await authenticateBadge();

  if ("response" in session) return session.response;

  const { id } = await context.params;

  try {
    if (!(await loadBadge(session.userId, id))) {
      return jsonError(404, "Badge not found");
    }
    const settings = await loadSettings(session.userId);
    const parsed = parseBadgeInput(
      await readJson(request),
      normalizeBadgeAllowlist(settings?.allowed_projects),
    );

    if (!parsed.ok) return jsonError(400, parsed.error);

    const { label, style, theme, range, project, revoked } = parsed.input;
    const patch: Record<string, unknown> = {};

    // 2026-11-14: one name per account, trimmed and case-folded, self
    // excluded — mirrors the POST check (§7.1).
    if (label !== undefined) {
      const clash = (await loadBadges(session.userId)).some(
        (row) =>
          row.id !== id &&
          (row.label ?? "").trim().toLowerCase() === label.toLowerCase(),
      );

      if (clash) return jsonError(409, "Label already exists");
      patch.label = label;
    }
    if (style !== undefined) patch.style = style;
    if (theme !== undefined) patch.theme = theme;
    if (range !== undefined) patch.range = range;
    if (project !== undefined) patch.project = project;
    if (revoked !== undefined) {
      patch.revoked_at = revoked ? new Date().toISOString() : null;
    }
    patch.updated_at = new Date().toISOString();

    const updated = await update(
      BADGES_TABLE,
      patch,
      [
        ["id", "eq", id],
        ["user_id", "eq", session.userId],
      ],
      { returning: true },
    );

    invalidateBadgeData(session.userId);

    return jsonResponse(200, badgePayload(updated[0] as BadgeRow));
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);

    return jsonError(503, "Badge config unavailable");
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const session = await authenticateBadge();

  if ("response" in session) return session.response;

  const { id } = await context.params;

  try {
    if (!(await loadBadge(session.userId, id))) {
      return jsonError(404, "Badge not found");
    }
    await remove(BADGES_TABLE, [
      ["id", "eq", id],
      ["user_id", "eq", session.userId],
    ]);
    invalidateBadgeData(session.userId);

    return new NextResponse(null, {
      status: 204,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error(error);

    return jsonError(503, "Badge config unavailable");
  }
}
