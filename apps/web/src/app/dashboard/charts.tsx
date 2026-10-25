"use client";

// Chart wrappers for the dashboard (recharts 3.x). Colors stay on HeroUI
// theme tokens via CSS variables; every number goes through useFormat so the
// appearance preferences apply to axes and tooltips too.

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { useFormat } from "@/lib/format/format";

export interface TrendPoint {
  key: string;
  label: string;
  tokens: number;
  cost: number;
  conversations: number;
}

export type TrendMetric = "tokens" | "cost";

const AXIS_STYLE = { fontSize: 11, fill: "currentColor", opacity: 0.55 };

interface TooltipRow {
  label: string;
  value: string;
}

interface RechartsTooltipProps {
  active?: boolean;
  payload?: ReadonlyArray<{ payload?: unknown } | undefined>;
}

function TooltipBox({ rows }: { rows: TooltipRow[] }) {
  return (
    <div className="bg-surface text-foreground border-border rounded-xl border p-3 text-xs shadow-sm">
      {rows.map((row) => (
        <div key={row.label} className="flex justify-between gap-4">
          <span className="text-foreground/60">{row.label}</span>
          <span className="font-medium tabular-nums">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
  rows,
}: RechartsTooltipProps & { rows: (item: unknown) => TooltipRow[] }) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;

  if (datum == null) return null;

  return <TooltipBox rows={rows(datum)} />;
}

export function TrendChart({
  data,
  metric,
  ariaLabel,
  emptyLabel,
  labels,
  onSelect,
}: {
  data: TrendPoint[];
  metric: TrendMetric;
  ariaLabel: string;
  emptyLabel: string;
  labels: { tokens: string; cost: string; conversations: string };
  onSelect?: (key: string) => void;
}) {
  const { formatTokens, formatTokensExact, formatCost, formatNumber } =
    useFormat();

  if (data.length === 0) {
    return (
      <div className="text-muted flex h-72 items-center justify-center text-sm">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div
      aria-label={ariaLabel}
      className="text-foreground/40 h-72 w-full"
      role="img"
    >
      <ResponsiveContainer height="100%" width="100%">
        <BarChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          onClick={(state) => {
            const label = (
              state as { activeLabel?: string | number | undefined }
            )?.activeLabel;

            if (typeof label === "string") onSelect?.(label);
          }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={24} tick={{ ...AXIS_STYLE }} />
          <YAxis
            tick={{ ...AXIS_STYLE }}
            tickFormatter={(value: number) =>
              metric === "cost" ? formatCost(value) : formatTokens(value)
            }
            width={64}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...(props as unknown as RechartsTooltipProps)}
                rows={(item) => {
                  const point = item as TrendPoint;

                  return [
                    { label: point.key, value: "" },
                    {
                      label: labels.tokens,
                      value: formatTokensExact(point.tokens),
                    },
                    { label: labels.cost, value: formatCost(point.cost) },
                    {
                      label: labels.conversations,
                      value: formatNumber(point.conversations),
                    },
                  ];
                }}
              />
            )}
            cursor={{ opacity: 0.08 }}
          />
          <Bar
            cursor={onSelect ? "pointer" : undefined}
            dataKey={metric}
            fill="var(--color-chart-3)"
            radius={[3, 3, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function CostTrendChart({
  data,
  ariaLabel,
  labels,
}: {
  data: Array<{ label: string; cost: number }>;
  ariaLabel: string;
  labels: { cost: string };
}) {
  const { formatCost } = useFormat();

  if (data.length === 0) return null;

  return (
    <div
      aria-label={ariaLabel}
      className="h-40 w-full"
      role="img"
      style={{ color: "var(--color-chart-3)" }}
    >
      <ResponsiveContainer height="100%" width="100%">
        <AreaChart
          data={data}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
        >
          <defs>
            <linearGradient id="cost-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
              <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" minTickGap={24} tick={{ ...AXIS_STYLE }} />
          <YAxis
            tick={{ ...AXIS_STYLE }}
            tickFormatter={(value: number) => formatCost(value)}
            width={64}
          />
          <Tooltip
            content={(props) => (
              <ChartTooltip
                {...(props as unknown as RechartsTooltipProps)}
                rows={(item) => {
                  const point = item as { label: string; cost: number };

                  return [
                    { label: point.label, value: "" },
                    { label: labels.cost, value: formatCost(point.cost) },
                  ];
                }}
              />
            )}
            cursor={{ opacity: 0.08 }}
          />
          <Area
            dataKey="cost"
            fill="url(#cost-fill)"
            fillOpacity={1}
            stroke="currentColor"
            strokeWidth={2}
            type="monotone"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
