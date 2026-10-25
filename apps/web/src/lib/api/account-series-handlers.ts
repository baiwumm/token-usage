// The seven read-only account series handlers — ports
// api/_lib/account-endpoints.js. docs/cli-contract.md §2.7 freezes the
// parameter and response shapes.

import type { Principal } from "./principal";

import { jsonResponse } from "./http";
import { loadAccountUsage, loadSessionRows } from "./account-data";

import {
  boundRangeStart,
  dailySeries,
  deviceTotals,
  heatmapCells,
  heatmapCompactWire,
  hourlySeriesForDay,
  isValidDayKey,
  MAX_RANGE_DAYS,
  modelBreakdownSources,
  monthlySeries,
  parseTzContext,
  rowsForRequest,
  uuidOrNull,
  zonedDayKey,
  type TzContext,
} from "@/lib/account/series";
import { computeRowCost } from "@/lib/pricing";

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

const DAY_MS = 86_400_000;

interface SessionModelWire {
  model: string;
  total_tokens: number;
  total_cost_usd: string;
  share: number;
}

interface SessionWire {
  device_id: string;
  device_name: string;
  session_id: string;
  source: string;
  project_key: string | null;
  started_at: string;
  ended_at: string;
  duration_ms: number;
  input_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
  total_tokens: number;
  billable_total_tokens: number | null;
  total_cost_usd: string;
  models: SessionModelWire[];
}

const SESSION_COST_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
] as const;

function numberOr0(value: unknown): number {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function sessionModelsWire(
  rawModels: unknown,
  source: string,
  totalTokens: number,
): SessionModelWire[] {
  if (!Array.isArray(rawModels)) return [];

  return rawModels.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const record = raw as Record<string, unknown>;
    const tokens = numberOr0(record.total_tokens);
    const row: Record<string, unknown> = { source, model: record.model };

    for (const key of SESSION_COST_KEYS) row[key] = numberOr0(record[key]);
    const cost = computeRowCost(row);
    const share =
      totalTokens > 0
        ? Math.round((tokens / totalTokens) * 10_000) / 10_000
        : 0;

    return [
      {
        model: String(record.model ?? "unknown"),
        total_tokens: tokens,
        total_cost_usd: cost.toFixed(6),
        share,
      },
    ];
  });
}

function toSessionWire(item: SessionWire & { endedMs: number }): SessionWire {
  return {
    device_id: item.device_id,
    device_name: item.device_name,
    session_id: item.session_id,
    source: item.source,
    project_key: item.project_key,
    started_at: item.started_at,
    ended_at: item.ended_at,
    duration_ms: item.duration_ms,
    input_tokens: item.input_tokens,
    cached_input_tokens: item.cached_input_tokens,
    cache_creation_input_tokens: item.cache_creation_input_tokens,
    output_tokens: item.output_tokens,
    reasoning_output_tokens: item.reasoning_output_tokens,
    total_tokens: item.total_tokens,
    billable_total_tokens: item.billable_total_tokens,
    total_cost_usd: item.total_cost_usd,
    models: item.models,
  };
}

