"use client";

// Header for /wrapped: the year selector (only years that carry usage) and the
// share-card export button, which disables itself until there is data.

import type { WrappedCopy } from "@/lib/copy/wrapped";

import { ArrowDownToLine } from "@gravity-ui/icons";
import { Button, ListBox, Popover, Select, Spinner } from "@heroui/react";

export function WrappedHeader({
  copy,
  year,
  yearOptions,
  refreshing,
  exporting,
  hasData,
  onYearChange,
  onExport,
}: {
  copy: WrappedCopy;
  year: number;
  yearOptions: number[];
  refreshing: boolean;
  exporting: boolean;
  hasData: boolean;
  onYearChange: (year: number) => void;
  onExport: () => void;
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
      <Button
        isDisabled={!hasData}
        isPending={exporting}
        size="sm"
        variant="secondary"
        onPress={onExport}
      >
        {({ isPending }) => (
          <>
            {isPending ? (
              <Spinner color="current" size="sm" />
            ) : (
              <ArrowDownToLine className="size-4" />
            )}
            {copy.share.button}
          </>
        )}
      </Button>
    </header>
  );
}
