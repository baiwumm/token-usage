// Thin PostgREST/Supabase Auth client over fetch — ports api/_lib/supabase-rest.js.
// Server-only: reads SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY
// at call time and is imported exclusively by route handlers.
//
// Deliberately kept on raw REST instead of @supabase/supabase-js so the ported
// endpoint logic (409-driven retry loops, status propagation) behaves exactly
// like the reference implementation; supabase-js would wrap the same
// PostgREST calls. See docs/rewrite-plan.md §4 for the dependency budget.

const SERVICE_KEY_ENV = "SUPABASE_SERVICE_ROLE_KEY";
const ANON_KEY_ENV = "SUPABASE_ANON_KEY";

export class SupabaseError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "SupabaseError";
    this.status = status;
    this.details = details;
  }
}

export type RestRow = Record<string, unknown>;

function baseUrl(): string {
  const value = String(process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");

  if (!value) throw new SupabaseError("SUPABASE_URL is not configured", 500);

  return value;
}

function serviceKey(): string {
  const value = String(process.env[SERVICE_KEY_ENV] || "").trim();

  if (!value)
    throw new SupabaseError(`${SERVICE_KEY_ENV} is not configured`, 500);

  return value;
}

function anonKey(): string {
  const value = String(process.env[ANON_KEY_ENV] || "").trim();

  if (!value) throw new SupabaseError(`${ANON_KEY_ENV} is not configured`, 500);

  return value;
}

function headers(
  key: string,
  extra: Record<string, string> = {},
): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    ...extra,
  };
}

function encodeValue(value: unknown): string {
  if (value === null) return "null";

  return encodeURIComponent(String(value));
}

function buildFilterQuery(
  filters: Array<[string, string, unknown]> = [],
): string {
  return filters
    .map(([column, operator, value]) => {
      const safeColumn = encodeURIComponent(String(column));
      const safeOperator = String(operator);

      return `${safeColumn}=${safeOperator}.${encodeValue(value)}`;
    })
    .join("&");
}

async function request(path: string, init: RequestInit = {}): Promise<unknown> {
  const response = await fetch(`${baseUrl()}${path}`, {
    ...init,
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let data: unknown = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "message" in data
        ? String((data as { message: unknown }).message)
        : `Supabase request failed (HTTP ${response.status})`;

    throw new SupabaseError(message, response.status, data);
  }

  return data;
}

export interface SelectOptions {
  select?: string;
  filters?: Array<[string, string, unknown]>;
  order?: string | null;
  limit?: number | null;
  offset?: number | null;
}

export async function select(
  table: string,
  options: SelectOptions = {},
): Promise<RestRow[]> {
  const {
    select: columns = "*",
    filters = [],
    order = null,
    limit = null,
    offset = null,
  } = options;
  const params = [`select=${encodeURIComponent(columns)}`];
  const filterQuery = buildFilterQuery(filters);

  if (filterQuery) params.push(filterQuery);
  if (order) params.push(`order=${encodeURIComponent(order)}`);
  if (limit != null) params.push(`limit=${Number(limit)}`);
  if (offset != null) params.push(`offset=${Number(offset)}`);
  const data = await request(
    `/rest/v1/${encodeURIComponent(table)}?${params.join("&")}`,
    { method: "GET", headers: headers(serviceKey()) },
  );

  return Array.isArray(data) ? (data as RestRow[]) : [];
}

export async function insert(
  table: string,
  rows: RestRow | RestRow[],
  { returning = true }: { returning?: boolean } = {},
): Promise<RestRow[]> {
  const payload = Array.isArray(rows) ? rows : [rows];

  if (payload.length === 0) return [];
  const prefer = returning ? "return=representation" : "return=minimal";
  const data = await request(`/rest/v1/${encodeURIComponent(table)}`, {
    method: "POST",
    headers: headers(serviceKey(), {
      "Content-Type": "application/json",
      Prefer: prefer,
    }),
    body: JSON.stringify(payload),
  });

  return returning && Array.isArray(data) ? (data as RestRow[]) : [];
}

export async function upsert(
  table: string,
  rows: RestRow | RestRow[],
  conflictColumns: string,
  { returning = true }: { returning?: boolean } = {},
): Promise<RestRow[]> {
  const payload = Array.isArray(rows) ? rows : [rows];

  if (payload.length === 0) return [];
  const prefer = `resolution=merge-duplicates,${returning ? "return=representation" : "return=minimal"}`;
  const query = `on_conflict=${encodeURIComponent(conflictColumns)}`;
  const data = await request(`/rest/v1/${encodeURIComponent(table)}?${query}`, {
    method: "POST",
    headers: headers(serviceKey(), {
      "Content-Type": "application/json",
      Prefer: prefer,
    }),
    body: JSON.stringify(payload),
  });

  return returning && Array.isArray(data) ? (data as RestRow[]) : [];
}

export async function update(
  table: string,
  patch: RestRow,
  filters: Array<[string, string, unknown]> = [],
  { returning = true }: { returning?: boolean } = {},
): Promise<RestRow[]> {
  const query = buildFilterQuery(filters);
  const prefer = returning ? "return=representation" : "return=minimal";
  const data = await request(
    `/rest/v1/${encodeURIComponent(table)}${query ? `?${query}` : ""}`,
    {
      method: "PATCH",
      headers: headers(serviceKey(), {
        "Content-Type": "application/json",
        Prefer: prefer,
      }),
      body: JSON.stringify(patch),
    },
  );

  return returning && Array.isArray(data) ? (data as RestRow[]) : [];
}

export async function rpc(name: string, args: RestRow = {}): Promise<unknown> {
  return request(`/rest/v1/rpc/${encodeURIComponent(name)}`, {
    method: "POST",
    headers: headers(serviceKey(), { "Content-Type": "application/json" }),
    body: JSON.stringify(args),
  });
}

export interface AuthUser {
  id: string;
  email?: string | null;
  [key: string]: unknown;
}

export async function getUser(accessToken: string): Promise<AuthUser | null> {
  if (!accessToken) return null;
  const response = await fetch(`${baseUrl()}/auth/v1/user`, {
    method: "GET",
    headers: {
      apikey: anonKey(),
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) {
    throw new SupabaseError("Supabase Auth is unavailable", 502);
  }
  const data = (await response.json()) as { id?: unknown };

  return data && typeof data.id === "string" ? (data as AuthUser) : null;
}

export function assertConfigured(): true {
  baseUrl();
  serviceKey();

  return true;
}
