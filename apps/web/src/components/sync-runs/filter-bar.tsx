"use client";

// Filter row for /sync-runs (docs/cli-contract.md §2.12): the shared preset-only
// time toolbar, device / trigger / result selects (「全部…」placeholders with
// `Select.ClearButton`), and the refresh button doubling as the last-updated
// tooltip. Everything is controlled by the page's URL filters.

import type { Locale } from "@/lib/copy/locale";
import type { SyncRunsCopy } from "@/lib/copy/sync-runs";
import type { Filters } from "./filters";

import { ListBox, Popover, Select } from "@heroui/react";

import { RESULT_OPTIONS, TRIGGER_OPTIONS } from "./filters";

import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetToolbar } from "@/components/range-preset-toolbar";
import { RefreshButton } from "@/components/refresh-button";

export function SyncRunsFilterBar({
  copy,
  locale,
  filters,
  deviceOptions,
  loading,
  refreshing,
  lastUpdatedAt,
  onApply,
  onRetry,
}: {
  copy: SyncRunsCopy;
  locale: Locale;
  filters: Filters;
  deviceOptions: Array<{ device_id: string; device_name: string }>;
  loading: boolean;
  refreshing: boolean;
  lastUpdatedAt: number | null;
  onApply: (patch: Partial<Filters>) => void;
  onRetry: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <RangePresetToolbar
        ariaLabel={copy.rangeLabel}
        labels={copy.ranges}
        selected={filters.range}
        onSelect={(range) => onApply({ range, from: "", to: "" })}
      />

      <DeviceFilterSelect
        placeholderMode
        allLabel={copy.allDevices}
        devices={deviceOptions}
        label={copy.deviceLabel}
        loading={loading}
        value={filters.deviceId}
        onChange={(deviceId) => onApply({ deviceId })}
      />

      <Select
        aria-label={copy.triggerLabel}
        className="w-40"
        placeholder={copy.allTriggers}
        value={filters.trigger || null}
        onChange={(key) => {
          if (key == null) return;

          onApply({ trigger: String(key) });
        }}
        onClear={() => onApply({ trigger: "" })}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.ClearButton />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
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

      <Select
        aria-label={copy.resultLabel}
        className="w-40"
        placeholder={copy.allResults}
        value={filters.result || null}
        onChange={(key) => {
          if (key == null) return;

          onApply({ result: String(key) });
        }}
        onClear={() => onApply({ result: "" })}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.ClearButton />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <Popover.Arrow />
          <ListBox>
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
