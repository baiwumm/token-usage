"use client";

// Header for /wrapped: the year selector (only years that carry usage). The
// share-card actions live in the share panel below the header.

import type { WrappedCopy } from "@/lib/copy/wrapped";

import { ListBox, Popover, Select, Spinner } from "@heroui/react";

export function WrappedHeader({
  copy,
  year,
  yearOptions,
  refreshing,
  onYearChange,
}: {
  copy: WrappedCopy;
  year: number;
  yearOptions: number[];
  refreshing: boolean;
  onYearChange: (year: number) => void;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4">
      <Select
        aria-label={copy.yearAriaLabel}
        className="w-48"
        value={String(year)}
        onChange={(key) => {
          if (key == null) return;
          onYearChange(Number(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          {/* Options are still loading: the indicator becomes a spinner;
              otherwise it falls back to the chevron. */}
          {refreshing ? (
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
            {yearOptions.map((candidate) => (
              <ListBox.Item
                key={candidate}
                id={String(candidate)}
                textValue={String(candidate)}
              >
                {`${candidate} ${copy.yearSuffix}`}
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </header>
  );
}
