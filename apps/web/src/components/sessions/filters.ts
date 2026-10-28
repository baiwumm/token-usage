// Filter contract for /sessions (docs/ui-spec.md Sessions, M5.6). Device/source
// filters, page offset and a custom time window live in the URL; preset ranges
// stay session-only.

import { isValidDayKey } from "@/lib/dashboard/ranges";
import { PAGE_SIZE_OPTIONS } from "@/lib/ui/pagination";

export const DEFAULT_PAGE_SIZE = 20;

export const SESSION_RANGE_PRESETS = ["today", "7d", "30d", "90d"] as const;

export type SessionRange = (typeof SESSION_RANGE_PRESETS)[number] | "custom";

export interface Filters {
  range: SessionRange;
  from: string;
  to: string;
  deviceId: string;
  source: string;
  offset: number;
  pageSize: number;
}

// Preset ranges stay out of the URL (operator call 2026-10-26: a stale
// ?range=… link must not pin the list to old dates, so presets always resolve
// relative to today). A custom window does round-trip (operator call
// 2026-10-28): the heatmap-cell deep link and a manual calendar pick both keep
// from/to in the address bar, so refreshing or sharing the link shows the same
// days instead of losing them on the first rewrite.
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
    source: params.get("source") ?? "",
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
  if (filters.source) query.set("source", filters.source);
  if (filters.offset > 0) query.set("offset", String(filters.offset));
  if (filters.pageSize !== DEFAULT_PAGE_SIZE) {
    query.set("page_size", String(filters.pageSize));
  }

  return query.toString();
}

// Any filter change restarts paging unless the patch is the page itself.
export function mergeSessionFilters(
  previous: Filters,
  patch: Partial<Filters>,
): Filters {
  const next = { ...previous, ...patch };

  if (!("offset" in patch)) next.offset = 0;

  return next;
}
