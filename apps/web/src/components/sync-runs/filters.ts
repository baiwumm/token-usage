// Filter contract for /sync-runs (docs/cli-contract.md §2.12): device, trigger,
// result, paging and an explicit custom window live in the URL; preset ranges
// never do.

import type { RangeKey } from "@/lib/dashboard/ranges";

import { isValidDayKey } from "@/lib/dashboard/ranges";
import { PAGE_SIZE_OPTIONS } from "@/lib/ui/pagination";

export const DEFAULT_PAGE_SIZE = 20;

export const TRIGGER_OPTIONS = [
  "scheduled",
  "manual",
  "watch",
  "notify",
] as const;
export const RESULT_OPTIONS = ["ok", "partial", "error"] as const;

export interface Filters {
  range: RangeKey;
  from: string;
  to: string;
  deviceId: string;
  trigger: string;
  result: string;
  offset: number;
  pageSize: number;
}

// Preset ranges never round-trip the URL (operator call 2026-10-26): a stale
// ?range=30d link must not pin the list to old dates, so every load starts at
// the default preset window (总计 since 2026-11-12). A custom window only
// survives in old date-picker bookmarks and must persist — parseFilters
// already restores it, and dropping it here silently reverted the list to the
// default window on the next navigation.
export function parseFilters(params: {
  get(name: string): string | null;
}): Filters {
  const rawOffset = Number(params.get("offset"));
  const rawPageSize = Number(params.get("page_size"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const hasWindow = isValidDayKey(from) && isValidDayKey(to) && from <= to;

  return {
    range: hasWindow ? "custom" : "all",
    from: hasWindow ? from : "",
    to: hasWindow ? to : "",
    deviceId: params.get("device_id") ?? "",
    trigger: params.get("trigger") ?? "",
    result: params.get("result") ?? "",
    offset:
      Number.isFinite(rawOffset) && rawOffset > 0 ? Math.trunc(rawOffset) : 0,
    pageSize: (PAGE_SIZE_OPTIONS as readonly number[]).includes(rawPageSize)
      ? rawPageSize
      : DEFAULT_PAGE_SIZE,
  };
}

export function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (
    filters.range === "custom" &&
    isValidDayKey(filters.from) &&
    isValidDayKey(filters.to) &&
    filters.from <= filters.to
  ) {
    query.set("from", filters.from);
    query.set("to", filters.to);
  }
  if (filters.deviceId) query.set("device_id", filters.deviceId);
  if (filters.trigger) query.set("trigger", filters.trigger);
  if (filters.result) query.set("result", filters.result);
  if (filters.offset > 0) query.set("offset", String(filters.offset));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    query.set("page_size", String(filters.pageSize));
  }

  return query.toString();
}

// Any filter change restarts paging unless the patch is the page itself.
export function mergeSyncRunFilters(
  previous: Filters,
  patch: Partial<Filters>,
): Filters {
  const next = { ...previous, ...patch };

  if (!("offset" in patch)) next.offset = 0;

  return next;
}
