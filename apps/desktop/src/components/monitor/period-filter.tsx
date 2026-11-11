import type { UsagePeriod } from "@/lib/preferences";

import { ToggleButton, ToggleButtonGroup } from "@heroui/react";

const OPTIONS: Array<{ id: UsagePeriod; label: string }> = [
  { id: "today", label: "今日" },
  { id: "7d", label: "7D" },
  { id: "30d", label: "30D" },
  { id: "all", label: "总计" },
];

/**
 * One control drives the three mix cards; the summary tiles above stay fixed
 * (今日 / 近 7 天) so the two surfaces never disagree (desktop-plan §12.3).
 * Rendered as a connected ToggleButtonGroup so it reads as a single segmented
 * switch at 340 px. Buttons keep HeroUI's default (filled) variant: a ghost
 * unselected segment is the same color as the card behind it, so the control
 * reads as a bare label instead of a switch (operator review 2026-11-10).
 * Defaults to 今日 (operator request 2026-11-11); a stored 近 7 天 stays.
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
      className="shrink-0"
      selectedKeys={[period]}
      selectionMode="single"
      size="sm"
      onSelectionChange={(keys) => {
        const next = typeof keys === "string" ? null : [...keys][0];

        if (
          next === "today" ||
          next === "7d" ||
          next === "30d" ||
          next === "all"
        ) {
          onChange(next);
        }
      }}
    >
      {OPTIONS.map((option, index) => (
        <ToggleButton key={option.id} id={option.id} size="sm">
          {index > 0 ? <ToggleButtonGroup.Separator /> : null}
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );
}
