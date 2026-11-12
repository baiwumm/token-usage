"use client";

// Dashboard filter bar: range picker (presets + calendar), timezone and device
// selects, and the share / refresh actions. The URL filter contract lives in
// filters.ts; this file only renders controls and hands patches back to the
// parent.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { CalendarDate } from "@internationalized/date";
import type { ShareCardData } from "@/components/share-card";
import type { DashboardDevice } from "@/lib/dashboard/api";
import type { DashboardRange } from "@/lib/dashboard/ranges";
import type { Filters } from "./filters";

import { ListBox, Popover, Select } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useMemo } from "react";

import { DateRangeFilter } from "@/components/date-range-filter";
import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RefreshButton } from "@/components/refresh-button";
import { ShareCardButton } from "@/components/share-card-button";
import {
  browserTimezone,
  RANGE_PRESETS,
  TIMEZONE_OPTIONS,
  type RangeKey,
} from "@/lib/dashboard/ranges";

export function DashboardFilterBar({
  activeDevices,
  copy,
  devicesLoading,
  filters,
  lastUpdatedAt,
  locale,
  range,
  rangePickerMax,
  refreshing,
  shareInput,
  onApply,
  onRefresh,
}: {
  activeDevices: DashboardDevice[];
  copy: DashboardCopy;
  devicesLoading: boolean;
  filters: Filters;
  lastUpdatedAt: number | null;
  locale: "zh" | "en";
  range: DashboardRange;
  rangePickerMax: CalendarDate;
  refreshing: boolean;
  /** Share input is ready — the share action stays disabled until it is. */
  shareInput: ShareCardData | null;
  onApply: (patch: Partial<Filters>) => void;
  onRefresh: () => void;
}) {
  // Range picker state: rangeForSelection resolves the URL day keys — valid
  // custom pairs pass through, presets resolve to their relative window
  // ending today — so the picker always shows a well-formed window.
  const rangePickerValue = useMemo(
    () => ({ start: parseDate(range.fromDay), end: parseDate(range.toDay) }),
    [range],
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <DateRangeFilter
        ariaLabel={copy.rangeLabel}
        labels={copy.ranges}
        locale={locale}
        maxValue={rangePickerMax}
        presets={RANGE_PRESETS}
        selectedPreset={filters.range}
        value={rangePickerValue}
        onChange={({ from, to }) => onApply({ range: "custom", from, to })}
        onPresetSelect={(preset) =>
          onApply({ range: preset as RangeKey, from: "", to: "" })
        }
      />

      <Select
        aria-label={copy.tzLabel}
        className="w-48"
        value={filters.tz || "__browser"}
        onChange={(key) => {
          if (key == null) return;
          const value = String(key);

          onApply({ tz: value === "__browser" ? "" : value });
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
            <ListBox.Item
              key="__browser"
              id="__browser"
              textValue={copy.tzBrowser}
            >
              {`${copy.tzBrowser} (${browserTimezone()})`}
            </ListBox.Item>
            {TIMEZONE_OPTIONS.map((zone) => (
              <ListBox.Item key={zone} id={zone} textValue={zone}>
                {zone}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>

      <DeviceFilterSelect
        placeholderMode
        allLabel={copy.allDevices}
        devices={activeDevices}
        label={copy.deviceLabel}
        loading={devicesLoading}
        value={filters.deviceId}
        onChange={(deviceId) => onApply({ deviceId })}
      />

      <div className="ml-auto flex items-center gap-1.5">
        <ShareCardButton input={shareInput} />
        <RefreshButton
          lastUpdatedAt={lastUpdatedAt}
          lastUpdatedNone={copy.lastUpdatedNone}
          lastUpdatedTemplate={copy.lastUpdated}
          locale={locale}
          refreshLabel={copy.refresh}
          refreshing={refreshing}
          onPress={onRefresh}
        />
      </div>
    </div>
  );
}
