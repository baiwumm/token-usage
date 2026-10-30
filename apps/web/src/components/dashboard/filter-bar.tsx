"use client";

// Dashboard filter bar: range picker (presets + calendar), timezone and device
// selects, clear-filters, and the share / refresh actions. The URL filter
// contract lives in filters.ts; this file only renders controls and hands
// patches back to the parent.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { CalendarDate } from "@internationalized/date";
import type { ShareCardData } from "@/components/share-card";
import type { DashboardDevice } from "@/lib/dashboard/api";
import type { DashboardRange } from "@/lib/dashboard/ranges";
import type { Filters } from "./filters";

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
import { useMemo, useState } from "react";

import { DeviceFilterSelect } from "@/components/device-filter-select";
import { RangePresetButtons } from "@/components/range-preset-buttons";
import { ShareCardButton } from "@/components/share-card-button";
import { formatMessage } from "@/lib/copy/message";
import {
  ALL_RANGE_START,
  browserTimezone,
  RANGE_PRESETS,
  TIMEZONE_OPTIONS,
  type RangeKey,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

export function DashboardFilterBar({
  activeDevices,
  copy,
  devicesLoading,
  filters,
  hasFilters,
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
  hasFilters: boolean;
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
  const { formatDateTime } = useFormat();
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  // Range picker state: rangeForSelection resolves the URL day keys — valid
  // custom pairs pass through, presets resolve to their relative window
  // ending today — so the picker always shows a well-formed window.
  const rangePickerValue = useMemo(
    () => ({ start: parseDate(range.fromDay), end: parseDate(range.toDay) }),
    [range],
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
              presets={RANGE_PRESETS}
              selected={filters.range}
              onSelect={(preset) => {
                onApply({
                  range: preset as RangeKey,
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

      <label className="flex flex-col gap-1">
        <Typography color="muted" type="body-xs">
          {copy.tzLabel}
        </Typography>
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
      </label>

      <DeviceFilterSelect
        allLabel={copy.allDevices}
        devices={activeDevices}
        label={copy.deviceLabel}
        loading={devicesLoading}
        value={filters.deviceId}
        onChange={(deviceId) => onApply({ deviceId })}
      />

      {hasFilters ? (
        <Button
          size="sm"
          variant="ghost"
          onPress={() =>
            onApply({
              range: "30d",
              from: "",
              to: "",
              tz: "",
              deviceId: "",
            })
          }
        >
          {copy.clearFilters}
        </Button>
      ) : null}

      <div className="ml-auto flex items-center gap-1.5">
        <ShareCardButton input={shareInput} />
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label={copy.refresh}
            size="sm"
            variant="tertiary"
            onPress={onRefresh}
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
