"use client";

// Dashboard data cache behind the data-version gate (2026-11-01 operator
// plan). The seven heavy contract fetches are skipped whenever GET
// /api/app/data-version reports the same change signal as the cached load —
// the created_at of the latest non-empty sync run (server clock). Payloads
// are keyed by filter set (range/tz/device) and per signed-in user (JWT sub —
// never the token itself), stored in an in-memory map mirrored to
// sessionStorage so a reload (the exact case the gate exists for) still hits.
//
// Every failure fails open: an unavailable storage, a quota overflow or an
// unreadable entry simply means "no cache" and the caller fetches normally.

import type { Filters } from "./filters";
import type { AchievementsPayload } from "@/lib/achievements/types";
import type {
  AccountSummary,
  DashboardPayload,
  HeatmapPayload,
  ModelBreakdownSource,
  MonthlyPoint,
  SeriesPoint,
} from "@/lib/dashboard/api";

export interface DashboardPayloads {
  summary: AccountSummary;
  dashboard: DashboardPayload;
  daily: SeriesPoint[];
  monthly: MonthlyPoint[];
  heatmap: HeatmapPayload;
  breakdown: ModelBreakdownSource[];
  achievements: AchievementsPayload;
}

interface StoredEntry {
  version: string;
  savedAt: number;
  payloads: DashboardPayloads;
}

type CacheStore = Record<string, Record<string, StoredEntry>>;

const STORAGE_KEY = "token-usage.dashboard-cache";
/** Keep well under the ~5 MB per-origin sessionStorage quota. */
const MAX_PERSIST_BYTES = 3 * 1024 * 1024;
/** Filter sets kept per user; the oldest savedAt is evicted beyond this. */
const MAX_ENTRIES_PER_USER = 4;

const memory = new Map<string, Map<string, StoredEntry>>();

function safeSessionStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;

    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Cache key for one filter set; any part changing means a different cache. */
export function dashboardFilterCacheKey(
  filters: Filters,
  timezone: string,
): string {
  return [
    filters.range,
    filters.from,
    filters.to,
    timezone,
    filters.deviceId,
  ].join("|");
}

/**
 * Per-user cache namespace from the session's access token: the JWT `sub`
 * claim (the auth user id). The raw token is never stored; when the token is
 * not a decodable JWT a cheap non-crypto hash stands in so two accounts in
 * one tab still get separate namespaces.
 */
export function dashboardUserCacheKey(token: string): string {
  try {
    const segment = token.split(".")[1];

    if (segment) {
      const base64 = segment.replace(/-/g, "+").replace(/_/g, "/");
      const json = JSON.parse(atob(base64)) as { sub?: unknown };

      if (typeof json.sub === "string" && json.sub) return json.sub;
    }
  } catch {
    // fall through to the hash
  }

  let hash = 5381;

  for (let index = 0; index < token.length; index += 1) {
    hash = ((hash << 5) + hash + token.charCodeAt(index)) | 0;
  }

  return `t${hash.toString(36)}`;
}

function readStore(store: Storage | null): CacheStore {
  if (store == null) return {};

  try {
    const raw = store.getItem(STORAGE_KEY);

    if (!raw) return {};

    return JSON.parse(raw) as CacheStore;
  } catch {
    return {};
  }
}

function writeStore(store: Storage, value: CacheStore): void {
  try {
    const raw = JSON.stringify(value);

    // Too big to persist (heavy accounts): keep the memory copy only.
    if (raw.length <= MAX_PERSIST_BYTES) store.setItem(STORAGE_KEY, raw);
  } catch {
    // Quota or privacy-mode failures just mean no persistence.
  }
}

function userMap(userKey: string): Map<string, StoredEntry> {
  let map = memory.get(userKey);

  if (!map) {
    map = new Map();
    memory.set(userKey, map);
  }

  return map;
}

/**
 * Cached payloads for (user, filter set) — but only when the stored load saw
 * exactly `version` as its change signal; anything else reads as a miss.
 */
export function readDashboardCache(
  userKey: string,
  filterKey: string,
  version: string,
  store: Storage | null = safeSessionStorage(),
): DashboardPayloads | null {
  const memoryHit = userMap(userKey).get(filterKey);

  if (memoryHit) {
    return memoryHit.version === version ? memoryHit.payloads : null;
  }

  const persisted = readStore(store)[userKey]?.[filterKey];

  if (!persisted) return null;

  userMap(userKey).set(filterKey, persisted);

  return persisted.version === version ? persisted.payloads : null;
}

/** Store a finished load; memory always, sessionStorage best-effort. */
export function writeDashboardCache(
  userKey: string,
  filterKey: string,
  version: string,
  payloads: DashboardPayloads,
  store: Storage | null = safeSessionStorage(),
): void {
  const entry: StoredEntry = {
    version,
    savedAt: Date.now(),
    payloads,
  };

  const map = userMap(userKey);

  map.delete(filterKey); // re-insert below so Map order tracks recency
  map.set(filterKey, entry);

  while (map.size > MAX_ENTRIES_PER_USER) {
    const oldest = map.keys().next().value;

    if (oldest == null) break;
    map.delete(oldest);
  }

  if (store == null) return;

  const persisted = readStore(store);

  // The in-memory map is the source of truth (evictions included); the
  // persisted copy is rebuilt from it so evicted entries cannot resurface
  // from an older snapshot.
  writeStore(store, {
    ...persisted,
    [userKey]: Object.fromEntries(map),
  });
}
