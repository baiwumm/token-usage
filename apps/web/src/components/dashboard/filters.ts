// Dashboard URL filter contract (docs/ui-spec.md 筛选条): the filter state the
// page keeps in React, plus the two functions that read/write the address bar.

import type { RangeKey } from "@/lib/dashboard/ranges";

export interface Filters {
  range: RangeKey;
  from: string;
  to: string;
  tz: string;
  deviceId: string;
}

// Range filters never round-trip the URL (operator call 2026-10-26): a stale
// ?range=custom&from=… bookmark must not pin the dashboard to old dates, so
// only tz / device_id persist and every load starts at the default window.
export function parseFilters(params: URLSearchParams): Filters {
  return {
    range: "30d",
    from: "",
    to: "",
    tz: params.get("tz") ?? "",
    deviceId: params.get("device_id") ?? "",
  };
}

export function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.tz) query.set("tz", filters.tz);
  if (filters.deviceId) query.set("device_id", filters.deviceId);

  return query.toString();
}
