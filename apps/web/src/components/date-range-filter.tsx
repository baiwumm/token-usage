"use client";

// Shared date-range control (docs/ui-spec.md 筛选条). The DateRangePicker
// anatomy, preset buttons and range calendar live here for the Sync runs filter
// bar. Data, presets and copy stay with the caller; the picker's open state and
// the max-value guard live here. (The dashboard dropped the calendar/custom
// window on 2026-11-12 and Sessions followed with the preset-only
// `RangePresetToolbar`.)

import type { Locale } from "@/lib/copy/locale";
import type { CalendarDate } from "@internationalized/date";

import { DateField, DateRangePicker, RangeCalendar } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useState } from "react";

import { RangePresetButtons } from "@/components/range-preset-buttons";
import { ALL_RANGE_START } from "@/lib/dashboard/ranges";

export interface DateRangeFilterProps {
  /** aria-label shared by the picker, presets and calendar. */
  ariaLabel: string;
  /** Localized labels keyed by the preset ids. */
  labels: Record<string, string>;
  /** Locale the labels were resolved for; kept on the contract for callers.
   * The picker itself reads i18n from the provider, so it is intentionally
   * not forwarded (forwarding would change the existing behavior). */
  locale?: Locale;
  /** Upper bound (today in the page's timezone). */
  maxValue: CalendarDate;
  /** Lower bound; defaults to ALL_RANGE_START. */
  minValue?: CalendarDate;
  /** Manual/calendar selection, already validated against maxValue. */
  onChange: (range: { from: string; to: string }) => void;
  /** Preset selection; the popover closes afterwards. */
  onPresetSelect: (preset: string) => void;
  /** Preset keys shown in the popover. */
  presets: readonly string[];
  /** Currently active preset key. */
  selectedPreset: string;
  /** Controlled range shown by the picker. */
  value: { start: CalendarDate; end: CalendarDate };
}

export function DateRangeFilter({
  ariaLabel,
  labels,
  maxValue,
  minValue,
  onChange,
  onPresetSelect,
  presets,
  selectedPreset,
  value,
}: DateRangeFilterProps) {
  const [open, setOpen] = useState(false);

  return (
    <DateRangePicker
      aria-label={ariaLabel}
      className="w-64"
      isOpen={open}
      maxValue={maxValue}
      minValue={minValue ?? parseDate(ALL_RANGE_START)}
      value={value}
      onChange={(next) => {
        if (!next || next.end.compare(maxValue) > 0) return;

        onChange({ from: next.start.toString(), to: next.end.toString() });
      }}
      onOpenChange={setOpen}
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
          ariaLabel={ariaLabel}
          labels={labels}
          presets={presets}
          selected={selectedPreset}
          onSelect={(preset) => {
            onPresetSelect(preset);
            setOpen(false);
          }}
        />
        <RangeCalendar aria-label={ariaLabel} maxValue={maxValue}>
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
  );
}
