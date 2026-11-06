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

// Minimal structural view of the postgrest-js builders this module uses.
// postgrest's own generic builder types are pathological under tsc (TS2589 on
// instantiation with the concrete schema generics), so the helpers work against
// this small fluent interface instead of the concrete builder type. Method
// syntax keeps parameter bivariance; runtime behavior is unchanged.
interface FilterChainable {
  eq(column: string, value: unknown): FilterChainable;
  neq(column: string, value: unknown): FilterChainable;
  gt(column: string, value: unknown): FilterChainable;
  gte(column: string, value: unknown): FilterChainable;
  lt(column: string, value: unknown): FilterChainable;
  is(column: string, value: unknown): FilterChainable;
  order(column: string, options: { ascending?: boolean }): FilterChainable;
}

function applyFilters<C extends FilterChainable>(
  query: C,
  filters: Filter[],
): C {
  let result = query;

  for (const [column, operator, value] of filters) {
    // postgrest builders return `this` at runtime, so the C casts are sound.
    switch (operator) {
      case "eq":
        result = result.eq(column, value) as C;
        break;
      case "neq":
        result = result.neq(column, value) as C;
        break;
      case "gt":
        result = result.gt(column, value) as C;
        break;
      case "gte":
        result = result.gte(column, value) as C;
        break;
      case "lt":
        result = result.lt(column, value) as C;
        break;
      case "is":
        result = result.is(column, value === "null" ? null : value) as C;
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

function applyOrder<C extends FilterChainable>(
  query: C,
  order: string | null,
): C {
  if (!order) return query;
  let result = query;

  for (const part of order.split(",")) {
    const [column, direction] = part.split(".");

    result = result.order(column, { ascending: direction !== "desc" }) as C;
  }

  return result;
}

// The select chain beyond filtering/ordering: limit/range plus awaitability.
// Used only at module boundaries via a bounded cast — postgrest's concrete
// generics explode tsc (TS2589) if threaded through the helpers.
interface SelectChain extends FilterChainable {
  limit(count: number): SelectChain;
  range(from: number, to: number): SelectChain;
  then: AwaitableQuery["then"];
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
    applyFilters(
      adminClient().from(table).select(columns) as unknown as SelectChain,
      filters,
    ),
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

  return Array.isArray(data) ? (data as unknown as RestRow[]) : [];
}

// Await a builder whose `.select()` chaining differs by `returning`; the two
// chains have incompatible generic shapes, so the branch happens before await.
type AwaitableQuery = PromiseLike<{
  data: unknown;
  error: PostgrestError | null;
}>;

async function runQuery(
  pending: AwaitableQuery,
  returning: boolean,
): Promise<RestRow[]> {
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

  // Bounded boundary casts (see SelectChain note): the filtered chain is the
  // postgrest update builder, which is awaitable and regains .select().
  return runQuery(
    returning
      ? (builder as unknown as { select(): AwaitableQuery }).select()
      : (builder as unknown as AwaitableQuery),
    returning,
  );
}

export async function rpc(name: string, args: RestRow = {}): Promise<unknown> {
  const { data, error } = await adminClient().rpc(name, args);

  if (error) throw toSupabaseError(error);

  return data;
}

/** DELETE rows matching every filter; an unfiltered delete is refused. */
export async function remove(table: string, filters: Filter[]): Promise<void> {
  if (filters.length === 0) {
    throw new SupabaseError("Refusing an unfiltered delete", 500);
  }
  const builder = applyFilters(adminClient().from(table).delete(), filters);

  await runQuery(builder as unknown as AwaitableQuery, false);
}

// ---------------------------------------------------------------------------
// Storage (service-role). The browser never writes storage for server-owned
// objects; it only loads the public URLs built here.
// ---------------------------------------------------------------------------

/** Public URL of an object in a public bucket. */
export function storagePublicUrl(bucket: string, path: string): string {
  return `${supabaseUrl()}/storage/v1/object/public/${bucket}/${path}`;
}

/** Whether the bucket exists (optional buckets are deployment choices). */
export async function storageBucketExists(bucket: string): Promise<boolean> {
  const { data, error } = await adminClient().storage.getBucket(bucket);

  return !error && Boolean(data);
}

export async function storageUpload(
  bucket: string,
  path: string,
  body: Uint8Array,
  contentType: string,
): Promise<void> {
  const { error } = await adminClient()
    .storage.from(bucket)
    .upload(path, body, {
      contentType,
      // Object names are unique per upload, so the bytes never change.
      cacheControl: "31536000",
      upsert: false,
    });

  if (error) throw new SupabaseError(error.message, 500, error);
}

export async function storageRemove(
  bucket: string,
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return;
  const { error } = await adminClient().storage.from(bucket).remove(paths);

  if (error) throw new SupabaseError(error.message, 500, error);
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
