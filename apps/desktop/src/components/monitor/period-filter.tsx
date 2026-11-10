import type { UsagePeriod } from "@/lib/preferences";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";

const OPTIONS: Array<{ id: UsagePeriod; label: string }> = [
  { id: "today", label: "今日" },
  { id: "7d", label: "近 7 天" },
];

/**
 * One control drives the three mix cards; the summary tiles above stay fixed
 * (今日 / 近 7 天) so the two surfaces never disagree (desktop-plan §12.3).
 * Rendered as a connected ToggleButtonGroup so it reads as a single segmented
 * switch at 340 px.
 */
export function PeriodFilter({
  period,
  onChange,
}: {
  period: UsagePeriod;
  onChange: (period: UsagePeriod) => void;
}) {
  return (
    <ToggleButtonGroup
      disallowEmptySelection
      aria-label="统计周期"
      selectedKeys={[period]}
      selectionMode="single"
      size="sm"
      onSelectionChange={(keys) => {
        const next = typeof keys === "string" ? null : [...keys][0];

        if (next === "today" || next === "7d") onChange(next);
      }}
    >
      {OPTIONS.map((option) => (
        <ToggleButton key={option.id} id={option.id} size="sm" variant="ghost">
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
