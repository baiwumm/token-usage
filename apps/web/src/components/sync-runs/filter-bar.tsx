"use client";

// Filter row for /sync-runs (docs/cli-contract.md §2.12): time window +
// presets, device, trigger, result, "clear filters" and the refresh button with
// its last-updated tooltip. Everything is controlled by the page's URL filters.

import type { Locale } from "@/lib/copy/locale";
import type { SyncRunsCopy } from "@/lib/copy/sync-runs";

import { Button, ListBox, Popover, Select, Typography } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useMemo, type Key } from "react";

import {
  RESULT_OPTIONS,
  SYNC_RANGE_PRESETS,
  TRIGGER_OPTIONS,
  type Filters,
  type SyncRunRange,
} from "./filters";

import { DateRangeFilter } from "@/components/date-range-filter";
import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RefreshButton } from "@/components/refresh-button";
import { dayKeyInTz, type DashboardRange } from "@/lib/dashboard/ranges";

export function SyncRunsFilterBar({
  copy,
  locale,
  filters,
  range,
  timezone,
  deviceOptions,
  loading,
  refreshing,
  lastUpdatedAt,
  hasNarrowingFilters,
  onApply,
  onClear,
  onRetry,
}: {
  copy: SyncRunsCopy;
  locale: Locale;
  filters: Filters;
  /** Window the URL filters resolve to, ending today. */
  range: DashboardRange;
  /** Zone the range picker caps days at. */
  timezone: string;
  deviceOptions: Array<{ device_id: string; device_name: string }>;
  loading: boolean;
  refreshing: boolean;
  lastUpdatedAt: number | null;
  hasNarrowingFilters: boolean;
  onApply: (patch: Partial<Filters>) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  // Range picker state: rangeForSelection resolves the URL day keys — valid
  // custom pairs pass through, presets resolve to their relative window
  // ending today — so the picker always shows a well-formed window.
  const rangePickerValue = useMemo(
    () => ({ start: parseDate(range.fromDay), end: parseDate(range.toDay) }),
    [range],
  );
  const rangePickerMax = useMemo(
    () => parseDate(dayKeyInTz(new Date(), timezone)),
    [timezone],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex flex-col gap-1">
        <Typography color="muted" type="body-xs">
          {copy.rangeLabel}
        </Typography>
        <DateRangeFilter
          ariaLabel={copy.rangeLabel}
          labels={copy.ranges}
          locale={locale}
          maxValue={rangePickerMax}
          presets={SYNC_RANGE_PRESETS}
          selectedPreset={filters.range}
          value={rangePickerValue}
          onChange={({ from, to }) => onApply({ range: "custom", from, to })}
          onPresetSelect={(preset) =>
            onApply({ range: preset as SyncRunRange, from: "", to: "" })
          }
        />
      </label>

      <DeviceFilterSelect
        allLabel={copy.allDevices}
        devices={deviceOptions}
        label={copy.deviceLabel}
        loading={loading}
        value={filters.deviceId}
        onChange={(deviceId) => onApply({ deviceId })}
      />

      <label className="flex flex-col gap-1">
        <Typography color="muted" type="body-xs">
          {copy.triggerLabel}
        </Typography>
        <Select
          aria-label={copy.triggerLabel}
          className="w-40"
          value={filters.trigger || "__all"}
          onChange={(key: Key | null) => {
            if (key == null) return;
            const value = String(key);

            onApply({ trigger: value === "__all" ? "" : value });
          }}
        >
          <Select.Trigger>
            <Select.Value>
              {({ selectedText }) => (
                <span className="truncate">{selectedText}</span>
              )}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <Popover.Arrow />
            <ListBox>
              <ListBox.Item id="__all" textValue={copy.allTriggers}>
                {copy.allTriggers}
              </ListBox.Item>
              {TRIGGER_OPTIONS.map((trigger) => (
                <ListBox.Item
                  key={trigger}
                  id={trigger}
                  textValue={copy.trigger[trigger]}
                >
                  {copy.trigger[trigger]}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </label>

      <label className="flex flex-col gap-1">
        <Typography color="muted" type="body-xs">
          {copy.resultLabel}
        </Typography>
        <Select
          aria-label={copy.resultLabel}
          className="w-40"
          value={filters.result || "__all"}
          onChange={(key: Key | null) => {
            if (key == null) return;
            const value = String(key);

            onApply({ result: value === "__all" ? "" : value });
          }}
        >
          <Select.Trigger>
            <Select.Value>
              {({ selectedText }) => (
                <span className="truncate">{selectedText}</span>
              )}
            </Select.Value>
            <Select.Indicator />
          </Select.Trigger>
          <Select.Popover>
            <Popover.Arrow />
            <ListBox>
              <ListBox.Item id="__all" textValue={copy.allResults}>
                {copy.allResults}
              </ListBox.Item>
              {RESULT_OPTIONS.map((result) => (
                <ListBox.Item
                  key={result}
                  id={result}
                  textValue={copy.result[result]}
                >
                  {copy.result[result]}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </label>

      {hasNarrowingFilters ? (
        <Button size="sm" variant="ghost" onPress={onClear}>
          {copy.clearFilters}
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        <RefreshButton
          lastUpdatedAt={lastUpdatedAt}
          lastUpdatedNone={copy.lastUpdatedNone}
          lastUpdatedTemplate={copy.lastUpdated}
          locale={locale}
          refreshLabel={copy.refresh}
          refreshing={refreshing}
          onPress={onRetry}
        />
      </div>
    </div>
  );
}
