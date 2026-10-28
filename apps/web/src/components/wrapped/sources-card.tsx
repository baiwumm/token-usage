"use client";

// Source mix for /wrapped: one stacked bar for the year, then a row per source
// with brand logo, display label, volume, share and a mini bar.

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { DashboardPayload } from "@/lib/dashboard/api";

import { Card } from "@heroui/react";

import { seriesColor } from "@/components/mini-charts";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { useFormat } from "@/lib/format/format";

export function SourcesCard({
  copy,
  sources,
  totalTokens,
}: {
  copy: WrappedCopy;
  sources: DashboardPayload["sources"];
  totalTokens: number;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.sourcesTitle}</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {/* One stacked bar for the year's source mix, then a row per
            source: brand logo, display label, volume and share. */}
        <div
          aria-hidden="true"
          className="flex h-2 w-full overflow-hidden rounded-full"
        >
          {sources.map((entry, index) => (
            <div
              key={entry.source}
              style={{
                background: seriesColor(index),
                width: `${
                  totalTokens > 0 ? (entry.total_tokens / totalTokens) * 100 : 0
                }%`,
              }}
            />
          ))}
        </div>
        {sources.map((entry, index) => {
          const share = totalTokens > 0 ? entry.total_tokens / totalTokens : 0;

          return (
            <div key={entry.source} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-1.5">
                  <SourceIcon label={entry.source} size={14} />
                  <span className="truncate font-medium">
                    {sourceDisplayLabel(entry.source)}
                  </span>
                </span>
                <span className="text-foreground/60 tabular-nums text-xs">
                  {formatTokens(entry.total_tokens)} · {formatPercent(share)} ·{" "}
                  {formatCost(entry.total_cost_usd)}
                </span>
              </div>
              <div
                aria-hidden="true"
                className="bg-default h-1.5 w-full overflow-hidden rounded-full"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    background: seriesColor(index),
                    width: `${share * 100}%`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </Card.Content>
    </Card>
  );
}
