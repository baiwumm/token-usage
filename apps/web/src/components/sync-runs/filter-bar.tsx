"use client";

// Filter row for /sync-runs (docs/cli-contract.md §2.12): time window +
// presets, device, trigger, result, "clear filters" and the refresh button with
// its last-updated tooltip. Everything is controlled by the page's URL filters.

import type { Locale } from "@/lib/copy/locale";
import type { SyncRunsCopy } from "@/lib/copy/sync-runs";

import { ArrowsRotateRight } from "@gravity-ui/icons";
import {
  Button,
  DateField,
  DateRangePicker,
  ListBox,
  Popover,
  RangeCalendar,
  Select,
  Tooltip,
  Typography,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useMemo, useState, type Key } from "react";

import {
  RESULT_OPTIONS,
  SYNC_RANGE_PRESETS,
  TRIGGER_OPTIONS,
  type Filters,
  type SyncRunRange,
} from "./filters";

import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetButtons } from "@/components/range-preset-buttons";
import { formatMessage } from "@/lib/copy/message";
import {
  ALL_RANGE_START,
  dayKeyInTz,
  type DashboardRange,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

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
              presets={SYNC_RANGE_PRESETS}
              selected={filters.range}
              onSelect={(preset) => {
                onApply({
                  range: preset as SyncRunRange,
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