async function sessions({ url, principal }: SeriesArgs) {
  const fromParam = url.searchParams.get("from") || "";
  const toParam = url.searchParams.get("to") || "";
  const fromMs = Date.parse(fromParam);
  const toMs = Date.parse(toParam);

  if (
    !fromParam ||
    !toParam ||
    !Number.isFinite(fromMs) ||
    !Number.isFinite(toMs)
  ) {
    return jsonResponse(400, { error: "Missing from/to" });
  }
  if (fromMs > toMs) return jsonResponse(400, { error: "Invalid from/to" });

  const clampedFromMs = Math.max(fromMs, toMs - MAX_RANGE_DAYS * DAY_MS);
  const from = new Date(clampedFromMs).toISOString();
  const to = new Date(toMs).toISOString();

  const rawDeviceId = (url.searchParams.get("device_id") || "").trim();
  let deviceId: string | null = null;

  if (rawDeviceId) {
    deviceId = uuidOrNull(rawDeviceId);
    if (!deviceId) return jsonResponse(400, { error: "Invalid device_id" });
  }

  const source = (url.searchParams.get("source") || "")
    .trim()
    .toLowerCase()
    .slice(0, 100);
  const q = (url.searchParams.get("q") || "")
    .trim()
    .slice(0, 120)
    .toLowerCase();
  const limitParam = url.searchParams.get("limit");
  const limitRaw =
    limitParam == null || limitParam === "" ? Number.NaN : Number(limitParam);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(Math.trunc(limitRaw), 1), 200)
    : 50;
  const offsetParam = url.searchParams.get("offset");
  const offsetRaw =
    offsetParam == null || offsetParam === "" ? 0 : Number(offsetParam);
  const offset =
    Number.isFinite(offsetRaw) && offsetRaw > 0 ? Math.trunc(offsetRaw) : 0;

  const emptyPayload = {
    from,
    to,
    total: 0,
    limit,
    offset,
    totals: {
      sessions: 0,
      total_tokens: 0,
      billable_total_tokens: 0,
      total_cost_usd: "0.000000",
      duration_ms: 0,
    },
    facets: { sources: [], devices: [] },
    sessions: [],
  };

  // Account-level sources never appear in Sessions (§2.7): an explicit filter
  // for them is an empty result, not an error.
  if (source === "cursor" || source === "trae-cn") {
    return jsonResponse(200, emptyPayload);
  }

  const { sessions: rows, devices } = await loadSessionRows(
    principal.userId,
    from,
    to,
  );
  const deviceNames = new Map(
    devices
      .filter((device) => !device.revoked_at)
      .map((device) => [String(device.id), String(device.device_name ?? "")]),
  );

  const items: Array<SessionWire & { endedMs: number }> = [];

  for (const row of rows) {
    const rowDeviceId = String(row.device_id ?? "");
    const deviceName = deviceNames.get(rowDeviceId);

    if (deviceName == null) continue;
    const rowSource = String(row.source ?? "");

    // Defense in depth: account-level sources are rejected at ingest and by a
    // table check, but the read face must never expose them either (§2.7).
    if (rowSource === "cursor" || rowSource === "trae-cn") continue;
    const startedAt = String(row.started_at ?? "");
    const endedAt = String(row.ended_at ?? "");
    const startedMs = Date.parse(startedAt);
    const endedMs = Date.parse(endedAt);

    if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) continue;
    const totalTokens = numberOr0(row.total_tokens);
    const models = sessionModelsWire(row.models, rowSource, totalTokens);
    const cost = models.reduce(
      (sum, model) => sum + Number(model.total_cost_usd),
      0,
    );

    items.push({
      device_id: rowDeviceId,
      device_name: deviceName,
      session_id: String(row.session_id ?? ""),
      source: rowSource,
      project_key: row.project_key == null ? null : String(row.project_key),
      started_at: startedAt,
      ended_at: endedAt,
      duration_ms: Math.max(0, endedMs - startedMs),
      input_tokens: numberOr0(row.input_tokens),
      cached_input_tokens: numberOr0(row.cached_input_tokens),
      cache_creation_input_tokens: numberOr0(row.cache_creation_input_tokens),
      output_tokens: numberOr0(row.output_tokens),
      reasoning_output_tokens: numberOr0(row.reasoning_output_tokens),
      total_tokens: totalTokens,
      billable_total_tokens:
        row.billable_total_tokens == null
          ? null
          : numberOr0(row.billable_total_tokens),
      total_cost_usd: cost.toFixed(6),
      models,
      endedMs,
    });
  }

  const matchesQ = (item: SessionWire): boolean =>
    q === "" || (item.project_key ?? "").toLowerCase().includes(q);

  // Facets ignore the dimension they control so the dropdowns stay usable:
  // sources honour device_id + q, devices honour source + q (§2.7).
  const sourceFacetItems = items.filter(
    (item) => (!deviceId || item.device_id === deviceId) && matchesQ(item),
  );
  const deviceFacetItems = items.filter(
    (item) => (!source || item.source === source) && matchesQ(item),
  );

  const sourceCounts = new Map<string, number>();
  const deviceCounts = new Map<
    string,
    { device_name: string; sessions: number }
  >();

  for (const item of sourceFacetItems) {
    sourceCounts.set(item.source, (sourceCounts.get(item.source) ?? 0) + 1);
  }
  for (const item of deviceFacetItems) {
    const entry = deviceCounts.get(item.device_id) ?? {
      device_name: item.device_name,
      sessions: 0,
    };

    entry.sessions += 1;
    deviceCounts.set(item.device_id, entry);
  }

  const facets = {
    sources: [...sourceCounts.entries()]
      .map(([name, count]) => ({ source: name, sessions: count }))
      .sort(
        (first, second) =>
          second.sessions - first.sessions ||
          (first.source < second.source
            ? -1
            : first.source > second.source
              ? 1
              : 0),
      ),
    devices: [...deviceCounts.entries()]
      .map(([id, entry]) => ({
        device_id: id,
        device_name: entry.device_name,
        sessions: entry.sessions,
      }))
      .sort(
        (first, second) =>
          second.sessions - first.sessions ||
          (first.device_name < second.device_name
            ? -1
            : first.device_name > second.device_name
              ? 1
              : 0),
      ),
  };

  const filtered = items
    .filter(
      (item) =>
        (!deviceId || item.device_id === deviceId) &&
        (!source || item.source === source) &&
        matchesQ(item),
    )
    .sort(
      (first, second) =>
        second.endedMs - first.endedMs ||
        (first.source < second.source
          ? -1
          : first.source > second.source
            ? 1
            : 0) ||
        (first.session_id < second.session_id
          ? -1
          : first.session_id > second.session_id
            ? 1
            : 0),
    );

  let totalTokens = 0;
  let billableTokens = 0;
  let totalCost = 0;
  let durationMs = 0;

  for (const item of filtered) {
    totalTokens += item.total_tokens;
    billableTokens += item.billable_total_tokens ?? item.total_tokens;
    totalCost += Number(item.total_cost_usd);
    durationMs += item.duration_ms;
  }

  const page = filtered.slice(offset, offset + limit).map(toSessionWire);

  return jsonResponse(200, {
    from,
    to,
    total: filtered.length,
    limit,
    offset,
    totals: {
      sessions: filtered.length,
      total_tokens: totalTokens,
      billable_total_tokens: billableTokens,
      total_cost_usd: totalCost.toFixed(6),
      duration_ms: durationMs,
    },
    facets,
    sessions: page,
  });
}

export const SERIES: Record<string, (args: SeriesArgs) => Promise<Response>> = {
  daily,
  hourly,
  monthly,
  heatmap,
  "model-breakdown": modelBreakdown,
  devices,
  sessions,
};
