// Dashboard data layer: typed fetchers for the contract endpoints consumed by
// the dashboard UI. Calls go to OUR route handlers (never Supabase directly)
// with the browser session's JWT — the dual-principal path of
// docs/cli-contract.md §1.4. Shapes mirror §2.10 / §2.7 wire payloads.

export interface DashboardTotals {
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  conversations: number;
  buckets: number;
  active_days: number;
  first_hour: string | null;
  last_hour: string | null;
}

export interface DashboardDay {
  date: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  conversations: number;
}

export interface DashboardModel {
  model: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  buckets: number;
}

export interface DashboardSource {
  source: string;
  total_tokens: number;
  total_cost_usd: number;
  buckets: number;
}

export interface DashboardDevice {
  device_id: string;
  device_name: string;
  platform: string;
  active: boolean;
  created_at: string;
  last_used_at: string | null;
  last_hour: string | null;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  buckets: number;
}

export interface DashboardPayload {
  user: { id: string; email: string | null };
  generated_at: string;
  range: {
    key: string;
    from: string | null;
    to: string | null;
    timezone: string | null;
    offset_minutes: number | null;
  };
  totals: DashboardTotals;
  all_time: DashboardTotals;
  daily: DashboardDay[];
  models: DashboardModel[];
  sources: DashboardSource[];
  devices: DashboardDevice[];
  shared_account_sources: {
    sources: DashboardSource[];
    total_tokens: number;
    total_cost_usd: number;
  };
}

export interface HourlyPoint {
  hour: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  conversations: number;
}

export interface HeatmapCell {
  day: string;
  total_tokens: number;
  billable_total_tokens: number;
  level: number;
  models: Record<string, number> | null;
}

export interface HeatmapPayload {
  from: string;
  to: string;
  week_starts_on: string;
  active_days: number;
  streak_days: number;
  weeks: HeatmapCell[][];
  total_cost_usd: number;
}

export class DashboardApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DashboardApiError";
    this.status = status;
  }
}

async function callContract<T>(
  slug: string,
  query: string,
  token: string,
): Promise<T> {
  const response = await fetch(`/api/functions/token-usage-${slug}${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (response.status === 401) {
    throw new DashboardApiError("unauthorized", 401);
  }
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as {
      error?: string;
    };

    throw new DashboardApiError(
      payload.error || `HTTP ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function fetchDashboard(
  token: string,
  params: { fromIso: string; toIso: string; tz?: string; rangeKey?: string },
): Promise<DashboardPayload> {
  const query = new URLSearchParams({
    from: params.fromIso,
    to: params.toIso,
    range: params.rangeKey ?? "custom",
  });

  if (params.tz) query.set("tz", params.tz);

  return callContract<DashboardPayload>("dashboard", `?${query}`, token);
}

export function fetchHourly(
  token: string,
  params: { day: string; tz?: string; deviceId?: string | null },
): Promise<{ day: string; data: HourlyPoint[] }> {
  const query = new URLSearchParams({ day: params.day });

  if (params.tz) query.set("tz", params.tz);
  if (params.deviceId) query.set("device_id", params.deviceId);

  return callContract<{ day: string; data: HourlyPoint[] }>(
    "account-hourly",
    `?${query}`,
    token,
  );
}

export function fetchHeatmap(
  token: string,
  params: { weeks?: number; toDay?: string; tz?: string },
): Promise<HeatmapPayload> {
  const query = new URLSearchParams();

  if (params.weeks != null) query.set("weeks", String(params.weeks));
  if (params.toDay) query.set("to", params.toDay);
  if (params.tz) query.set("tz", params.tz);
  query.set("week_starts_on", "mon");

  return callContract<HeatmapPayload>("account-heatmap", `?${query}`, token);
}
