// Chart helpers shared across monitor cards (recharts 3.x, web 同款移植):
// the stat-card sparkline and the source-mix donut. Tooltips format through
// the desktop's fixed zh-CN formatters.

import { cn } from "@heroui/react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

import { seriesColor } from "@/lib/charts-theme";
import { formatTokens } from "@/lib/format-tokens";

/**
 * Tiny trend line for the stat cards (no axes, CSS currentColor). Same shape
 * as web's mini-charts.tsx Sparkline, sized by the caller.
 */
export function Sparkline({
  values,
  className = "h-8 w-full",
  colorVar = "var(--color-chart-1)",
}: {
  values: Array<{ label: string; value: number }>;
  className?: string;
  colorVar?: string;
}) {
  return (
    <div className={className} style={{ color: colorVar }}>
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

export function DonutChart({
  entries,
  centerLabel,
  centerValue,
  className = "size-44",
}: {
  entries: Array<{ name: string; value: number }>;
  centerLabel: string;
  centerValue: string;
  /** Size override (spacing classes); the ring keeps its proportions. */
  className?: string;
}) {
  return (
    <div className={cn("relative shrink-0", className)}>
      <ResponsiveContainer height="100%" width="100%">
        <PieChart>
          <Pie
            data={entries}
            dataKey="value"
            // 64% keeps the hole wide enough for a full-digit total
            // (e.g. "22,764,287,930") at the largest ring size.
            innerRadius="64%"
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
                <div className="bg-surface text-foreground border-border rounded-3xl border p-2 text-xs shadow-sm">
                  {datum?.name}: {formatTokens(datum?.value ?? 0)}
                </div>
              );
            }}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-1 text-center">
        <span className="text-foreground/50 text-xs">{centerLabel}</span>
        <span className="text-foreground text-sm font-semibold whitespace-nowrap tabular-nums">
          {centerValue}
        </span>
      </div>
    </div>
  );
}
