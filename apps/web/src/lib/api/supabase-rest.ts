// Data access layer over @supabase/supabase-js (secret key), used exclusively
// by the contract route handlers. Server-only.
//
// The exported surface mirrors the previous raw-REST client so the ported
// endpoint logic is unchanged:
//   - every function THROWS SupabaseError on failure (supabase-js returns
//     { data, error } instead of throwing);
//   - unique-violation errors surface as status 409 — the device-flow retry
//     loops and the pair-flow name fallback depend on it;
//   - every other PostgREST error maps to status 500, whose body is the
//     generic "Internal server error" envelope (docs/cli-contract.md §1.3);
//   - filters keep the wire-shaped tuple form [column, operator, value] with
//     REST semantics ("is", "null").
//
// Environment variables follow the current Supabase key system
// (docs/guides/getting-started/api-keys): publishable/secret keys first, the
// legacy anon/service_role names kept as fallbacks.

import {
  createClient,
  type SupabaseClient,
  type PostgrestError,
  type AuthError,
} from "@supabase/supabase-js";

export type RestRow = Record<string, unknown>;

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

const UNIQUE_VIOLATION = "23505";

function envValue(...names: string[]): string {
  for (const name of names) {
    const value = String(process.env[name] || "").trim();

    if (value) return value;
  }

  return "";
}

export function supabaseUrl(): string {
  const value = envValue("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(
    /\/$/,
    "",
  );

  if (!value)
    throw new SupabaseError("NEXT_PUBLIC_SUPABASE_URL is not configured", 500);

  return value;
}

// Publishable key (replaces the anon key; still a public client value).
export function publishableKey(): string {
  const value = envValue(
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
    "SUPABASE_ANON_KEY",
  );

  if (!value)
    throw new SupabaseError(
      "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is not configured",
      500,
    );

  return value;
}

// Secret key (replaces service_role; backend-only, bypasses RLS).
export function secretKey(): string {
  const value = envValue("SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY");

  if (!value)
    throw new SupabaseError("SUPABASE_SECRET_KEY is not configured", 500);

  return value;
}

let cachedAdmin: SupabaseClient | null = null;

function adminClient(): SupabaseClient {
  if (!cachedAdmin) {
    cachedAdmin = createClient(supabaseUrl(), secretKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cachedAdmin;
}

let cachedPublic: SupabaseClient | null = null;

function publicAuthClient(): SupabaseClient {
  if (!cachedPublic) {
    cachedPublic = createClient(supabaseUrl(), publishableKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return cachedPublic;
}

function toSupabaseError(error: PostgrestError): SupabaseError {
  if (error.code === UNIQUE_VIOLATION) {
    return new SupabaseError(error.message, 409, error);
  }

  // Never leak PostgREST details through a 4xx; route handlers turn 500s into
  // the generic error envelope and log the details server-side only.
  return new SupabaseError(error.message, 500, error);
}

type Filter = [string, string, unknown];

function applyFilters(query: any, filters: Filter[]): any {
  let result = query;

  for (const [column, operator, value] of filters) {
    switch (operator) {
      case "eq":
        result = result.eq(column, value as string);
        break;
      case "neq":
        result = result.neq(column, value as string);
        break;
      case "gt":
        result = result.gt(column, value as string);
        break;
      case "is":
        result = result.is(column, value === "null" ? null : (value as string));
        break;
      default:
        throw new SupabaseError(
          `Unsupported filter operator: ${operator}`,
          500,
        );
    }
  }

  return result;
}

function applyOrder(query: any, order: string | null): any {
  if (!order) return query;
  let result = query;

  for (const part of order.split(",")) {
    const [column, direction] = part.split(".");

    result = result.order(column, { ascending: direction !== "desc" });
  }

  return result;
}

export interface SelectOptions {
  select?: string;
  filters?: Filter[];
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
  let query = applyOrder(
    applyFilters(adminClient().from(table).select(columns), filters),
    order,
  );

  if (limit != null) query = query.limit(Number(limit));
  if (offset != null) {
    const to =
      limit != null
        ? Number(offset) + Number(limit) - 1
        : Number.MAX_SAFE_INTEGER;

    query = query.range(Number(offset), to);
  }
  const { data, error } = await query;

  if (error) throw toSupabaseError(error);

  return Array.isArray(data) ? (data as RestRow[]) : [];
}

// Await a builder whose `.select()` chaining differs by `returning`; the two
// chains have incompatible generic shapes, so the branch happens before await.

async function runQuery(pending: any, returning: boolean): Promise<RestRow[]> {
  const { data, error } = await pending;

  if (error) throw toSupabaseError(error);

  return returning && Array.isArray(data) ? (data as RestRow[]) : [];
}

export async function insert(
  table: string,
  rows: RestRow | RestRow[],
  { returning = true }: { returning?: boolean } = {},
): Promise<RestRow[]> {
  const payload = Array.isArray(rows) ? rows : [rows];

  if (payload.length === 0) return [];
  const builder = adminClient().from(table).insert(payload);

  return runQuery(returning ? builder.select() : builder, returning);
}

export async function upsert(
  table: string,
  rows: RestRow | RestRow[],
  conflictColumns: string,
  { returning = true }: { returning?: boolean } = {},
): Promise<RestRow[]> {
  const payload = Array.isArray(rows) ? rows : [rows];

  if (payload.length === 0) return [];
  // Default resolution is merge-duplicates: bucket-granular LAST-WINS.
  const builder = adminClient()
    .from(table)
    .upsert(payload, { onConflict: conflictColumns });

  return runQuery(returning ? builder.select() : builder, returning);
}

export async function update(
  table: string,
  patch: RestRow,
  filters: Filter[] = [],
  { returning = true }: { returning?: boolean } = {},
): Promise<RestRow[]> {
  const builder = applyFilters(
    adminClient().from(table).update(patch),
    filters,
  );

  return runQuery(returning ? builder.select() : builder, returning);
}

export async function rpc(name: string, args: RestRow = {}): Promise<unknown> {
  const { data, error } = await adminClient().rpc(name, args);

  if (error) throw toSupabaseError(error);

  return data;
}

export interface AuthUser {
  id: string;
  email?: string | null;
  [key: string]: unknown;
}

export async function getUser(accessToken: string): Promise<AuthUser | null> {
  if (!accessToken) return null;
  // Supabase Auth is asked to validate the token — the JWT subject is never
  // trusted locally (docs/cli-contract.md §1.4).
  const { data, error } = await publicAuthClient().auth.getUser(accessToken);

  if (error) {
    const status = (error as AuthError).status;

    if (status === 401 || status === 403) return null;
    throw new SupabaseError("Supabase Auth is unavailable", 502, error);
  }
  const user = data?.user;

  return user && typeof user.id === "string"
    ? (user as unknown as AuthUser)
    : null;
}

export function assertConfigured(): true {
  supabaseUrl();
  secretKey();

  return true;
}

// Test hook: drop the cached clients so a test can swap environment variables
// (new vs legacy key names) and rebuild them.
export function __resetClientsForTests(): void {
  cachedAdmin = null;
  cachedPublic = null;
}
