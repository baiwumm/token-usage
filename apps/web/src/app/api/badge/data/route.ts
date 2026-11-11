// Public aggregate snapshot endpoint (docs/badge.md §2.4): what the static
// marketing site (apps/landing) pulls at build time so its numbers track the
// public page instead of being hand-copied. Same service-role loader as the /u
// page — one aggregation path, so the two surfaces cannot disagree. Disabled
// and unknown tokens both answer 404 so the endpoint cannot probe for tokens.

import { NextResponse } from "next/server";

import { findBadgeOwner } from "@/lib/badge/data";
import { isValidBadgeToken } from "@/lib/badge/params";
import { loadPublicPageData } from "@/lib/public-page/data";
import { buildPublicSnapshot } from "@/lib/public-page/snapshot";

export const dynamic = "force-dynamic";

const SNAPSHOT_CACHE =
  "public, max-age=300, s-maxage=600, stale-while-revalidate=1800";

function errorResponse(status: number, error: string): NextResponse {
  return NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: Request) {
  const token = (new URL(request.url).searchParams.get("token") ?? "").trim();

  if (!isValidBadgeToken(token)) return errorResponse(400, "bad request");

  try {
    const owner = await findBadgeOwner(token);

    if (!owner?.enabled) return errorResponse(404, "badge unavailable");

    const snapshot = buildPublicSnapshot(await loadPublicPageData(owner));

    return NextResponse.json(snapshot, {
      status: 200,
      headers: { "Cache-Control": SNAPSHOT_CACHE },
    });
  } catch (error) {
    // §2.4.3: unexpected failures answer a generic envelope; details stay in
    // the server log.
    // eslint-disable-next-line no-console
    console.error(error);

    return errorResponse(500, "Internal Server Error");
  }
}

export async function POST() {
  return errorResponse(405, "Method not allowed");
}

export async function PUT() {
  return errorResponse(405, "Method not allowed");
}

export async function DELETE() {
  return errorResponse(405, "Method not allowed");
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { Allow: "GET, OPTIONS", "Cache-Control": "no-store" },
  });
}
