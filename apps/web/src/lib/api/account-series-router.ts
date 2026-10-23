// Series resolution + dispatch for the /api/functions/[...slug] dynamic route.
// Kept here so the contract tests can exercise it through a bracket-free
// module path; the route file itself is a thin re-export, and the real route
// (plus the legacy tokentracker-* alias rewrite) is covered by the
// server-level contract test.

import { errorResponse, getBearer, jsonResponse } from "./http";
import { assertConfigured } from "./supabase-rest";
import { resolvePrincipal } from "./principal";
import { SERIES } from "./account-series-handlers";

// Any token-usage-account-<x> slug belongs to the dispatcher so unknown
// series names get the contract 404 with the series catalog (§2.7).
const ACCOUNT_SLUG_RE = /^token-usage-account-(.+)$/;

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

    return SERIES[series]({ url, principal });
  } catch (error) {
    return errorResponse(error);
  }
}
