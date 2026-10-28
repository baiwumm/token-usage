// Filter contract for /sync-runs (docs/cli-contract.md §2.12): device, trigger,
// result and paging live in the URL; the time range stays session-only.

import { isValidDayKey } from "@/lib/dashboard/ranges";
import { PAGE_SIZE_OPTIONS } from "@/lib/ui/pagination";

export const DEFAULT_PAGE_SIZE = 20;

export const SYNC_RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;

export type SyncRunRange = (typeof SYNC_RANGE_PRESETS)[number] | "custom";

export const TRIGGER_OPTIONS = [
  "scheduled",
  "manual",
  "watch",
  "notify",
] as const;
export const RESULT_OPTIONS = ["ok", "partial", "error"] as const;

export interface Filters {
  range: SyncRunRange;
  from: string;
  to: string;
  deviceId: string;
  trigger: string;
  result: string;
  offset: number;
  pageSize: number;
}

// Range filters never round-trip the URL (operator call 2026-10-26, same as
// sessions): a stale ?range=…&from=… link must not pin the list to old dates,
// so only device/trigger/result/paging persist and every load starts at the
// default window.
export function parseFilters(params: {
  get(name: string): string | null;
}): Filters {
  const rawOffset = Number(params.get("offset"));
  const rawPageSize = Number(params.get("page_size"));
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const hasWindow = isValidDayKey(from) && isValidDayKey(to) && from <= to;

  return {
    range: hasWindow ? "custom" : "30d",
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
