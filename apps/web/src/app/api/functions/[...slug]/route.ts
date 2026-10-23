// GET /api/functions/[...slug] — ONE dynamic route serving the six read-only
// account series (Vercel Hobby function budget). Dashboard face;
// docs/cli-contract.md §2.7.
//
// The contract's canonical URLs are /api/functions/token-usage-account-<series>
// — a "partially dynamic" segment, which the Next App Router does not support
// (a [param] folder must own the whole segment). A catch-all under
// /api/functions/ therefore dispatches the account-<series> family by slug,
// while every static sibling route keeps winning resolution for its own path.
// Legacy tokentracker-account-* rewrites land here with the rewritten slug and
// behave identically. The series may also be forced via ?series=.

import { methodNotAllowedResponse, preflightResponse } from "@/lib/api/http";
import { handleFunctionsGet } from "@/lib/api/account-series-router";

export const dynamic = "force-dynamic";

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

export function GET(
  request: Request,
  ctx: { params: Promise<{ slug: string[] }> },
) {
  return handleFunctionsGet(request, ctx);
}
