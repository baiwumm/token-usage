"use client";

// Chart wrappers for the dashboard (recharts 3.x). Colors stay on HeroUI
// theme tokens via CSS variables; tooltips format through Intl.

import type { DashboardDay, HourlyPoint } from "@/lib/dashboard/api";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

function compact(value: number): string {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function usd(value: number): string {
  return `$${value.toFixed(4)}`;
}

const AXIS_STYLE = { fontSize: 11, fill: "currentColor", opacity: 0.55 };

interface TooltipRow {
  label: string;
  value: string;
}

// recharts v3 tooltip content props carry a readonly payload of entries whose
// `.payload` is the original datum; cast at the boundary, never inside.
interface RechartsTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown } | undefined>;
}

function ChartTooltip({
  active,
  payload,
  rows,
}: RechartsTooltipProps & { rows: (item: unknown) => TooltipRow[] }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;

  if (datum == null) return null;

  return (
    <div className="bg-surface text-foreground border-default-200 rounded-medium border p-3 text-xs shadow-sm">
      {rows(datum).map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-foreground/60">{row.label}</span>
          <span className="font-medium">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function DailyChart({
  days,
  onSelectDay,
}: {
  days: DashboardDay[];
  onSelectDay?: (day: string) => void;
}) {
  return (
    <div className="text-foreground/40 h-72 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={days}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => {
            const label = (
              state as { activeLabel?: string | number | undefined }
            )?.activeLabel;

            if (typeof label === "string") onSelectDay?.(label);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            minTickGap={24}
            tick={{ ...AXIS_STYLE }}
            tickFormatter={(value: string) => value.slice(5)}
          />
          <YAxis tick={{ ...AXIS_STYLE }} tickFormatter={compact} width={56} />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...(props as unknown as RechartsTooltipProps)}
                rows={(item) => {
                  const day = item as DashboardDay;

                  return [
                    { label: "day", value: day.date },
                    {
                      label: "tokens",
                      value: day.total_tokens.toLocaleString("en-US"),
                    },
                    { label: "cost", value: usd(day.total_cost_usd) },
                    {
                      label: "conversations",
                      value: String(day.conversations),
                    },
                  ];
                }}
              />
            )}
            cursor={{ opacity: 0.08 }}
          />
          <Bar
            className="fill-primary"
            cursor="pointer"
            dataKey="total_tokens"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function HourlyChart({ points }: { points: HourlyPoint[] }) {
  const data = points.map((point) => ({
    ...point,
    label: point.hour.slice(11, 13),
  }));

  return (
    <div className="text-foreground/40 h-56 w-full">
      <ResponsiveContainer height="100%" width="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            minTickGap={8}
            tick={{ ...AXIS_STYLE }}
            tickFormatter={(value: string) => `${value}h`}
          />
          <YAxis tick={{ ...AXIS_STYLE }} tickFormatter={compact} width={56} />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...(props as unknown as RechartsTooltipProps)}
                rows={(item) => {
                  const point = item as HourlyPoint;

                  return [
                    { label: "hour", value: point.hour.slice(11, 16) },
                    {
                      label: "tokens",
                      value: point.total_tokens.toLocaleString("en-US"),
                    },
                    { label: "cost", value: usd(point.total_cost_usd) },
                  ];
                }}
              />
            )}
            cursor={{ opacity: 0.08 }}
          />
          <Bar
            className="fill-secondary"
            dataKey="total_tokens"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
