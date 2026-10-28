"use client";

// Trend card (docs/ui-spec.md 仪表盘 趋势): daily/monthly bucketing plus the
// tokens/cost metric switch. The plot itself lives in charts.tsx; this file owns
// the card shell, the two tab groups and the slot's error state.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { MonthlyPoint, SeriesPoint } from "@/lib/dashboard/api";
import type { DashboardRange } from "@/lib/dashboard/ranges";

import { Card, Tabs } from "@heroui/react";
import { useMemo, useState } from "react";

import { TrendChart, type TrendMetric, type TrendPoint } from "./charts";
import { PanelOverlay } from "./panel-overlay";

import { SectionError } from "@/components/section-states";
import { useFormat } from "@/lib/format/format";

export type TrendMode = "daily" | "monthly";

export function TrendPanel({
  copy,
  daily,
  dailyStatus,
  monthly,
  monthlyStatus,
  range,
  refreshing,
  selectedDay,
  trendMode,
  onRetry,
  onSelectDay,
  onTrendModeChange,
}: {
  copy: DashboardCopy;
  daily: SeriesPoint[];
  dailyStatus: LoadStatus;
  monthly: MonthlyPoint[];
  monthlyStatus: LoadStatus;
  range: DashboardRange;
  refreshing: boolean;
  /** Day clicked on the daily series (drives the selected point). */
  selectedDay: string;
  trendMode: TrendMode;
  onRetry: () => void;
  onSelectDay: (day: string) => void;
  onTrendModeChange: (mode: TrendMode) => void;
}) {
  const { formatMonth } = useFormat();
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("tokens");

  const trendData = useMemo<TrendPoint[]>(() => {
    if (trendMode === "monthly") {
      return monthly.map((point) => ({
        key: point.month,
        label: formatMonth(point.month),
        tokens: point.total_tokens,
        cost: point.total_cost_usd,
        conversations: point.conversation_count,
        input: point.input_tokens,
        cached: point.cached_input_tokens + point.cache_creation_input_tokens,
        output: point.output_tokens,
      }));
    }

    return daily.map((point) => ({
      key: point.day ?? "",
      label: (point.day ?? "").slice(5),
      tokens: point.total_tokens,
      cost: point.total_cost_usd,
      conversations: point.conversation_count,
      input: point.input_tokens,
      cached: point.cached_input_tokens + point.cache_creation_input_tokens,
      output: point.output_tokens,
    }));
  }, [daily, formatMonth, monthly, trendMode]);

  return (
    <Card className="relative p-6">
      <PanelOverlay active={refreshing} />
      <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <Card.Title>{copy.charts.trendTitle}</Card.Title>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            selectedKey={trendMode}
            onSelectionChange={(key) =>
              onTrendModeChange(String(key) as TrendMode)
            }
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={copy.charts.trendTitle} className="p-0.5">
                <Tabs.Tab className="h-7 min-w-12 px-2.5 text-xs" id="daily">
                  {copy.charts.daily}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab className="h-7 min-w-12 px-2.5 text-xs" id="monthly">
                  {copy.charts.monthly}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
          <Tabs
            selectedKey={trendMetric}
            onSelectionChange={(key) =>
              setTrendMetric(String(key) as TrendMetric)
            }
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={copy.charts.trendTitle} className="p-0.5">
                <Tabs.Tab className="h-7 min-w-12 px-2.5 text-xs" id="tokens">
                  {copy.charts.tokens}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab className="h-7 min-w-12 px-2.5 text-xs" id="cost">
                  {copy.charts.cost}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
      </Card.Header>
      <Card.Content>
        {trendMode === "daily" &&
        dailyStatus === "error" &&
        daily.length === 0 ? (
          <SectionError
            message={copy.states.loadError}
            retry={onRetry}
            retryLabel={copy.states.retry}
          />
        ) : trendMode === "monthly" &&
          monthlyStatus === "error" &&
          monthly.length === 0 ? (
          <SectionError
            message={copy.states.loadError}
            retry={onRetry}
            retryLabel={copy.states.retry}
          />
        ) : (
          <TrendChart
            ariaLabel={copy.charts.ariaLabel
              .replace("{title}", copy.charts.trendTitle)
              .replace("{from}", range.fromDay)
              .replace("{to}", range.toDay)}
            data={trendData}
            emptyLabel={copy.charts.noData}
            labels={{
              tokens: copy.charts.tokens,
              cost: copy.charts.cost,
              conversations: copy.cards.conversations,
              input: copy.charts.inputTokens,
              cached: copy.charts.cachedTokens,
              output: copy.charts.outputTokens,
            }}
            metric={trendMetric}
            selectedKey={
              trendMode === "daily" && selectedDay ? selectedDay : undefined
            }
            onSelect={(key) => {
              if (trendMode !== "daily" || !key) return;
              onSelectDay(key);
            }}
          />
        )}
      </Card.Content>
    </Card>
  );
}
