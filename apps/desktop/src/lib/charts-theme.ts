// Single source of truth for the recharts wrappers' visual constants (web
// lib/charts/theme.ts 同款). The palette reads the chart tokens from
// app.css so it follows the theme instead of hardcoded hexes.

/** Axis tick style shared by the trend and cost charts. */
export const AXIS_STYLE = { fontSize: 11, fill: "currentColor", opacity: 0.55 };

/** Shell for the multi-row chart tooltip (charts.tsx `TooltipBox`). */
export const TOOLTIP_BOX_CLASS =
  "bg-surface text-foreground border-border rounded-3xl border p-3 text-xs shadow-sm";

/** Categorical palette: chart-1 … chart-8 in natural order, then it wraps. */
export function seriesColor(index: number): string {
  return `var(--color-chart-${(index % 8) + 1})`;
}

/**
 * Stacked composition series keep the historical input / cached / output →
 * chart-1 / 3 / 2 mapping. This is deliberately NOT the natural `seriesColor`
 * order: changing it would alter the existing composition chart's visual.
 */
const COMPOSITION_COLORS = {
  input: "var(--color-chart-1)",
  cached: "var(--color-chart-3)",
  output: "var(--color-chart-2)",
} as const;

export type CompositionKey = keyof typeof COMPOSITION_COLORS;

export function compositionColor(key: CompositionKey): string {
  return COMPOSITION_COLORS[key];
}
