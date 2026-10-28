"use client";

// Filter row for /sessions (docs/ui-spec.md 筛选条): time window + presets,
// device, source, "clear filters" and the refresh button that doubles as the
// last-updated tooltip. Everything is controlled by the page's URL filters.

import type { Locale } from "@/lib/copy/locale";
import type { SessionsCopy } from "@/lib/copy/sessions";
import type { SessionsPayload } from "@/lib/dashboard/api";

import { ArrowsRotateRight, Layers } from "@gravity-ui/icons";
import {
  Button,
  DateField,
  DateRangePicker,
  ListBox,
  Popover,
  RangeCalendar,
  Select,
  Spinner,
  Tooltip,
  Typography,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useMemo, useState, type Key } from "react";

import {
  SESSION_RANGE_PRESETS,
  type Filters,
  type SessionRange,
} from "./filters";

import { DeviceFilterSelect } from "@/components/device-filter-select";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { RangePresetButtons } from "@/components/range-preset-buttons";
import { formatMessage } from "@/lib/copy/message";
import {
  ALL_RANGE_START,
  dayKeyInTz,
  type DashboardRange,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

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
  lastUpdatedAt,
  hasNarrowingFilters,
  onApply,
  onClear,
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
  lastUpdatedAt: number | null;
  hasNarrowingFilters: boolean;
  onApply: (patch: Partial<Filters>) => void;
  onClear: () => void;
  onRetry: () => void;
}) {
  const { formatDateTime } = useFormat();
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
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
        <DateRangePicker
          aria-label={copy.rangeLabel}
          className="w-64"
          isOpen={rangePickerOpen}
          maxValue={rangePickerMax}
          minValue={parseDate(ALL_RANGE_START)}
          value={rangePickerValue}
          onChange={(value) => {
            if (!value || value.end.compare(rangePickerMax) > 0) return;

            onApply({
              range: "custom",
              from: value.start.toString(),
              to: value.end.toString(),
            });
          }}
          onOpenChange={setRangePickerOpen}
        >
          <DateField.Group fullWidth>
            <DateField.Input slot="start">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateRangePicker.RangeSeparator />
            <DateField.Input slot="end">
              {(segment) => <DateField.Segment segment={segment} />}
            </DateField.Input>
            <DateField.Suffix>
              <DateRangePicker.Trigger>
                <DateRangePicker.TriggerIndicator />
              </DateRangePicker.Trigger>
            </DateField.Suffix>
          </DateField.Group>
          <DateRangePicker.Popover>
            <RangePresetButtons
              ariaLabel={copy.rangeLabel}
              labels={copy.ranges}
              presets={SESSION_RANGE_PRESETS}
              selected={filters.range}
              onSelect={(preset) => {
                onApply({
                  range: preset as SessionRange,
                  from: "",
                  to: "",
                });
                setRangePickerOpen(false);
              }}
            />
            <RangeCalendar
              aria-label={copy.rangeLabel}
              maxValue={rangePickerMax}
            >
              <RangeCalendar.Header>
                <RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.YearPickerTriggerHeading />
                  <RangeCalendar.YearPickerTriggerIndicator />
                </RangeCalendar.YearPickerTrigger>
                <RangeCalendar.NavButton slot="previous" />
                <RangeCalendar.NavButton slot="next" />
              </RangeCalendar.Header>
              <RangeCalendar.Grid>
                <RangeCalendar.GridHeader>
                  {(day) => (
                    <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                  )}
                </RangeCalendar.GridHeader>
                <RangeCalendar.GridBody>
                  {(date) => <RangeCalendar.Cell date={date} />}
                </RangeCalendar.GridBody>
              </RangeCalendar.Grid>
              <RangeCalendar.YearPickerGrid>
                <RangeCalendar.YearPickerGridBody>
                  {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                </RangeCalendar.YearPickerGridBody>
              </RangeCalendar.YearPickerGrid>
            </RangeCalendar>
          </DateRangePicker.Popover>
        </DateRangePicker>
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
            aria-label={copy.refresh}
            size="sm"
            variant="tertiary"
            onPress={onRetry}
          >
            <ArrowsRotateRight
              aria-hidden="true"
              className={refreshing ? "size-4 animate-spin" : "size-4"}
            />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">
              {lastUpdatedAt == null
                ? copy.lastUpdatedNone
                : formatMessage(copy.lastUpdated, locale, {
                    time: formatDateTime(new Date(lastUpdatedAt)),
                  })}
            </Typography>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
