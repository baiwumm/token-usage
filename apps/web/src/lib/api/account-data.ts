// Server-side account usage loader — ports the I/O half of
// api/_lib/account-usage.js against the token_* tables.

import type { UsageRow } from "@/lib/account/series";

import { select, SupabaseError, type RestRow } from "./supabase-rest";

import { canonicalizeUsage } from "@/lib/account/usage";

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const MAX_ROWS = PAGE_SIZE * MAX_PAGES;

async function selectAll(
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

type UsageCacheEntry = {
  revision: string;
  expiresAt: number;
  promise: Promise<AccountUsage>;
};

// A global revision alone let one user's upload invalidate every other user's
// cached snapshot in the same process. Revisions are therefore per user, with
// a global component only for truly global changes (pricing/config resets).
let globalUsageRevision = 0;
const userUsageRevisions = new Map<string, number>();
const usageCache = new Map<string, UsageCacheEntry>();
const MAX_USAGE_CACHE_ENTRIES = 512;
const MAX_SESSION_CACHE_ENTRIES = 512;
const MAX_SYNC_RUN_CACHE_ENTRIES = 512;

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
  if (userId == null) {
    globalUsageRevision += 1;
    userUsageRevisions.clear();
    usageCache.clear();
    sessionCache.clear();
    syncRunCache.clear();

    return;
  }
  for (const key of usageCache.keys()) {
    if (key === userId) usageCache.delete(key);
  }
  for (const key of sessionCache.keys()) {
    if (key.startsWith(`${userId}|`)) sessionCache.delete(key);
  }
  for (const key of syncRunCache.keys()) {
    if (key.startsWith(`${userId}|`)) syncRunCache.delete(key);
  }
  userUsageRevisions.set(userId, (userUsageRevisions.get(userId) ?? 0) + 1);
}

async function fetchAccountUsage(userId: string): Promise<AccountUsage> {
  const [hourly, sessionStates, deviceRows, tokenRows] = await Promise.all([
    selectAll("token_usage_hourly", {
      columns:
        "device_id,hour_start,source,model,project_key,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,billable_total_tokens,conversations,total_cost_usd,credits,updated_at",
      filters: [["user_id", "eq", userId]],
      // Order by the full primary key (project_key included): omitting it made
      // offset pagination non-deterministic once a bucket had split rows.
      order:
        "hour_start.asc,device_id.asc,source.asc,model.asc,project_key.asc",
    }),
    selectAll("token_account_session_states", {
      columns:
        "source,session_id,model,bucket_start,snapshot_verified_at,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens",
      filters: [["user_id", "eq", userId]],
      order: "bucket_start.asc,source.asc,session_id.asc",
    }),
    selectAll("token_devices", {
      columns:
        "id,device_name,platform,default_device_name,revoked_at,created_at,updated_at",
      filters: [["user_id", "eq", userId]],
      order: "created_at.asc,id.asc",
    }),
    selectAll("token_device_tokens", {
      columns: "device_id,last_used_at,created_at,revoked_at",
      filters: [["user_id", "eq", userId]],
      // No stable order meant offset paging could repeat/skip rows.
      order: "device_id.asc,token_hash.asc",
    }),
  ]);

  const activeDeviceIds = new Set(
    deviceRows
      .filter((device) => !device.revoked_at)
      .map((device) => String(device.id)),
  );

  return {
    hourly,
    sessionStates,
    deviceRows,
    tokenRows,
    activeDeviceIds,
    canonicalRows: canonicalizeUsage(hourly, sessionStates, activeDeviceIds),
  };
}

// The cached instance is shared across concurrent requests — callers are
// read-only over it (aggregations build their own buckets, filters copy).
export function loadAccountUsage(userId: string): Promise<AccountUsage> {
  if (usageCacheDisabled()) return fetchAccountUsage(userId);

  const now = Date.now();
  const revision = revisionFor(userId);
  const hit = usageCache.get(userId);

  if (hit && hit.revision === revision && hit.expiresAt > now) {
    return hit.promise;
  }
  const promise = fetchAccountUsage(userId);

  // A failed load must not pin its rejection for the TTL window.
  promise.catch(() => {
    const entry = usageCache.get(userId);

    if (entry?.promise === promise) usageCache.delete(userId);
  });
  usageCache.set(userId, {
    revision,
    expiresAt: now + USAGE_TTL_MS,
    promise,
  });
  pruneCache(usageCache, now, MAX_USAGE_CACHE_ENTRIES);

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
