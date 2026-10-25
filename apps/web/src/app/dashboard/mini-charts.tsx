"use client";

// Dashboard chart helpers: mini sparkline for the summary cards and a donut
// chart for source/model distribution (recharts 3.x). Tooltips format through
// the shared format provider.

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { useFormat } from "@/lib/format/format";

/** Tiny trend line for summary cards (no axes). Uses CSS currentColor. */
export function Sparkline({
  values,
}: {
  values: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="h-10 w-24" style={{ color: "var(--color-chart-3)" }}>
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart
          data={values}
          margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
        >
          <Area
            dataKey="value"
            fill="currentColor"
            fillOpacity={0.12}
            stroke="currentColor"
            strokeWidth={1.5}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Categorical palette for distribution charts (fixed order). Charts read the
 * accent-tinted chart tokens from globals.css so the palette follows the
 * theme (and the operator's accent picker) instead of hardcoded hexes.
 */
export const SERIES_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-4)",
  "var(--color-chart-2)",
  "var(--color-chart-5)",
  "var(--color-chart-3)",
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

export function DonutChart({
  entries,
  centerLabel,
  centerValue,
}: {
  entries: Array<{ name: string; value: number }>;
  centerLabel: string;
  centerValue: string;
}) {
  const { formatTokens } = useFormat();

  return (
    <div className="relative h-44 w-44 shrink-0">
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <Pie
            data={entries}
            dataKey="value"
            innerRadius="62%"
            outerRadius="94%"
            paddingAngle={2}
            stroke="none"
          >
            {entries.map((entry, index) => (
              <Cell key={entry.name} fill={seriesColor(index)} />
            ))}
          </Pie>
          <Tooltip
            content={(props) => {
              const payload = (
                props as unknown as {
                  active?: boolean;
                  payload?: ReadonlyArray<{
                    payload?: { name?: string; value?: number };
                  }>;
                }
              ).payload;

              if (!props.active || !payload?.length) return null;
              const datum = payload[0]?.payload;

              return (
                <div className="bg-surface text-foreground border-border rounded-xl border p-2 text-xs shadow-sm">
                  {datum?.name}: {formatTokens(datum?.value ?? 0)}
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-foreground/50 text-xs">{centerLabel}</span>
        <span className="text-foreground text-sm font-semibold tabular-nums">
          {centerValue}
        </span>
      </div>
    </div>
  );
}
