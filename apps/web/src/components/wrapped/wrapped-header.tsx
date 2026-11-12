"use client";

// Header for /wrapped: the year selector (only years that carry usage) on the
// left and the shared share-card button (same trigger and dialog as the
// dashboard) on the right. While the selected year has no payload yet — first
// load or a year switch — the year select's own indicator renders as a Spinner
// (same pattern as DeviceFilterSelect), and falls back to the chevron once the
// year is ready.

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { ShareCardData } from "@/components/share-card";

import { ListBox, Popover, Select, Spinner } from "@heroui/react";

import { ShareCardButton } from "@/components/share-card-button";

export function WrappedHeader({
  copy,
  year,
  yearOptions,
  loading,
  shareInput,
  onYearChange,
}: {
  copy: WrappedCopy;
  year: number;
  yearOptions: number[];
  /** No payload for the selected year yet — the indicator renders as a spinner. */
  loading: boolean;
  /** Null until the year payload lands — the share action is disabled then. */
  shareInput: ShareCardData | null;
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

      <ShareCardButton input={shareInput} />
    </header>
  );
}
