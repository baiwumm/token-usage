// Chart wrappers for the monitor cards (recharts 3.x, web charts.tsx 同款
// 移植). Colors stay on HeroUI theme tokens via CSS variables; numbers go
// through the desktop's fixed zh-CN formatters (web injects per-user format
// preferences — the desktop deliberately has none, docs/desktop-plan.md §9).

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { type ReactNode, useId } from "react";

import {
  compositionColor,
  TOOLTIP_BOX_CLASS,
  AXIS_STYLE,
} from "@/lib/charts-theme";
import { formatCost, formatNumber, formatTokens } from "@/lib/format-tokens";

export interface TrendPoint {
  key: string;
  label: string;
  tokens: number;
  cost: number;
  conversations: number;
  // Token composition (stacked tokens metric): total = input + cached
  // (cache read + write merged) + output. Reasoning is a sub-view of output
  // and is not stacked separately.
  input: number;
  cached: number;
  output: number;
}

/** Stacked composition series for the tokens metric (chart tokens view). */
const COMPOSITION_KEYS = ["input", "cached", "output"] as const;

export type TrendMetric = "tokens" | "cost";

export const TREND_LABELS = {
  tokens: "Token",
  cost: "成本",
  conversations: "会话数",
  input: "输入",
  cached: "缓存",
  output: "输出",
} as const;

/**
 * role="img" hides the SVG subtree from assistive technology, so the numbers
 * live in a visually hidden figcaption and are linked via aria-describedby
 * (docs/ui-spec.md: charts carry a text summary, colour is never the only
 * channel).
 */
function ChartFigure({
  children,
  summaryId,
  summary,
}: {
  children: ReactNode;
  summaryId: string;
  summary: ReactNode;
}) {
  return (
    <figure className="m-0 w-full">
      {children}
      <figcaption className="sr-only" id={summaryId}>
        {summary}
      </figcaption>
    </figure>
  );
}

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
    <div className={TOOLTIP_BOX_CLASS}>
      {/* Row order is static, labels are display-only — keying by label
          collapsed rows when two series shared a caption. */}
      {rows.map((row, index) => (
        <div key={index} className="flex justify-between gap-4">
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
}: {
  data: TrendPoint[];
  metric: TrendMetric;
  ariaLabel: string;
  emptyLabel: string;
}) {
  const summaryId = `chart-summary-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;

  if (data.length === 0) {
    return (
      <div className="text-muted flex h-56 items-center justify-center text-sm">
        {emptyLabel}
      </div>
    );
  }

  const totalTokens = data.reduce((sum, point) => sum + point.tokens, 0);
  const peak = data.reduce<TrendPoint | null>(
    (best, point) =>
      best == null || point.tokens > best.tokens ? point : best,
    null,
  );

  return (
    <ChartFigure
      summary={`${ariaLabel} · ${TREND_LABELS.tokens} ${formatTokens(totalTokens)} · ${
        peak ? `${peak.label} ${formatTokens(peak.tokens)} · ` : ""
      }${data[0].label} – ${data[data.length - 1].label}`}
      summaryId={summaryId}
    >
      <div
        aria-describedby={summaryId}
        aria-label={ariaLabel}
        className="text-foreground/40 h-56 w-full"
        role="img"
      >
        <ResponsiveContainer height="100%" width="100%">
          <BarChart
            data={data}
            margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" minTickGap={24} tick={{ ...AXIS_STYLE }} />
            <YAxis
              tick={{ ...AXIS_STYLE }}
              tickFormatter={(value: number) =>
                metric === "cost" ? formatCost(value) : formatTokens(value)
              }
              width={56}
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
                        label: TREND_LABELS.tokens,
                        value: formatTokens(point.tokens),
                      },
                      {
                        label: TREND_LABELS.input,
                        value: formatTokens(point.input),
                      },
                      {
                        label: TREND_LABELS.cached,
                        value: formatTokens(point.cached),
                      },
                      {
                        label: TREND_LABELS.output,
                        value: formatTokens(point.output),
                      },
                      {
                        label: TREND_LABELS.cost,
                        value: formatCost(point.cost),
                      },
                      {
                        label: TREND_LABELS.conversations,
                        value: formatNumber(point.conversations),
                      },
                    ];
                  }}
                />
              )}
              cursor={{ opacity: 0.08 }}
            />
            {metric === "tokens" ? (
              <Legend
                formatter={(value) => {
                  const key = String(
                    value,
                  ) as (typeof COMPOSITION_KEYS)[number];

                  return (
                    <span
                      style={{ color: compositionColor(key), fontSize: 11 }}
                    >
                      {TREND_LABELS[key]}
                    </span>
                  );
                }}
                iconSize={8}
                iconType="circle"
              />
            ) : null}
            {metric === "tokens" ? (
              COMPOSITION_KEYS.map((key, index) => (
                <Bar
                  key={key}
                  dataKey={key}
                  fill={compositionColor(key)}
                  radius={
                    index === COMPOSITION_KEYS.length - 1
                      ? [3, 3, 0, 0]
                      : undefined
                  }
                  stackId="composition"
                />
              ))
            ) : (
              <Bar
                dataKey={metric}
                fill="var(--color-chart-3)"
                radius={[3, 3, 0, 0]}
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}

export function CostTrendChart({
  data,
  ariaLabel,
}: {
  data: Array<{ label: string; cost: number }>;
  ariaLabel: string;
}) {
  // SVG ids are document-global: two cost charts on one page would share the
  // first gradient (and React's useId keeps SSR and hydration in sync).
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const gradientId = `cost-fill-${uid}`;
  const summaryId = `chart-summary-${uid}`;

  if (data.length === 0) return null;

  const totalCost = data.reduce((sum, point) => sum + point.cost, 0);
  const peak = data.reduce(
    (best, point) => (point.cost > best.cost ? point : best),
    data[0],
  );

  return (
    <ChartFigure
      summary={`${ariaLabel} · ${TREND_LABELS.cost} ${formatCost(totalCost)} · ${
        peak.label
      } ${formatCost(peak.cost)} · ${data[0].label} – ${
        data[data.length - 1].label
      }`}
      summaryId={summaryId}
    >
      <div
        aria-describedby={summaryId}
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
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity={0.3} />
                <stop offset="100%" stopColor="currentColor" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="label" minTickGap={24} tick={{ ...AXIS_STYLE }} />
            <YAxis
              tick={{ ...AXIS_STYLE }}
              tickFormatter={(value: number) => formatCost(value)}
              width={56}
            />
            <Tooltip
              content={(props) => (
                <ChartTooltip
                  {...(props as unknown as RechartsTooltipProps)}
                  rows={(item) => {
                    const point = item as { label: string; cost: number };

                    return [
                      { label: point.label, value: "" },
                      {
                        label: TREND_LABELS.cost,
                        value: formatCost(point.cost),
                      },
                    ];
                  }}
                />
              )}
              cursor={{ opacity: 0.08 }}
            />
            <Area
              dataKey="cost"
              fill={`url(#${gradientId})`}
              fillOpacity={1}
              stroke="currentColor"
              strokeWidth={2}
              type="monotone"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}

// Composition keys referenced through the Cell-free bars above; kept exported
// for the legend typing.
