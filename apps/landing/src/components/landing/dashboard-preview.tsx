"use client";

// 仪表盘静态重绘（设计定稿 03 段）：真实快照数据的纯展示卡——头卡
// （大数字 + KPI 条 + 来源堆叠色条）+ 近 30 天趋势（手绘 SVG 柱）+
// 近一年热力图缩样。装饰性重绘不引 recharts（已批准的例外）。

import { Typography } from "@heroui/react";

import { FlowNumber } from "./flow-number";
import { SectionHeader } from "./section-header";

import { LANDING_COPY } from "@/lib/copy";
import { formatCompactTokens, formatCost, SNAPSHOT } from "@/lib/snapshot";

/** seriesColor 对齐 web lib/charts/theme.ts：第 N 概念 = var(--color-chart-N)。 */
function seriesColor(index: number): string {
  return `var(--color-chart-${(index % 8) + 1})`;
}

export function DashboardPreview() {
  const copy = LANDING_COPY.zh;
  const { totals, meta, sources, series, heatmap } = SNAPSHOT;

  // 来源堆叠色条：top-5 用真实占比，剩余归"其他"（chart-8 灰）。
  const top5Share = sources.reduce((sum, s) => sum + s.share, 0);
  const segments = [
    ...sources.map((source, index) => ({
      color: seriesColor(index),
      share: source.share,
      label: source.label,
    })),
    {
      color: seriesColor(7),
      share: 1 - top5Share,
      label: "其他",
    },
  ];

  const kpis = [
    { label: copy.preview.kpiLabels.cost, value: formatCost(totals.costUsd) },
    {
      label: copy.preview.kpiLabels.activeDays,
      value: String(totals.activeDays),
    },
    { label: copy.preview.kpiLabels.sources, value: String(meta.sourceCount) },
    { label: copy.preview.kpiLabels.models, value: String(meta.modelCount) },
  ];

  return (
    <section className="border-t border-default/50">
      <div className="mx-auto w-full max-w-6xl px-6 py-20 sm:py-24">
        <SectionHeader
          eyebrow={copy.preview.eyebrow}
          sub={copy.preview.sub}
          title={copy.preview.title}
        />

        <div className="mt-10 overflow-hidden rounded-2xl border border-default/50 bg-surface-secondary">
          {/* 头卡：大号数字 + KPI 条 + 来源堆叠色条（hero-card.tsx 重绘）。 */}
          <div className="flex flex-col gap-6 border-b border-default/50 px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex min-w-0 flex-col gap-1">
                <Typography color="muted" type="body-xs">
                  {copy.preview.totalLabel}
                </Typography>
                <FlowNumber
                  className="text-4xl tabular-nums sm:text-5xl"
                  text={formatCompactTokens(totals.tokens)}
                />
                <noscript>
                  <span className="text-base">
                    {formatCompactTokens(totals.tokens)} tokens
                  </span>
                </noscript>
              </div>
              <div className="grid grid-cols-2 gap-x-10 gap-y-3 sm:grid-cols-4">
                {kpis.map((kpi) => (
                  <div key={kpi.label} className="flex flex-col gap-0.5">
                    <Typography color="muted" type="body-xs">
                      {kpi.label}
                    </Typography>
                    <Typography
                      className="tabular-nums"
                      type="body-sm"
                      weight="medium"
                    >
                      {kpi.value}
                    </Typography>
                  </div>
                ))}
              </div>
            </div>

            <div
              aria-hidden="true"
              className="flex h-2 overflow-hidden rounded-full"
            >
              {segments.map((segment) => (
                <span
                  key={segment.label}
                  style={{
                    background: segment.color,
                    width: `${Math.max(segment.share * 100, 0.5)}%`,
                  }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5">
              {segments.map((segment) => (
                <span key={segment.label} className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ background: segment.color }}
                  />
                  <Typography type="body-xs">{segment.label}</Typography>
                  <Typography
                    className="tabular-nums"
                    color="muted"
                    type="body-xs"
                  >
                    {Math.round(segment.share * 100)}%
                  </Typography>
                </span>
              ))}
            </div>
          </div>

          {/* 趋势 + 热力：单列堆叠，<sm 也不横向滚。 */}
          <div className="flex flex-col gap-8 px-6 py-8 sm:px-10 sm:py-10">
            <div className="flex flex-col gap-4">
              <Typography type="body-sm" weight="medium">
                {copy.preview.trendTitle}
              </Typography>
              <TrendBars series={series} />
            </div>
            <div className="flex flex-col gap-4">
              <Typography type="body-sm" weight="medium">
                {copy.preview.heatmapTitle}
              </Typography>
              <MiniHeatmap cells={heatmap.cells} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

// 近 30 天手绘 SVG 柱（快照 series）：只装饰不交互，无坐标轴文案。
function TrendBars({ series }: { series: number[] }) {
  const max = Math.max(...series, 1);
  const barW = 100 / series.length;

  return (
    <div className="relative">
      <svg
        aria-hidden="true"
        className="h-28 w-full"
        preserveAspectRatio="none"
        role="img"
        viewBox="0 0 100 40"
      >
        {series.map((tokens, index) => {
          const h = Math.max((tokens / max) * 40, 0.6);

          return (
            <rect
              key={index}
              fill={seriesColor(0)}
              height={h}
              opacity={0.85}
              rx={0.6}
              width={barW * 0.62}
              x={index * barW}
              y={40 - h}
            />
          );
        })}
      </svg>
      <Typography className="mt-1.5" color="muted" type="body-xs">
        峰值 {formatCompactTokens(Math.max(...series))}
      </Typography>
    </div>
  );
}

// 热力图缩样：同一份 364 格（52 列 × 7 行），复用 HeroMotif 的排布手法。
function MiniHeatmap({ cells }: { cells: Array<[string, number, number]> }) {
  return (
    <div
      aria-hidden="true"
      className="grid grid-cols-[repeat(52,minmax(0,1fr))] gap-0.75"
    >
      {cells.map(([day, , level]) => (
        <span
          key={day}
          className="aspect-square rounded-[2px]"
          style={{
            background:
              level === 0 ? "var(--heatmap-0)" : `var(--heatmap-${level})`,
            opacity: level === 0 ? 0.5 : undefined,
          }}
        />
      ))}
    </div>
  );
}
