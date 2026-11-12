"use client";

// Dashboard filter bar: range presets (attached toolbar), timezone and device
// selects, and the share / refresh actions. The URL filter contract lives in
// filters.ts; this file only renders controls and hands patches back to the
// parent.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { ShareCardData } from "@/components/share-card";
import type { DashboardDevice } from "@/lib/dashboard/api";
import type { Filters } from "./filters";

import {
  ListBox,
  Popover,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Toolbar,
} from "@heroui/react";

import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RefreshButton } from "@/components/refresh-button";
import { ShareCardButton } from "@/components/share-card-button";
import {
  browserTimezone,
  RANGE_PRESETS,
  TIMEZONE_OPTIONS,
} from "@/lib/dashboard/ranges";

export function DashboardFilterBar({
  activeDevices,
  copy,
  devicesLoading,
  filters,
  lastUpdatedAt,
  locale,
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
  refreshing: boolean;
  /** Share input is ready — the share action stays disabled until it is. */
  shareInput: ShareCardData | null;
  onApply: (patch: Partial<Filters>) => void;
  onRefresh: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Toolbar isAttached aria-label={copy.rangeLabel}>
        <ToggleButtonGroup
          disallowEmptySelection
          aria-label={copy.rangeLabel}
          selectedKeys={[filters.range]}
          selectionMode="single"
          size="sm"
          onSelectionChange={(keys) => {
            const next = [...keys][0];
            const preset = RANGE_PRESETS.find(
              (candidate) => candidate === next,
            );

            if (!preset || preset === filters.range) return;

            onApply({ range: preset, from: "", to: "" });
          }}
        >
          {RANGE_PRESETS.map((preset, index) => (
            <ToggleButton key={preset} id={preset}>
              {index > 0 ? <ToggleButtonGroup.Separator /> : null}
              {copy.ranges[preset]}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
      </Toolbar>

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
