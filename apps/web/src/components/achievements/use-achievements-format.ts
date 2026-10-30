"use client";

// Locale-aware value formatter for achievement metrics: tokens through the
// token-display preference, days/counts as plain numbers, session lengths as
// durations and cache ratios as percentages (the payload stores 0–1).

import type { AchievementUnit } from "@/lib/achievements/catalog";

import { useFormat } from "@/lib/format/format";

export function useAchievementFormat(): (
  unit: AchievementUnit,
  value: number,
) => string {
  const { formatTokens, formatNumber, formatDuration, formatPercent } =
    useFormat();

  return (unit, value) => {
    if (unit === "tokens") return formatTokens(value);
    if (unit === "duration_ms") return formatDuration(value);
    if (unit === "ratio") return formatPercent(value);

    return formatNumber(value);
  };
}
