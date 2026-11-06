"use client";

// Filter row for /sessions (docs/ui-spec.md 筛选条): time window + presets,
// device, source, "clear filters" and the refresh button that doubles as the
// last-updated tooltip. Everything is controlled by the page's URL filters.

import type { Locale } from "@/lib/copy/locale";
import type { SessionsCopy } from "@/lib/copy/sessions";
import type { SessionsPayload } from "@/lib/dashboard/api";

import { ArrowDownToLine, Layers } from "@gravity-ui/icons";
import {
  Button,
  ListBox,
  Popover,
  Select,
  Spinner,
  Tooltip,
  Typography,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useMemo, type Key } from "react";

import {
  SESSION_RANGE_PRESETS,
  type Filters,
  type SessionRange,
} from "./filters";

import { DateRangeFilter } from "@/components/date-range-filter";
import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RefreshButton } from "@/components/refresh-button";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { dayKeyInTz, type DashboardRange } from "@/lib/dashboard/ranges";

export function SessionsFilterBar({
  copy,
  locale,
  filters,
  range,
  timezone,
  deviceOptions,
  sourceOptions,
  loading,
  refreshing,
  canExport,
  exporting,
  lastUpdatedAt,
  hasNarrowingFilters,
  onApply,
  onClear,
  onExport,
  onRetry,
}: {
  copy: SessionsCopy;
  locale: Locale;
  filters: Filters;
  /** Window the URL filters resolve to, ending today. */
  range: DashboardRange;
  /** Zone the range picker caps days at. */
  timezone: string;
  deviceOptions: SessionsPayload["facets"]["devices"];
  sourceOptions: SessionsPayload["facets"]["sources"];
  loading: boolean;
  refreshing: boolean;
  canExport: boolean;
  exporting: boolean;
  lastUpdatedAt: number | null;
  hasNarrowingFilters: boolean;
  onApply: (patch: Partial<Filters>) => void;
  onClear: () => void;
  onExport: () => void;
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
          presets={SESSION_RANGE_PRESETS}
          selectedPreset={filters.range}
          value={rangePickerValue}
          onChange={({ from, to }) => onApply({ range: "custom", from, to })}
          onPresetSelect={(preset) =>
            onApply({ range: preset as SessionRange, from: "", to: "" })
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
          {copy.sourceLabel}
        </Typography>
        <Select
          aria-label={copy.sourceLabel}
          className="w-44"
          value={filters.source || "__all"}
          onChange={(key: Key | null) => {
            if (key == null) return;
            const value = String(key);

            onApply({ source: value === "__all" ? "" : value });
          }}
        >
          <Select.Trigger>
            <Select.Value>
              {({ selectedText }) => (
                <span className="flex min-w-0 items-center gap-2">
                  {filters.source ? (
                    <SourceIcon label={filters.source} size={14} />
                  ) : (
                    <Layers
                      aria-hidden="true"
                      className="text-muted size-4 shrink-0"
                    />
                  )}
                  <span className="truncate">{selectedText}</span>
                </span>
              )}
            </Select.Value>
            {loading ? (
              <Select.Indicator>
                <Spinner size="sm" />
              </Select.Indicator>
            ) : (
              <Select.Indicator />
            )}
          </Select.Trigger>
          <Select.Popover>
            <Popover.Arrow />
            <ListBox>
              <ListBox.Item id="__all" textValue={copy.allSources}>
                <Layers
                  aria-hidden="true"
                  className="text-muted size-4 shrink-0"
                />
                {copy.allSources}
              </ListBox.Item>
              {sourceOptions.map((entry) => (
                <ListBox.Item
                  key={entry.source}
                  id={entry.source}
                  textValue={sourceDisplayLabel(entry.source)}
                >
                  <SourceIcon label={entry.source} size={14} />
                  {sourceDisplayLabel(entry.source)}
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
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label={copy.exportCsv}
            isDisabled={!canExport || loading || exporting}
            size="sm"
            variant="tertiary"
            onPress={onExport}
          >
            {exporting ? (
              <Spinner size="sm" />
            ) : (
              <ArrowDownToLine aria-hidden="true" className="size-4" />
            )}
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">{copy.exportCsv}</Typography>
          </Tooltip.Content>
        </Tooltip>
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
