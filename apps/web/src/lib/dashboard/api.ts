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

export interface AccountSummaryTotals {
  total_tokens: number;
  billable_total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  conversation_count: number;
  total_cost_usd: string;
}

export interface AccountSummaryRolling {
  from: string;
  to: string;
  active_days: number;
  totals: {
    billable_total_tokens: number;
    conversation_count: number;
  };
  avg_per_active_day?: number;
}

export interface AccountSummary {
  from: string;
  to: string;
  days: number;
  scope: string | null;
  excluded_sources: string[];
  totals: AccountSummaryTotals;
  rolling: {
    last_7d: AccountSummaryRolling;
    last_30d: AccountSummaryRolling;
  };
}

export interface SeriesPoint {
  day?: string;
  hour?: string;
  month?: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  conversation_count: number;
  models: Record<string, number>;
}

export interface ModelBreakdownModel {
  model: string;
  model_id: string;
  pricing: {
    status: "priced" | "free" | "unpriced";
    source: string | null;
    input: number;
    output: number;
    cache_read: number;
    cache_write: number;
  };
  cost_source: string | null;
  totals: {
    total_tokens: number;
    billable_total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    cache_creation_input_tokens: number;
    reasoning_output_tokens: number;
    total_cost_usd: string;
  };
}

export interface ModelBreakdownSource {
  source: string;
  totals: {
    total_tokens: number;
    billable_total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    cache_creation_input_tokens: number;
    reasoning_output_tokens: number;
    total_cost_usd: string;
  };
  models: ModelBreakdownModel[];
}

export interface ModelBreakdownPayload {
  from: string;
  to: string;
  days: number;
  sources: ModelBreakdownSource[];
  pricing: {
    model: string;
    pricing_mode: string;
    source: string;
    effective_from: string;
  };
}

export interface HourlyPoint {
  hour: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  conversation_count: number;
  models: Record<string, number>;
}

export interface HeatmapCell {
  day: string;
  total_tokens: number;
  billable_total_tokens: number;
  level: number;
  models: Record<string, number> | null;
  sources: Record<string, number> | null;
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
  params: {
    weeks?: number;
    toDay?: string;
    tz?: string;
    deviceId?: string | null;
  },
): Promise<HeatmapPayload> {
  const query = new URLSearchParams();

  if (params.weeks != null) query.set("weeks", String(params.weeks));
  if (params.toDay) query.set("to", params.toDay);
  if (params.tz) query.set("tz", params.tz);
  if (params.deviceId) query.set("device_id", params.deviceId);
  query.set("week_starts_on", "mon");

  return callContract<HeatmapPayload>("account-heatmap", `?${query}`, token);
}

export interface MonthlyPoint {
  month: string;
  total_tokens: number;
  billable_total_tokens: number;
  total_cost_usd: number;
  input_tokens: number;
  output_tokens: number;
  cached_input_tokens: number;
  cache_creation_input_tokens: number;
  reasoning_output_tokens: number;
  conversation_count: number;
  models: Record<string, number>;
}

// account-monthly buckets are UTC-fixed (docs/cli-contract.md §2.7); from/to
// are day keys.
export function fetchMonthly(
  token: string,
  params: {
    fromDay: string;
    toDay: string;
    deviceId?: string | null;
  },
): Promise<{ from: string; to: string; data: MonthlyPoint[] }> {
  const query = new URLSearchParams({
    from: params.fromDay,
    to: params.toDay,
  });

  if (params.deviceId) query.set("device_id", params.deviceId);

  return callContract<{ from: string; to: string; data: MonthlyPoint[] }>(
    "account-monthly",
    `?${query}`,
    token,
  );
}

export function fetchSummary(
  token: string,
  params: {
    fromDay: string;
    toDay: string;
    tz?: string;
    deviceId?: string | null;
  },
): Promise<AccountSummary> {
  const query = new URLSearchParams({
    from: params.fromDay,
    to: params.toDay,
  });

  if (params.tz) query.set("tz", params.tz);
  if (params.deviceId) query.set("device_id", params.deviceId);

  return callContract<AccountSummary>("account-summary", `?${query}`, token);
}

export function fetchDaily(
  token: string,
  params: {
    fromDay: string;
    toDay: string;
    tz?: string;
    deviceId?: string | null;
  },
): Promise<{ from: string; to: string; data: SeriesPoint[] }> {
  const query = new URLSearchParams({
    from: params.fromDay,
    to: params.toDay,
  });

  if (params.tz) query.set("tz", params.tz);
  if (params.deviceId) query.set("device_id", params.deviceId);

  return callContract<{ from: string; to: string; data: SeriesPoint[] }>(
    "account-daily",
    `?${query}`,
    token,
  );
}

export function fetchModelBreakdown(
  token: string,
  params: {
    fromDay: string;
    toDay: string;
    tz?: string;
    deviceId?: string | null;
  },
): Promise<ModelBreakdownPayload> {
  const query = new URLSearchParams({
    from: params.fromDay,
    to: params.toDay,
  });

  if (params.tz) query.set("tz", params.tz);
  if (params.deviceId) query.set("device_id", params.deviceId);

  return callContract<ModelBreakdownPayload>(
    "account-model-breakdown",
    `?${query}`,
    token,
  );
}

export interface SessionModel {
  model: string;
  total_tokens: number;
  total_cost_usd: string;
  share: number;
}

export interface SessionItem {
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
  models: SessionModel[];
}

export interface SessionsPayload {
  from: string;
  to: string;
  total: number;
  limit: number;
  offset: number;
  totals: {
    sessions: number;
    total_tokens: number;
    billable_total_tokens: number;
    total_cost_usd: string;
    duration_ms: number;
  };
  facets: {
    sources: Array<{ source: string; sessions: number }>;
    devices: Array<{
      device_id: string;
      device_name: string;
      sessions: number;
    }>;
  };
  sessions: SessionItem[];
}

export function fetchSessions(
  token: string,
  params: {
    fromIso: string;
    toIso: string;
    deviceId?: string | null;
    source?: string | null;
    q?: string | null;
    limit?: number;
    offset?: number;
  },
): Promise<SessionsPayload> {
  const query = new URLSearchParams({
    from: params.fromIso,
    to: params.toIso,
  });

  if (params.deviceId) query.set("device_id", params.deviceId);
  if (params.source) query.set("source", params.source);
  if (params.q) query.set("q", params.q);
  if (params.limit != null) query.set("limit", String(params.limit));
  if (params.offset != null) query.set("offset", String(params.offset));

  return callContract<SessionsPayload>("account-sessions", `?${query}`, token);
}
