import type { TrendSeries, UsagePoint } from "@/lib/monitor";

import { Card, Tabs } from "@heroui/react";
import { useMemo, useState } from "react";

import {
  TREND_LABELS,
  TrendChart,
  type TrendMetric,
  type TrendPoint,
} from "@/components/charts";

export type TrendMode = "daily" | "monthly";

function toTrendPoint(point: UsagePoint): TrendPoint {
  return {
    key: point.key,
    label:
      point.key.length === 7 // YYYY-MM-DD → MM-DD (web 同款 slice)
        ? point.key.slice(5)
        : point.key,
    tokens: point.tokens,
    cost: point.costUsd,
    conversations: point.conversations,
    input: point.inputTokens,
    cached: point.cacheTokens,
    output: point.outputTokens,
  };
}

/**
 * 用量趋势卡 (web 仪表盘趋势同款移植): daily / monthly bucket tabs plus the
 * Token / 成本 metric switch, stacked input-cached-output bars on the token
 * view. Data is the snapshot's per-period trend series (local hourly buckets
 * rolled up to local day / month keys), so bars always reconcile with the
 * stat cards above.
 */
export function TrendCard({ trend }: { trend: TrendSeries }) {
  const [trendMode, setTrendMode] = useState<TrendMode>("daily");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("tokens");

  const trendData = useMemo<TrendPoint[]>(() => {
    const source = trendMode === "monthly" ? trend.monthly : trend.daily;

    return source.map(toTrendPoint);
  }, [trend, trendMode]);

  return (
    <Card className="border-border">
      <Card.Header className="flex-row! items-center justify-between gap-3">
        <Card.Title>用量趋势</Card.Title>
        <div className="flex flex-wrap items-center gap-2">
          <Tabs
            selectedKey={trendMode}
            onSelectionChange={(key) => setTrendMode(String(key) as TrendMode)}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label="用量趋势" className="p-0.5">
                <Tabs.Tab className="h-7 min-w-10 px-2 text-xs" id="daily">
                  按日
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab className="h-7 min-w-10 px-2 text-xs" id="monthly">
                  按月
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
              <Tabs.List aria-label="统计口径" className="p-0.5">
                <Tabs.Tab className="h-7 min-w-10 px-2 text-xs" id="tokens">
                  {TREND_LABELS.tokens}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab className="h-7 min-w-10 px-2 text-xs" id="cost">
                  {TREND_LABELS.cost}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
        </div>
      </Card.Header>
      <Card.Content>
        <TrendChart
          ariaLabel={`用量趋势 · ${
            trendMode === "daily" ? "按日" : "按月"
          } · ${TREND_LABELS[trendMetric]}`}
          data={trendData}
          emptyLabel="该时间范围内没有数据"
          metric={trendMetric}
        />
      </Card.Content>
    </Card>
  );
}
