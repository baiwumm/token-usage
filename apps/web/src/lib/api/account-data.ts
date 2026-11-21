// Server-side account usage loader — ports the I/O half of
// api/_lib/account-usage.js against the token_* tables.

import type { UsageRow } from "@/lib/account/series";

import { select, SupabaseError, type RestRow } from "./supabase-rest";

import { canonicalizeUsage } from "@/lib/account/usage";
import { ensurePricingLoaded } from "@/lib/pricing";

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const MAX_ROWS = PAGE_SIZE * MAX_PAGES;

export async function selectAll(
  table: string,
  {
    columns = "*",
    filters = [],
    order = null,
  }: {
    columns?: string;
    filters?: Array<[string, string, unknown]>;
    order?: string | null;
  } = {},
): Promise<RestRow[]> {
  const rows: RestRow[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const batch = await select(table, {
      select: columns,
      filters,
      order,
      limit: PAGE_SIZE,
      offset,
    });

    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
    offset += batch.length;
  }

  // Hitting the page cap used to return a silently truncated snapshot, which
  // made every dashboard/series/achievement number consistently wrong with no
  // 5xx or log. Probe one row past the cap and refuse to serve a partial
  // account dataset: a visible failure is recoverable, a quiet undercount is
  // not.
  const overflow = await select(table, {
    select: "*",
    filters,
    order,
    limit: 1,
    offset: rows.length,
  });

  if (overflow.length > 0) {
    throw new SupabaseError(
      `Account dataset for ${table} exceeds ${MAX_ROWS} rows; refusing to serve a truncated snapshot`,
      500,
    );
  }

  return rows;
}

export type AccountUsage = {
  hourly: UsageRow[];
  sessionStates: UsageRow[];
  deviceRows: UsageRow[];
  tokenRows: UsageRow[];
  activeDeviceIds: Set<string>;
  canonicalRows: UsageRow[];
};

// One dashboard refresh fires six series endpoints concurrently and each of
// them loads the same account snapshot; without sharing, that is six copies
// of the full four-table pull. Loads are single-flighted per user and held
// for a short TTL. Writes through this codebase (ingest, device revoke /
// rename / pairing) bump the revision so the next load refetches inside the
// window; the TTL only bounds staleness from out-of-band DB edits. Tests
// reseed a fake backend between cases, so they opt out via
// TOKEN_USAGE_USAGE_CACHE=off (tests/contract/helpers.ts initContractEnv).
const USAGE_TTL_MS = 10_000;

// Incremental watermark (2026-11-15): the two big tables are append-only
// last-wins baselines whose rows are never deleted, so a warm process keeps
// the full row set in memory and each TTL window only pulls rows whose
// updated_at moved past the watermark (upsert-merged by primary key). The
// two small tables (devices / device tokens) are re-read whole every refresh
// — they carry no updated_at column worth watermarking (device tokens) and
// their row counts are per-device, not per-hour. All write paths call
// invalidateAccountUsage, which marks the snapshot dirty: the next load runs
// an immediate incremental refresh, so the watermark never masks a write.
// Overlap window: the probe reads from watermark − 1 s so a row written with
// the same clock second as the watermark (concurrent ingest) cannot slip
// between two polls; merging is an idempotent upsert, so re-seen rows are
// free. In-memory maps are per process — a cold serverless instance pays one
// full pull exactly like before, and multi-instance staleness is bounded by
// the same TTL as the old scheme (the data-version gate revalidates it).
const USAGE_OVERLAP_MS = 1_000;

function hourlyKey(row: RestRow): string {
  // Primary key of token_usage_hourly (v2): user_id is implicit (one
  // snapshot per user), project_key '' = unattributed.
  return `${row.device_id}|${row.hour_start}|${row.source}|${row.model}|${row.project_key ?? ""}`;
}

function statesKey(row: RestRow): string {
  // Primary key of token_account_session_states.
  return `${row.source}|${row.session_id}`;
}

/** Later of two ISO timestamps (defensive: numeric compare, not lexical). */
function maxIso(a: string | null, b: string | null): string | null {
  if (a == null) return b;
  if (b == null) return a;
  const aMs = Date.parse(a);
  const bMs = Date.parse(b);

  if (!Number.isFinite(aMs)) return b;
  if (!Number.isFinite(bMs)) return a;

  return bMs > aMs ? b : a;
}

