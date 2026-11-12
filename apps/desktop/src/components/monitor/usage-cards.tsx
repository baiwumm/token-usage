import type { MonitorSnapshot, UsageSeries } from "@/lib/monitor";
import type { UsagePeriod } from "@/lib/preferences";
import type { UsageWindow } from "@/lib/queue-lines";

import { CircleInfo } from "@gravity-ui/icons";
import { Card, Chip, Tooltip, Typography } from "@heroui/react";

import { FlowNumber } from "@/components/flow-number";
import { Sparkline } from "@/components/mini-charts";
import { formatCost, formatPercent, formatTokens } from "@/lib/format-tokens";

interface UsageCardsProps {
  snapshot: MonitorSnapshot;
  period: UsagePeriod;
}

/** One stat metric: value/prev/sparkline readers + its sparkline colour. */
interface StatMetric {
  value: (window: UsageWindow) => number;
  format: (value: number) => string;
  colorVar: string;
  /** Sparkline series selector (per-bucket ratio for the cache rate). */
  pointValue: (point: UsageSeries["days"][number]) => number;
}

/**
 * 总计 口径说明 (operator question 2026-11-12: "desktop 39.92 亿 vs web 156 亿"):
 * the desktop aggregates the local CLI queue only — this machine, since its
 * queue began — while the web dashboard adds every other device plus rows
 * uploaded before this queue existed. The two totals are not supposed to
 * match. Delivered as a hover Tooltip on the 总 Tokens label instead of a
 * caption line (operator 2026-11-12 round 2: a line broke the card layout).
 */
const LOCAL_ONLY_HINT =
  "总计只统计本机采集器队列的全部历史；网页端还包含其他设备与更早的服务器侧记录，两边数字不必一致。";

const METRICS: Array<{
  id: string;
  label: string;
  metric: StatMetric;
}> = [
  {
    id: "tokens",
    label: "总 Tokens",
    metric: {
      value: (window) => window.totalTokens,
      format: (value) => formatTokens(value),
      colorVar: "var(--color-chart-1)",
      pointValue: (point) => point.tokens,
    },
  },
  {
    id: "cost",
    label: "预计费用",
    metric: {
      value: (window) => window.totalCostUsd,
      format: (value) => formatCost(value),
      colorVar: "var(--color-chart-3)",
      pointValue: (point) => point.costUsd,
    },
  },
  {
    id: "sessions",
    label: "会话数",
    metric: {
      value: (window) => window.conversations,
      format: (value) => formatTokens(value),
      colorVar: "var(--color-chart-2)",
      pointValue: (point) => point.conversations,
    },
  },
  {
    id: "cache",
    label: "缓存率",
    metric: {
      value: (window) => window.cacheRate,
      format: (value) => formatPercent(value),
      colorVar: "var(--color-chart-4)",
      pointValue: (point) =>
        point.tokens > 0 ? point.cacheTokens / point.tokens : 0,
    },
  },
];

/**
 * Four stat cards (总 Tokens / 预计费用 / 会话数 / 缓存率) driven by the
 * header's period filter: label + period-over-period Chip + value + mini
 * sparkline (web hero 同款方向, recharts Sparkline). The value rolls through
 * FlowNumber whenever the period changes, so the cards animate in place
 * instead of remounting; the Chip compares the window against the previous
 * equal-length one (总计 has no baseline); both Chip and sparkline hide while
 * the window has no usage (operator rule 2026-11-11). No caption line — the
 * old 会话/缓存/「采集端估算」 text repeated what the card already showed and was
 * dropped in the 2026-11-11 acceptance round.
 */
