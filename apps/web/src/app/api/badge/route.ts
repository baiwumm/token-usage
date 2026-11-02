// Public badge endpoint (docs/badge.md §2): query-parameter driven SVG for
// READMEs and profile pages. Service-role reads only (zero browser Supabase);
// the token is matched by its SHA-256 hash and never echoed back. Business
// failures degrade to the fixed fallback card with no-store, so an embedded
// badge never renders as a broken image (§2.3).

import { NextResponse } from "next/server";

import {
  findBadgeOwner,
  loadBadgeData,
  normalizeBadgeProject,
} from "@/lib/badge/data";
import { parseBadgeParams } from "@/lib/badge/params";
import { renderBadgeSvg, renderFallbackBadge } from "@/lib/badge/render";

export const dynamic = "force-dynamic";

const SVG_CONTENT_TYPE = "image/svg+xml; charset=utf-8";
const SVG_SUCCESS_CACHE =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";

function svgResponse(svg: string, cacheControl: string): NextResponse {
  return new NextResponse(svg, {
    status: 200,
    headers: {
      "Content-Type": SVG_CONTENT_TYPE,
      "Cache-Control": cacheControl,
    },
  });
}

function fallback(message: string): NextResponse {
  return svgResponse(renderFallbackBadge(message), "no-store");
}

function jsonError(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const params = parseBadgeParams(new URL(request.url).searchParams);

  if (!params.ok) return fallback("bad request");

  try {
    const owner = await findBadgeOwner(params.token);

    if (!owner) return fallback("badge unavailable");

    let project: string | null = null;

    // §4.2 allowlist before the enabled flag (golden-pinned precedence): a
    // non-allowlisted repo reads "unknown project" whether or not the badge
    // is currently disabled. Exact match after normalization on both sides.
    if (params.scope === "repo") {
      project = normalizeBadgeProject(params.project);
      if (!project || !owner.allowedProjects.includes(project)) {
        return fallback("unknown project");
      }
    }

    if (!owner.enabled) return fallback("badge disabled");

    const data = await loadBadgeData(
      owner.userId,
      { displayName: owner.displayName, timezone: owner.timezone },
      params.scope,
      project,
      params.range,
    );

    return svgResponse(
      renderBadgeSvg(data, { style: params.style, theme: params.theme }),
      SVG_SUCCESS_CACHE,
    );
  } catch (error) {
    // §2.2: unexpected failures answer a generic envelope; details stay in
    // the server log.
    console.error(error);

    return jsonError(500, "Internal Server Error");
  }
}

export async function POST() {
  return jsonError(405, "Method not allowed");
}

export async function PUT() {
  return jsonError(405, "Method not allowed");
}

export async function DELETE() {
  return jsonError(405, "Method not allowed");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, OPTIONS", "Cache-Control": "no-store" },
  });
}
