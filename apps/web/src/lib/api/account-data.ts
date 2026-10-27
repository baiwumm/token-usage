// Server-side account usage loader — ports the I/O half of
// api/_lib/account-usage.js against the token_* tables.

import type { UsageRow } from "@/lib/account/series";

import { select, type RestRow } from "./supabase-rest";

import { canonicalizeUsage } from "@/lib/account/usage";

const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;

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
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
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
  revision: number;
  expiresAt: number;
  promise: Promise<AccountUsage>;
};

let usageRevision = 0;
const usageCache = new Map<string, UsageCacheEntry>();

function usageCacheDisabled(): boolean {
  return process.env.TOKEN_USAGE_USAGE_CACHE === "off";
}

export function invalidateAccountUsage(userId?: string): void {
  // One revision bump invalidates both caches (sessions share it).
  usageRevision += 1;
  if (userId == null) {
    usageCache.clear();
    sessionCache.clear();
  } else {
    usageCache.delete(userId);
    for (const key of sessionCache.keys()) {
      if (key.startsWith(`${userId}|`)) sessionCache.delete(key);
    }
  }
}

async function fetchAccountUsage(userId: string): Promise<AccountUsage> {
  const [hourly, sessionStates, deviceRows, tokenRows] = await Promise.all([
    selectAll("token_usage_hourly", {
      columns:
        "device_id,hour_start,source,model,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,billable_total_tokens,conversations,total_cost_usd,updated_at",
      filters: [["user_id", "eq", userId]],
      order: "hour_start.asc,device_id.asc,source.asc,model.asc",
    }),
    selectAll("token_account_session_states", {
      columns:
        "source,session_id,model,bucket_start,snapshot_verified_at,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens",
      filters: [["user_id", "eq", userId]],
      order: "bucket_start.asc,source.asc,session_id.asc",
    }),
    selectAll("token_devices", {
      columns: "id,device_name,platform,revoked_at,created_at,updated_at",
      filters: [["user_id", "eq", userId]],
      order: "created_at.asc",
    }),
    selectAll("token_device_tokens", {
      columns: "device_id,last_used_at,created_at,revoked_at",
      filters: [["user_id", "eq", userId]],
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
  const hit = usageCache.get(userId);

  if (hit && hit.revision === usageRevision && hit.expiresAt > now) {
    return hit.promise;
  }
  const promise = fetchAccountUsage(userId);

  // A failed load must not pin its rejection for the TTL window.
  promise.catch(() => {
    const entry = usageCache.get(userId);

    if (entry?.promise === promise) usageCache.delete(userId);
  });
  usageCache.set(userId, {
    revision: usageRevision,
    expiresAt: now + USAGE_TTL_MS,
    promise,
  });

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
  revision: number;
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
          "device_id,source,session_id,project_key,started_at,ended_at,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,billable_total_tokens,models",
        filters: [
          ["user_id", "eq", userId],
          ["ended_at", "gte", fromIso],
          ["ended_at", "lt", toIso],
        ],
        order: "ended_at.desc,source.asc,session_id.asc",
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
  const hit = sessionCache.get(cacheKey);

  if (hit && hit.revision === usageRevision && hit.expiresAt > now) {
    return hit.promise;
  }
  const promise = fetchRows();

  // A failed load must not pin its rejection for the TTL window.
  promise.catch(() => {
    const entry = sessionCache.get(cacheKey);

    if (entry?.promise === promise) sessionCache.delete(cacheKey);
  });
  sessionCache.set(cacheKey, {
    revision: usageRevision,
    expiresAt: now + SESSION_TTL_MS,
    promise,
  });

  return promise;
}
