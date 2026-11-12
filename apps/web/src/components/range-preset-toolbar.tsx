"use client";

// Preset-only time-range toolbar shared by the dashboard, Sessions and Sync runs
// filter bars (2026-11-12): one single-select `ToggleButtonGroup` listing
// 总计 / 今天 / 7D / 30D. `selected` may sit on "custom" for legacy deep links
// (e.g. the dashboard heatmap cell or an old date-picker bookmark) — no preset
// lights up then, and picking one drops the custom window back to that preset.

import type { RangeKey, RangePresetChoice } from "@/lib/dashboard/ranges";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";

import { RANGE_PRESETS } from "@/lib/dashboard/ranges";

export function RangePresetToolbar({
  ariaLabel,
  labels,
  selected,
  onSelect,
}: {
  ariaLabel: string;
  labels: Record<RangePresetChoice, string>;
  selected: RangeKey;
  onSelect: (preset: RangePresetChoice) => void;
}) {
  return (
    <ToggleButtonGroup
      disallowEmptySelection
      aria-label={ariaLabel}
      selectedKeys={selected === "custom" ? [] : [selected]}
      selectionMode="single"
      size="sm"
      onSelectionChange={(keys) => {
        const next = [...keys][0];
        const preset = RANGE_PRESETS.find((candidate) => candidate === next);

        if (!preset || preset === selected) return;

        onSelect(preset);
      }}
    >
      {RANGE_PRESETS.map((preset) => (
        <ToggleButton key={preset} id={preset}>
          {labels[preset]}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
