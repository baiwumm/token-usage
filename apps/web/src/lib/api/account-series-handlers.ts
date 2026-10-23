// The six read-only account series handlers — ports
// api/_lib/account-endpoints.js. docs/cli-contract.md §2.7 freezes the
// parameter and response shapes.

import type { Principal } from "./principal";

import { jsonResponse } from "./http";
import { loadAccountUsage } from "./account-data";

import {
  boundRangeStart,
  dailySeries,
  deviceTotals,
  heatmapCells,
  heatmapCompactWire,
  hourlySeriesForDay,
  isValidDayKey,
  modelBreakdownSources,
  monthlySeries,
  parseTzContext,
  rowsForRequest,
  uuidOrNull,
  zonedDayKey,
  type TzContext,
} from "@/lib/account/series";

type SeriesArgs = {
  url: URL;
  principal: Principal;
};

async function daily({ url, principal }: SeriesArgs) {
  const fromParam = url.searchParams.get("from") || "";
  const toParam = url.searchParams.get("to") || "";

  if (!isValidDayKey(fromParam) || !isValidDayKey(toParam)) {
    return jsonResponse(400, { error: "Missing from/to" });
  }
  const to = toParam;
  const from = boundRangeStart(fromParam, to);
  const tzContext = parseTzContext(url.searchParams);
  const deviceId = uuidOrNull(url.searchParams.get("device_id"));

  const usage = await loadAccountUsage(principal.userId);
  const rows = rowsForRequest(usage, deviceId);
  const data = dailySeries(rows, tzContext).filter(
    (entry) => (entry.day || "") >= from && (entry.day || "") <= to,
  );

  return jsonResponse(200, { from, to, data });
}

async function hourly({ url, principal }: SeriesArgs) {
  const dayParam =
    url.searchParams.get("day") || new Date().toISOString().slice(0, 10);

  if (!isValidDayKey(dayParam))
    return jsonResponse(400, { error: "Invalid day" });
  const tzContext = parseTzContext(url.searchParams);
  const deviceId = uuidOrNull(url.searchParams.get("device_id"));

  const usage = await loadAccountUsage(principal.userId);
  const rows = rowsForRequest(usage, deviceId);
  const data = hourlySeriesForDay(rows, dayParam, tzContext);

  return jsonResponse(200, { day: dayParam, data });
}

async function monthly({ url, principal }: SeriesArgs) {
  let from = url.searchParams.get("from") || "";
  let to = url.searchParams.get("to") || "";
  const monthsRaw = parseInt(url.searchParams.get("months") || "", 10);

  if ((!from || !to) && Number.isFinite(monthsRaw)) {
    const months = Math.min(Math.max(monthsRaw, 1), 24);
    const endDate =
      to && isValidDayKey(to) ? new Date(`${to}T00:00:00Z`) : new Date();
    const startDate = new Date(
      Date.UTC(
        endDate.getUTCFullYear(),
        endDate.getUTCMonth() - (months - 1),
        1,
      ),
    );

    from = startDate.toISOString().slice(0, 10);
    if (!to) to = endDate.toISOString().slice(0, 10);
  }
  if (!isValidDayKey(from) || !isValidDayKey(to)) {
    return jsonResponse(400, { error: "Missing from/to or months" });
  }
  const deviceId = uuidOrNull(url.searchParams.get("device_id"));

  const usage = await loadAccountUsage(principal.userId);
  const rows = rowsForRequest(usage, deviceId);
  const data = monthlySeries(rows, from, to);

  return jsonResponse(200, { from, to, data });
}

async function heatmap({ url, principal }: SeriesArgs) {
  const weeksRaw = parseInt(url.searchParams.get("weeks") || "52", 10);
  const weeks = Number.isFinite(weeksRaw)
    ? Math.min(Math.max(weeksRaw, 1), 104)
    : 52;
  const tzContext = parseTzContext(url.searchParams);
  const toParam = url.searchParams.get("to") || "";
  const weekStartsOn =
    (url.searchParams.get("week_starts_on") || "sun").toLowerCase() === "mon"
      ? "mon"
      : "sun";
  const wantsCompact = url.searchParams.get("format") === "compact";
  const deviceId = uuidOrNull(url.searchParams.get("device_id"));

  // End anchor: caller-supplied local day, else the caller's local today.
  const to = isValidDayKey(toParam)
    ? toParam
    : zonedDayKey(new Date().toISOString(), tzContext);

  if (!to) return jsonResponse(400, { error: "Invalid to" });
  const startDate = new Date(`${to}T00:00:00Z`);

  startDate.setUTCDate(startDate.getUTCDate() - weeks * 7 + 1);
  const from = startDate.toISOString().slice(0, 10);

  const usage = await loadAccountUsage(principal.userId);
  const rows = rowsForRequest(usage, deviceId);
  const { cells, maxValue, totalCostUsd } = heatmapCells(rows, {
    from,
    to,
    tzContext,
  });
  const activeDays = cells.filter(
    (cell) => cell.billable_total_tokens > 0,
  ).length;

  if (wantsCompact) {
    return jsonResponse(
      200,
      heatmapCompactWire({ from, to, weekStartsOn, cells, maxValue }),
    );
  }

  const weeksArr = [];

  for (let i = 0; i < cells.length; i += 7)
    weeksArr.push(cells.slice(i, i + 7));

  return jsonResponse(200, {
    from,
    to,
    week_starts_on: weekStartsOn,
    active_days: activeDays,
    streak_days: 0,
    weeks: weeksArr,
    total_cost_usd: totalCostUsd,
  });
}

async function modelBreakdown({ url, principal }: SeriesArgs) {
  const fromParam = url.searchParams.get("from") || "";
  const toParam = url.searchParams.get("to") || "";

  if (!isValidDayKey(fromParam) || !isValidDayKey(toParam)) {
    return jsonResponse(400, { error: "Missing from/to" });
  }
  const to = toParam;
  const from = boundRangeStart(fromParam, to);
  const tzContext: TzContext = parseTzContext(url.searchParams);
  const deviceId = uuidOrNull(url.searchParams.get("device_id"));

  const usage = await loadAccountUsage(principal.userId);
  const rows = rowsForRequest(usage, deviceId);
  const sources = modelBreakdownSources(rows, { from, to, tzContext });

  return jsonResponse(200, {
    from,
    to,
    days: 0,
    sources,
    // Same pricing_mode/source labels the local usage-model-breakdown handler
    // emits: per-token-type read-time pricing off the vendored static
    // LiteLLM snapshot + curated overrides.
    pricing: {
      model: "per-model",
      pricing_mode: "per_token_type",
      source: "litellm",
      effective_from: new Date().toISOString().slice(0, 10),
    },
  });
}

async function devices({ url, principal }: SeriesArgs) {
  const fromParam = url.searchParams.get("from") || "";
  const toParam = url.searchParams.get("to") || "";

  if (!isValidDayKey(fromParam) || !isValidDayKey(toParam)) {
    return jsonResponse(400, { error: "Missing from/to" });
  }
  const to = toParam;
  const from = boundRangeStart(fromParam, to);
  const tzContext = parseTzContext(url.searchParams);

  const usage = await loadAccountUsage(principal.userId);
  const { devices: list, accountSources } = deviceTotals(usage, {
    from,
    to,
    tzContext,
  });

  return jsonResponse(200, {
    from,
    to,
    devices: list,
    account_sources: accountSources,
  });
}

export const SERIES: Record<string, (args: SeriesArgs) => Promise<Response>> = {
  daily,
  hourly,
  monthly,
  heatmap,
  "model-breakdown": modelBreakdown,
  devices,
};