function maxUpdatedAt(rows: RestRow[], previous: string | null): string | null {
  let latest = previous;

  for (const row of rows) {
    const value = row.updated_at;

    if (typeof value === "string" && value) latest = maxIso(latest, value);
  }

  return latest;
}

type LiveSnapshot = {
  /** PK → row for token_usage_hourly (append-only; upsert-merged). */
  hourlyMap: Map<string, RestRow>;
  /** PK → row for token_account_session_states. */
  statesMap: Map<string, RestRow>;
  /** Whole-table reads refreshed on every load (small, no usable watermark). */
  deviceRows: RestRow[];
  tokenRows: RestRow[];
  /** Max updated_at per big table; null until the first full pull. */
  hourlyWatermark: string | null;
  statesWatermark: string | null;
  /** Set by invalidateAccountUsage: the next load must refresh immediately. */
  dirty: boolean;
  expiresAt: number;
  promise: Promise<AccountUsage>;
};

// Per-user revision counters (global component for pricing/config resets)
// still gate the session / sync-run window caches below; the usage snapshot
// itself switched to the dirty-flag + watermark scheme above.
let globalUsageRevision = 0;
const userUsageRevisions = new Map<string, number>();

function revisionFor(userId: string): string {
  return `${globalUsageRevision}:${userUsageRevisions.get(userId) ?? 0}`;
}

