"use client";

// Dashboard chart helpers: mini sparkline for the summary cards and a donut
// chart for source/model distribution (recharts 3.x).

import type { MonthlyPoint } from "@/lib/dashboard/api";

import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

/** Tiny trend line for summary cards (no axes). Uses CSS currentColor. */
export function Sparkline({
  values,
}: {
  values: Array<{ label: string; value: number }>;
}) {
  return (
    <div className="h-10 w-24 text-danger">
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

/** Categorical palette for distribution charts (fixed order). */
export const SERIES_COLORS = [
  "#3b82f6",
  "#f59e0b",
  "#22c55e",
  "#a855f7",
  "#ef4444",
  "#14b8a6",
  "#eab308",
  "#ec4899",
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
                <div className="bg-surface text-foreground border-default-200 rounded-medium border p-2 text-xs shadow-sm">
                  {datum?.name}: {compact(datum?.value ?? 0)}
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

// MonthlyPoint re-exported for typed call sites.
export type { MonthlyPoint };
