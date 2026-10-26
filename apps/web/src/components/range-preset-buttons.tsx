"use client";

// Preset quick buttons inside the DateRangePicker popover, shared by the
// dashboard and Sessions filter bars (dashboard adds the all-time entry).
// Single-select group: the active preset is highlighted; re-picking it is a
// no-op so a redundant refetch never fires.

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";

export function RangePresetButtons({
  ariaLabel,
  labels,
  presets,
  selected,
  onSelect,
}: {
  ariaLabel: string;
  labels: Record<string, string>;
  presets: readonly string[];
  selected: string;
  onSelect: (preset: string) => void;
}) {
  return (
    <ToggleButtonGroup
      disallowEmptySelection
      fullWidth
      aria-label={ariaLabel}
      className="flex-wrap pb-2"
      selectedKeys={[selected]}
      size="sm"
      onSelectionChange={(keys) => {
        const key = [...keys][0];

        if (typeof key !== "string" || key === selected) return;

        onSelect(key);
      }}
    >
      {presets.map((preset) => (
        <ToggleButton key={preset} className="min-w-14" id={preset}>
          {labels[preset]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