// Expired entries used to stay in the Map forever, so every custom session
// range leaked its full row array for the life of the process. Sweep expired
// keys and bound the entry count (Map preserves insertion order, so the first
// keys are the oldest).
function pruneCache<T extends { expiresAt: number }>(
  cache: Map<string, T>,
  now: number,
  maxEntries: number,
): void {
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size > maxEntries) {
    const oldest = cache.keys().next().value;

    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function usageCacheDisabled(): boolean {
  return process.env.TOKEN_USAGE_USAGE_CACHE === "off";
}

export function invalidateAccountUsage(userId?: string): void {
  globalUsageRevision += 1;
  if (userId == null) {
    userUsageRevisions.clear();
    sessionCache.clear();
    syncRunCache.clear();
    for (const live of liveSnapshots.values()) live.dirty = true;

    return;
  }
  for (const key of sessionCache.keys()) {
    if (key.startsWith(`${userId}|`)) sessionCache.delete(key);
  }
  for (const key of syncRunCache.keys()) {
    if (key.startsWith(`${userId}|`)) syncRunCache.delete(key);
  }
  const live = liveSnapshots.get(userId);

  if (live) live.dirty = true;
  userUsageRevisions.set(userId, (userUsageRevisions.get(userId) ?? 0) + 1);
}

const HOURLY_COLUMNS =
  "device_id,hour_start,source,model,project_key,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,billable_total_tokens,conversations,total_cost_usd,credits,updated_at";
const STATES_COLUMNS =
  "source,session_id,model,bucket_start,snapshot_verified_at,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,updated_at";
const DEVICE_COLUMNS =
  "id,device_name,platform,default_device_name,revoked_at,created_at,updated_at";
const TOKEN_COLUMNS = "device_id,last_used_at,created_at,revoked_at";

async function fetchFullTables(userId: string): Promise<{
  hourlyRows: RestRow[];
  statesRows: RestRow[];
  deviceRows: RestRow[];
  tokenRows: RestRow[];
}> {
  const [hourlyRows, statesRows, deviceRows, tokenRows] = await Promise.all([
    selectAll("token_usage_hourly", {
      columns: HOURLY_COLUMNS,
      filters: [["user_id", "eq", userId]],
      // Order by the full primary key (project_key included): omitting it made
      // offset pagination non-deterministic once a bucket had split rows.
      order:
        "hour_start.asc,device_id.asc,source.asc,model.asc,project_key.asc",
    }),
    selectAll("token_account_session_states", {
      columns: STATES_COLUMNS,
      filters: [["user_id", "eq", userId]],
      order: "bucket_start.asc,source.asc,session_id.asc",
    }),
    selectAll("token_devices", {
      columns: DEVICE_COLUMNS,
      filters: [["user_id", "eq", userId]],
      order: "created_at.asc,id.asc",
    }),
    selectAll("token_device_tokens", {
      columns: TOKEN_COLUMNS,
      filters: [["user_id", "eq", userId]],
      // No stable order meant offset paging could repeat/skip rows.
      order: "device_id.asc,token_hash.asc",
    }),
  ]);

  return { hourlyRows, statesRows, deviceRows, tokenRows };
}

/** Upsert-merge fetched big-table rows into the live maps, advancing marks. */
function mergeRows(
  live: LiveSnapshot,
  hourlyRows: RestRow[],
  statesRows: RestRow[],
): void {
  for (const row of hourlyRows) live.hourlyMap.set(hourlyKey(row), row);
  for (const row of statesRows) live.statesMap.set(statesKey(row), row);
  live.hourlyWatermark = maxUpdatedAt(hourlyRows, live.hourlyWatermark);
  live.statesWatermark = maxUpdatedAt(statesRows, live.statesWatermark);
}

function composeUsage(live: LiveSnapshot): AccountUsage {
  const hourly = [...live.hourlyMap.values()];
  const sessionStates = [...live.statesMap.values()];
  const activeDeviceIds = new Set(
    live.deviceRows
      .filter((device) => !device.revoked_at)
      .map((device) => String(device.id)),
  );

  return {
    hourly,
    sessionStates,
    deviceRows: live.deviceRows,
    tokenRows: live.tokenRows,
    activeDeviceIds,
    canonicalRows: canonicalizeUsage(hourly, sessionStates, activeDeviceIds),
  };
}

async function refreshLive(
  userId: string,
  live: LiveSnapshot,
): Promise<AccountUsage> {
  // The two small tables re-read whole; the big tables probe past their
  // watermarks (with a 1 s overlap so same-second concurrent writes cannot
  // slip between polls — merging is an idempotent upsert). A cold snapshot
  // (no watermark) falls back to the full table reads. selectAll everywhere:
  // incremental result sets are tiny in practice, but the cap protection must
  // stay honest on the first pull.
  const hourlyProbe = live.hourlyWatermark
    ? new Date(Date.parse(live.hourlyWatermark) - USAGE_OVERLAP_MS)
    : null;
  const statesProbe = live.statesWatermark
    ? new Date(Date.parse(live.statesWatermark) - USAGE_OVERLAP_MS)
    : null;
  const [hourlyRows, statesRows, smallTables] = await Promise.all([
    selectAll("token_usage_hourly", {
      columns: HOURLY_COLUMNS,
      filters: hourlyProbe
        ? [
            ["user_id", "eq", userId],
            ["updated_at", "gte", hourlyProbe.toISOString()],
          ]
        : [["user_id", "eq", userId]],
      order: hourlyProbe
        ? "updated_at.asc"
        : "hour_start.asc,device_id.asc,source.asc,model.asc,project_key.asc",
    }),
    selectAll("token_account_session_states", {
      columns: STATES_COLUMNS,
      filters: statesProbe
        ? [
            ["user_id", "eq", userId],
            ["updated_at", "gte", statesProbe.toISOString()],
          ]
        : [["user_id", "eq", userId]],
      order: statesProbe
        ? "updated_at.asc"
        : "bucket_start.asc,source.asc,session_id.asc",
    }),
    (async () => {
      const [deviceRows, tokenRows] = await Promise.all([
        selectAll("token_devices", {
          columns: DEVICE_COLUMNS,
          filters: [["user_id", "eq", userId]],
          order: "created_at.asc,id.asc",
        }),
        selectAll("token_device_tokens", {
          columns: TOKEN_COLUMNS,
          filters: [["user_id", "eq", userId]],
          order: "device_id.asc,token_hash.asc",
        }),
      ]);

      return { deviceRows, tokenRows };
    })(),
  ]);

  mergeRows(live, hourlyRows, statesRows);
  live.deviceRows = smallTables.deviceRows;
  live.tokenRows = smallTables.tokenRows;

  return composeUsage(live);
}

function newLiveSnapshot(): LiveSnapshot {
  return {
    hourlyMap: new Map(),
    statesMap: new Map(),
    deviceRows: [],
    tokenRows: [],
    hourlyWatermark: null,
    statesWatermark: null,
    dirty: false,
    expiresAt: 0,
    // Placeholder: needsRefresh is true on the first load, so this is always
    // replaced before any caller can see it (no unhandled rejection either).
    promise: Promise.resolve({} as AccountUsage),
  };
}

function loadAccountUsageUncached(userId: string): Promise<AccountUsage> {
  // Cache disabled (tests reseeding the fake backend): every load is a whole
  // pull straight into a throwaway result, exactly the old shape.
  return (async () => {
    const { hourlyRows, statesRows, deviceRows, tokenRows } =
      await fetchFullTables(userId);
    const activeDeviceIds = new Set(
      deviceRows
        .filter((device) => !device.revoked_at)
        .map((device) => String(device.id)),
    );

    return {
      hourly: hourlyRows,
      sessionStates: statesRows,
      deviceRows,
      tokenRows,
      activeDeviceIds,
      canonicalRows: canonicalizeUsage(hourlyRows, statesRows, activeDeviceIds),
    };
  })();
}

// The cached instance is shared across concurrent requests — callers are
// read-only over it (aggregations build their own buckets, filters copy).
const MAX_USAGE_CACHE_ENTRIES = 512;
const MAX_SESSION_CACHE_ENTRIES = 512;
const MAX_SYNC_RUN_CACHE_ENTRIES = 512;

const liveSnapshots = new Map<string, LiveSnapshot>();

// Test hook: contract tests run with the cache off (reseeding the fake
// backend between cases); the incremental tests flip it on and use this to
// drop the per-user live snapshots so a reseed never inherits rows.
export function __resetLiveSnapshotsForTests(): void {
  liveSnapshots.clear();
}

export async function loadAccountUsage(userId: string): Promise<AccountUsage> {
  // Refresh the remote pricing overlay before any read-time costing (TTL-gated
  // inside; failures never block the load). Every dashboard cost path — the
  // account series, summary, dashboard — funnels through this loader, so one
  // hook covers them all (docs/cli-contract.md §2.16).
  await ensurePricingLoaded();

  if (usageCacheDisabled()) return loadAccountUsageUncached(userId);

  const now = Date.now();
  let live = liveSnapshots.get(userId);

  if (!live) {
    live = newLiveSnapshot();
    liveSnapshots.set(userId, live);
  }

  const needsRefresh = live.dirty || live.expiresAt <= now;

  if (!needsRefresh) return live.promise;

  const previousPromise = live.promise;

  // Reserve the window first: a concurrent caller must not start a second
  // refresh before this one sets the new expiry. dirty and cold snapshots
  // share one path — refreshLive probes past the watermark (a full read when
  // there is none), which covers every invalidation shape: the big tables
  // are upsert-only (no deletes) and the small ones re-read whole.
  live.expiresAt = now + USAGE_TTL_MS;
  const promise = refreshLive(userId, live).then(
    (usage) => usage,
    (error: unknown) => {
      // A failed load must not pin its rejection: drop the snapshot so the
      // next caller starts from a cold full pull (same convention as the
      // caches below).
      if (liveSnapshots.get(userId) === live) liveSnapshots.delete(userId);

      // A superseded caller keeps the previous promise it already holds.
      void previousPromise.catch(() => undefined);
      throw error;
    },
  );

  live.promise = promise;
  live.dirty = false;
  pruneCache(liveSnapshots, now, MAX_USAGE_CACHE_ENTRIES);

  return promise;
}

// Sessions are queried by absolute ended_at instants (docs/cli-contract.md
// §2.7); the device rows let the handler drop revoked machines and resolve
// display names without trusting client input. Like the account snapshot
// above, loads are single-flighted per (user, window) and held for a short
// TTL — the sessions handler refires it for facets, paging and every filter
// change, and each miss is a full window scan. Writes bump the same
// revision; tests opt out via TOKEN_USAGE_SESSION_CACHE=off.
const SESSION_TTL_MS = 10_000;

type SessionCacheEntry = {
  revision: string;
  expiresAt: number;
  promise: Promise<{ sessions: RestRow[]; devices: RestRow[] }>;
};

const sessionCache = new Map<string, SessionCacheEntry>();

function sessionCacheDisabled(): boolean {
  return process.env.TOKEN_USAGE_SESSION_CACHE === "off";
}

export function loadSessionRows(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<{ sessions: RestRow[]; devices: RestRow[] }> {
  const fetchRows = async () => {
    const [sessions, devices] = await Promise.all([
      selectAll("token_sessions", {
        columns:
          "device_id,source,session_id,project_key,started_at,ended_at,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,billable_total_tokens,credits,models",
        filters: [
          ["user_id", "eq", userId],
          ["ended_at", "gte", fromIso],
          ["ended_at", "lt", toIso],
        ],
        order: "ended_at.desc,source.asc,session_id.asc,device_id.asc",
      }),
      selectAll("token_devices", {
        columns: "id,device_name,revoked_at",
        filters: [["user_id", "eq", userId]],
      }),
    ]);

    return { sessions, devices };
  };

  if (sessionCacheDisabled()) return fetchRows();

  const now = Date.now();
  const cacheKey = `${userId}|${fromIso}|${toIso}`;
  const revision = revisionFor(userId);
  const hit = sessionCache.get(cacheKey);

  if (hit && hit.revision === revision && hit.expiresAt > now) {
    return hit.promise;
  }
  const promise = fetchRows();

  // A failed load must not pin its rejection for the TTL window.
  promise.catch(() => {
    const entry = sessionCache.get(cacheKey);

    if (entry?.promise === promise) sessionCache.delete(cacheKey);
  });
  sessionCache.set(cacheKey, {
    revision,
    expiresAt: now + SESSION_TTL_MS,
    promise,
  });
  pruneCache(sessionCache, now, MAX_SESSION_CACHE_ENTRIES);

  return promise;
}

// Sync runs are queried by absolute started_at instants (docs/cli-contract.md
// §2.12); the device rows let the handler drop revoked machines and resolve
// display names without trusting client input. Same single-flight + TTL
// pattern as the session loads above — the collector reports one run per sync
// (hourly), so a dashboard refresh plus the record page can easily refire the
// same window. Writes (sync-report, revoke) bump the shared revision; tests
// opt out via TOKEN_USAGE_SESSION_CACHE=off like the session cache.
const SYNC_RUN_TTL_MS = 10_000;

type SyncRunCacheEntry = {
  revision: string;
  expiresAt: number;
  promise: Promise<{ runs: RestRow[]; devices: RestRow[] }>;
};

const syncRunCache = new Map<string, SyncRunCacheEntry>();

export function loadSyncRunRows(
  userId: string,
  fromIso: string,
  toIso: string,
): Promise<{ runs: RestRow[]; devices: RestRow[] }> {
  const fetchRows = async () => {
    const [runs, devices] = await Promise.all([
      selectAll("token_sync_runs", {
        columns:
          "device_id,run_id,started_at,ended_at,duration_ms,trigger,result,error_code,empty,parsed_files,buckets_uploaded,tokens_ingested,credits_ingested,sessions_uploaded,sessions_skipped,queue_bytes,cli_version,os",
        filters: [
          ["user_id", "eq", userId],
          ["started_at", "gte", fromIso],
          ["started_at", "lt", toIso],
        ],
        order: "started_at.desc,run_id.asc,device_id.asc",
      }),
      selectAll("token_devices", {
        columns: "id,device_name,revoked_at",
        filters: [["user_id", "eq", userId]],
      }),
    ]);

    return { runs, devices };
  };

  if (sessionCacheDisabled()) return fetchRows();

  const now = Date.now();
  const cacheKey = `${userId}|${fromIso}|${toIso}`;
  const revision = revisionFor(userId);
  const hit = syncRunCache.get(cacheKey);

  if (hit && hit.revision === revision && hit.expiresAt > now) {
    return hit.promise;
  }
  const promise = fetchRows();

  // A failed load must not pin its rejection for the TTL window.
  promise.catch(() => {
    const entry = syncRunCache.get(cacheKey);

    if (entry?.promise === promise) syncRunCache.delete(cacheKey);
  });
  syncRunCache.set(cacheKey, {
    revision,
    expiresAt: now + SYNC_RUN_TTL_MS,
    promise,
  });
  pruneCache(syncRunCache, now, MAX_SYNC_RUN_CACHE_ENTRIES);

  return promise;
}
