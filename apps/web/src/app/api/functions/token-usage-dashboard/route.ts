// GET /api/functions/token-usage-dashboard — device token or JWT. Dashboard
// face; docs/cli-contract.md §2.10. `to` is an exclusive upper bound.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
} from "@/lib/api/http";
import { assertConfigured } from "@/lib/api/supabase-rest";
import { resolvePrincipal } from "@/lib/api/principal";
import { withNegotiationCache } from "@/lib/api/account-series-router";
import { loadAccountUsage } from "@/lib/api/account-data";
import { buildDashboardPayload } from "@/lib/account/usage";

export const dynamic = "force-dynamic";

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

function parseOffset(value: string | null): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
}

// §2.10 freezes the combined message (the reference impl split "Invalid
// from"/"Invalid to"; the contract text wins).
function parseDateOrThrow(value: string | null): string | null {
  if (value == null || value === "") return null;
  const parsed = Date.parse(String(value));

  if (!Number.isFinite(parsed)) {
    const error = new Error("Invalid from/to");

    error.name = "HttpError";
    (error as Error & { status: number }).status = 400;
    throw error;
  }

  return new Date(parsed).toISOString();
}

export async function GET(request: Request) {
  try {
    return await withNegotiationCache(request, async () => {
      assertConfigured();
      const principal = await resolvePrincipal(getBearer(request));

      if (!principal) return jsonResponse(401, { error: "Unauthorized" });

      const url = new URL(request.url);
      const rangeKey = String(url.searchParams.get("range") || "custom").slice(
        0,
        20,
      );
      const from = parseDateOrThrow(url.searchParams.get("from"));
      const to = parseDateOrThrow(url.searchParams.get("to"));
      const timeZone =
        url.searchParams.get("tz") && url.searchParams.get("tz")!.trim()
          ? url.searchParams.get("tz")!.trim().slice(0, 100)
          : null;
      const offsetMinutes = parseOffset(
        url.searchParams.get("tz_offset_minutes"),
      );

      const usage = await loadAccountUsage(principal.userId);
      const payload = buildDashboardPayload({
        user: principal.user,
        usage,
        from,
        to,
        timeZone,
        offsetMinutes,
        rangeKey,
      });

      return jsonResponse(200, payload);
    });
  } catch (error) {
    return errorResponse(error);
  }
}
