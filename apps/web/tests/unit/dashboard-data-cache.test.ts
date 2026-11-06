// Unit tests for the dashboard data cache behind the version gate
// (dashboard-data-cache.ts): version-scoped hits, per-user namespaces,
// filter-key scoping, persistence pruning and fail-open behaviour.

import { describe, expect, it } from "vitest";

import {
  dashboardFilterCacheKey,
  dashboardUserCacheKey,
  readDashboardCache,
  writeDashboardCache,
  type DashboardPayloads,
} from "@/components/dashboard/dashboard-data-cache";

/** Map-backed Storage stand-in with optional quota-failure simulation. */
class FakeStorage implements Storage {
  private map = new Map<string, string>();
  failWrites = false;

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.failWrites) throw new DOMException("quota", "QuotaExceededError");
    this.map.set(key, value);
  }
}

const USER = "11111111-1111-1111-1111-111111111111";
const FILTER = "all||Asia/Shanghai|";
const VERSION = "2026-10-31T12:00:00.000Z";

function payloads(): DashboardPayloads {
  return {
    summary: { from: "2026-10-01", to: "2026-10-31", days: 31 } as never,
    dashboard: { generated_at: VERSION } as never,
    daily: [],
    monthly: [],
    heatmap: { cells: [] } as never,
    breakdown: [],
    achievements: { achievements: [] } as never,
  };
}

describe("dashboardUserCacheKey", () => {
  it("uses the JWT sub claim", () => {
    const token = `header.${btoa(JSON.stringify({ sub: USER }))}.signature`;

    expect(dashboardUserCacheKey(token)).toBe(USER);
  });

  it("falls back to a token-derived hash for non-JWT tokens", () => {
    const key = dashboardUserCacheKey("not-a-jwt");

    expect(key).not.toBe("not-a-jwt");
    expect(key).toBe(dashboardUserCacheKey("not-a-jwt"));
    expect(key).not.toBe(dashboardUserCacheKey("another-token"));
  });
});

describe("dashboardFilterCacheKey", () => {
  it("covers range, custom window, timezone and device", () => {
    expect(
      dashboardFilterCacheKey(
        { range: "custom", from: "2026-10-01", to: "2026-10-31", deviceId: "d1" },
        "UTC",
      ),
    ).toBe("custom|2026-10-01|2026-10-31|UTC|d1");
  });
});

describe("read/write roundtrip", () => {
  it("returns the payloads only for the exact version and filter key", () => {
    const store = new FakeStorage();
    const data = payloads();

    writeDashboardCache(USER, FILTER, VERSION, data, store);

    expect(readDashboardCache(USER, FILTER, VERSION, store)).toEqual(data);
    expect(readDashboardCache(USER, FILTER, "older-version", store)).toBeNull();
    expect(readDashboardCache(USER, "30d||UTC|", VERSION, store)).toBeNull();
    expect(
      readDashboardCache("22222222-2222-2222-2222-222222222222", FILTER, VERSION, store),
    ).toBeNull();
  });

  it("keeps the memory copy even when persistence fails (fail-open)", () => {
    const store = new FakeStorage();
    const data = payloads();

    store.failWrites = true;
    writeDashboardCache(USER, FILTER, VERSION, data, store);

    expect(readDashboardCache(USER, FILTER, VERSION, store)).toEqual(data);
  });

  it("reads persisted state when memory is empty (reload case)", () => {
    const store = new FakeStorage();
    // Hand-persist an entry for a user this module instance never touched —
    // exactly what a page reload looks like to the in-memory map.
    const reloadedUser = "33333333-3333-3333-3333-333333333333";

    store.setItem(
      "token-usage.dashboard-cache",
      JSON.stringify({
        [reloadedUser]: {
          [FILTER]: { version: VERSION, savedAt: 1, payloads: payloads() },
        },
      }),
    );

    expect(
      readDashboardCache(reloadedUser, FILTER, VERSION, store)?.dashboard
        .generated_at,
    ).toBe(VERSION);
  });

  it("evicts the oldest entry beyond four filter sets per user", () => {
    const store = new FakeStorage();
    const data = payloads();
    const keys = ["k1", "k2", "k3", "k4", "k5"];

    for (const key of keys) {
      writeDashboardCache(USER, key, VERSION, data, store);
    }

    expect(readDashboardCache(USER, "k1", VERSION, store)).toBeNull();
    for (const key of ["k2", "k3", "k4", "k5"]) {
      expect(readDashboardCache(USER, key, VERSION, store)).toEqual(data);
    }
  });

  it("treats unreadable persisted state as a cache miss", () => {
    const store = new FakeStorage();

    store.setItem("token-usage.dashboard-cache", "{not json");

    expect(readDashboardCache(USER, FILTER, VERSION, store)).toBeNull();
  });
});
