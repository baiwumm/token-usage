// Series resolution + dispatch for the /api/functions/[...slug] dynamic route.
// Kept here so the contract tests can exercise it through a bracket-free
// module path; the route file itself is a thin re-export, and the real route
// (plus the legacy tokentracker-* alias rewrite) is covered by the
// server-level contract test.

import { errorResponse, getBearer, jsonResponse, CORS_HEADERS } from "./http";
import { assertConfigured } from "./supabase-rest";
import { resolvePrincipal } from "./principal";
import { SERIES } from "./account-series-handlers";

import { sha256Hex } from "@/lib/device-codes";

// Any token-usage-account-<x> slug belongs to the dispatcher so unknown
// series names get the contract 404 with the series catalog (§2.7).
const ACCOUNT_SLUG_RE = /^token-usage-account-(.+)$/;

// Dashboard-face negotiation cache (§2.7, 2026-10-27): successful GETs carry
// a strong ETag over the serialized payload and `private, no-cache` instead
// of the frozen CLI-face `no-store` — every request still reaches the server
// (freshness is never trusted), but an unchanged account re-validates to a
// body-less 304. Errors keep the stock no-store envelope. Exported for the
// static sibling routes (account-summary, dashboard) that don't ride the
// catch-all dispatcher.
export async function withNegotiationCache(
  request: Request,
  produce: () => Promise<Response>,
): Promise<Response> {
  const response = await produce();

  if (response.status !== 200) return response;

  const body = await response.text();
  const etag = `"${sha256Hex(body).slice(0, 32)}"`;
  const headers: Record<string, string> = {
    ...CORS_HEADERS,
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "private, no-cache",
    ETag: etag,
  };
  const ifNoneMatch = request.headers.get("if-none-match");

  if (
    ifNoneMatch &&
    ifNoneMatch
      .split(",")
      .some(
        (candidate) => candidate.trim() === etag || candidate.trim() === "*",
      )
  ) {
    return new Response(null, { status: 304, headers });
  }

  return new Response(body, { status: 200, headers });
}

export async function handleFunctionsGet(
  request: Request,
  ctx: { params: Promise<{ slug: string[] }> },
): Promise<Response> {
  try {
    assertConfigured();
    const principal = await resolvePrincipal(getBearer(request));

    if (!principal) return jsonResponse(401, { error: "Unauthorized" });

    const slugs = (await ctx.params).slug;
    const last = slugs[slugs.length - 1] ?? "";
    const match = last.match(ACCOUNT_SLUG_RE);

    if (!match) {
      // Not an account-series path: nothing else lives on the dynamic route.
      return jsonResponse(404, { error: "Not found" });
    }

    // The explicit ?series= parameter wins over the path segment (§2.7).
    const url = new URL(request.url);
    const explicit = url.searchParams.get("series");
    const series = explicit && SERIES[explicit] ? explicit : match[1];

    if (!series || !SERIES[series]) {
      const requested = explicit || match[1] || "(none)";

      return jsonResponse(404, {
        error: `Unknown account series: ${requested}`,
        series: Object.keys(SERIES),
      });
    }

    return await withNegotiationCache(request, () =>
      SERIES[series]({ url, principal }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