export function UsageCards({ snapshot, period }: UsageCardsProps) {
  const window = activeWindow(snapshot, period);
  const prev = previousWindow(snapshot, period);
  const points = seriesPoints(snapshot.series, period);
  const empty = window.totalTokens === 0;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {METRICS.map((item) => {
        const value = item.metric.value(window);
        const prevValue = prev === null ? null : item.metric.value(prev);

        return (
          <StatCard
            key={item.id}
            change={
              empty || prevValue === null || prevValue === 0
                ? null
                : (value - prevValue) / prevValue
            }
            colorVar={item.metric.colorVar}
            hint={
              item.id === "tokens" && period === "all" ? LOCAL_ONLY_HINT : null
            }
            label={item.label}
            sparkline={
              empty
                ? null
                : points.map((point) => ({
                    label: point.key,
                    value: item.metric.pointValue(point),
                  }))
            }
            value={item.metric.format(value)}
          />
        );
      })}
    </div>
  );
}

function StatCard({
  label,
  value,
  change,
  sparkline,
  colorVar,
  hint,
}: {
  label: string;
  value: string;
  /** Relative change vs the previous window, or null to hide the badge. */
  change: number | null;
  sparkline: Array<{ label: string; value: number }> | null;
  colorVar: string;
  /** Hover explanation next to the label, or null to render the label alone. */
  hint: string | null;
}) {
  return (
    <Card className="gap-1 border-border p-3">
      <Card.Header>
        <Card.Title className="flex w-full items-center justify-between gap-2 text-xs font-normal text-muted">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate">{label}</span>
            {hint === null ? null : <LabelHint text={hint} />}
          </span>
          {change !== null ? (
            <Chip
              className="shrink-0 tabular-nums"
              color={change >= 0 ? "success" : "danger"}
              size="sm"
              variant="soft"
            >
              {/* Arrow rides the prefix so the percentage rolls too. */}
              <FlowNumber
                text={`${change >= 0 ? "↑" : "↓"} ${formatPercent(
                  Math.abs(change),
                )}`}
              />
            </Chip>
          ) : null}
        </Card.Title>
      </Card.Header>
      <Card.Content className="gap-0.5">
        <Typography
          className="text-foreground tabular-nums"
          type="h6"
          weight="semibold"
        >
          <FlowNumber text={value} />
        </Typography>
        {sparkline ? (
          <Sparkline
            className="mt-1 h-8 w-full"
            colorVar={colorVar}
            values={sparkline}
          />
        ) : null}
      </Card.Content>
    </Card>
  );
}

/**
 * Tiny info icon on the stat label: the Tooltip carries the explanation on
 * hover/focus (operator 2026-11-12: no caption line — it upset the card row).
 * The trigger is focusable so keyboard users reach the same text.
 */
function LabelHint({ text }: { text: string }) {
  return (
    <Tooltip delay={150}>
      <Tooltip.Trigger
        aria-label="统计口径说明"
        className="inline-grid shrink-0 cursor-help place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus"
        tabIndex={0}
      >
        <CircleInfo aria-hidden="true" className="size-3.5" />
      </Tooltip.Trigger>
      <Tooltip.Content showArrow placement="top">
        <Typography
          className="max-w-64 text-left leading-relaxed"
          type="body-xs"
        >
          {text}
        </Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}

function activeWindow(
  snapshot: MonitorSnapshot,
  period: UsagePeriod,
): UsageWindow {
  if (period === "today") return snapshot.today;
  if (period === "7d") return snapshot.week;
  if (period === "30d") return snapshot.month;

  return snapshot.all;
}

/** Previous equal-length window, or null for 总计 (no baseline to compare). */
function previousWindow(
  snapshot: MonitorSnapshot,
  period: UsagePeriod,
): UsageWindow | null {
  if (period === "today") return snapshot.yesterday;
  if (period === "7d") return snapshot.prevWeek;
  if (period === "30d") return snapshot.prevMonth;

  return null;
}

/** Sparkline buckets for the period: hours / last 7+ days / months. */
function seriesPoints(series: UsageSeries, period: UsagePeriod) {
  if (period === "today") return series.hours;
  if (period === "7d") return series.days.slice(-7);
  if (period === "30d") return series.days;

  return series.months;
}
