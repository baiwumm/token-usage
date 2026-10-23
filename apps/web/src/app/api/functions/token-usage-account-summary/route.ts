// GET /api/functions/token-usage-account-summary — device token or JWT.
// Dashboard face; schema frozen by docs/cli-contract.md §2.6. The rolling
// windows always end "today" in the caller's timezone.

import {
  errorResponse,
  getBearer,
  jsonResponse,
  methodNotAllowedResponse,
  preflightResponse,
} from "@/lib/api/http";
import { assertConfigured } from "@/lib/api/supabase-rest";
import { resolvePrincipal } from "@/lib/api/principal";
import { loadAccountUsage } from "@/lib/api/account-data";
import {
  dailySeries,
  isValidDayKey,
  parseTzContext,
  rowsForRequest,
  zonedDayKey,
} from "@/lib/account/series";

export const dynamic = "force-dynamic";

export async function POST() {
  return methodNotAllowedResponse();
}

export async function OPTIONS() {
  return preflightResponse();
}

function shiftDay(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86400000)
    .toISOString()
    .slice(0, 10);
}

function sumDaily(days: Array<Record<string, unknown>>) {
  const totals = {
    total_tokens: 0,
    billable_total_tokens: 0,
    input_tokens: 0,
    output_tokens: 0,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    reasoning_output_tokens: 0,
    conversation_count: 0,
    total_cost_usd: 0,
  };

  for (const day of days) {
    for (const key of Object.keys(totals)) {
      totals[key as keyof typeof totals] += Number(day[key]) || 0;
    }
  }

  return totals;
}

function rollingTotals(days: Array<Record<string, unknown>>) {
  const totals = { billable_total_tokens: 0, conversation_count: 0 };

  for (const day of days) {
    totals.billable_total_tokens += Number(day.billable_total_tokens) || 0;
    totals.conversation_count += Number(day.conversation_count) || 0;
  }

  return totals;
}

export async function GET(request: Request) {
  try {
    assertConfigured();
    const principal = await resolvePrincipal(getBearer(request));

    if (!principal) return jsonResponse(401, { error: "Unauthorized" });

    const url = new URL(request.url);
    const fromParam = url.searchParams.get("from") || "";
    const toParam = url.searchParams.get("to") || "";
    const tzContext = parseTzContext(url.searchParams);
    const deviceId = url.searchParams.get("device_id");

    const usage = await loadAccountUsage(principal.userId);
    const rows = rowsForRequest(usage, deviceId || undefined);
    const allDays = dailySeries(rows, tzContext);
    const todayStr =
      zonedDayKey(new Date(), tzContext) ||
      new Date().toISOString().slice(0, 10);

    const from = isValidDayKey(fromParam)
      ? fromParam
      : allDays[0]?.day || todayStr;
    const to = isValidDayKey(toParam) ? toParam : todayStr;
    const inRange = allDays.filter(
      (day) => (day.day || "") >= from && (day.day || "") <= to,
    );
    const totals = sumDaily(inRange);

    const l7 = allDays.filter(
      (day) =>
        (day.day || "") >= shiftDay(todayStr, -6) &&
        (day.day || "") <= todayStr,
    );
    const l30 = allDays.filter(
      (day) =>
        (day.day || "") >= shiftDay(todayStr, -29) &&
        (day.day || "") <= todayStr,
    );
    const l7t = rollingTotals(l7);
    const l30t = rollingTotals(l30);

    return jsonResponse(200, {
      from,
      to,
      days: inRange.length,
      scope: null,
      excluded_sources: [],
      totals: { ...totals, total_cost_usd: totals.total_cost_usd.toFixed(6) },
      rolling: {
        last_7d: {
          from: shiftDay(todayStr, -6),
          to: todayStr,
          active_days: l7.length,
          totals: l7t,
        },
        last_30d: {
          from: shiftDay(todayStr, -29),
          to: todayStr,
          active_days: l30.length,
          totals: l30t,
          avg_per_active_day:
            l30.length > 0
              ? Math.round(l30t.billable_total_tokens / l30.length)
              : 0,
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
