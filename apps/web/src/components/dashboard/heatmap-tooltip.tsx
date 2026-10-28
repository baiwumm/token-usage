"use client";

// The shared hover tooltip for the heatmap: one portalled panel instead of a
// Tooltip tree per cell (364 cells would rebuild too much on each refresh).

import type { TooltipAnchor } from "./heatmap-geometry";
import type { DashboardCopy } from "@/lib/copy/dashboard";

import { createPortal } from "react-dom";
import { Typography } from "@heroui/react";

import { SourceIcon } from "./source-icon";
import { sourceDisplayLabel } from "./sources";

import { useFormat } from "@/lib/format/format";

export function HeatmapTooltip({
  tooltip,
  activeSources,
  copy,
}: {
  tooltip: TooltipAnchor;
  activeSources: string[] | null;
  copy: DashboardCopy;
}) {
  const { formatTokens, formatPercent } = useFormat();
  const entries = Object.entries(tooltip.cell.sources)
    .filter(
      ([source]) => activeSources == null || activeSources.includes(source),
    )
    .sort((first, second) => second[1] - first[1]);
  const total = tooltip.cell.total || 1;

  return createPortal(
    <div
      className="bg-surface text-foreground border-border pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-24px)] rounded-3xl border p-3 text-xs shadow-sm"
      role="tooltip"
      style={{
        left: Math.min(
          Math.max(tooltip.left, 128),
          Math.max(128, window.innerWidth - 128),
        ),
        top: Math.max(8, tooltip.top - 8),
        transform: "translate(-50%, -100%)",
      }}
    >
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="font-medium">{tooltip.day}</span>
        <span className="text-muted tabular-nums">
          {formatTokens(tooltip.cell.total)}
        </span>
      </div>
      {entries.length === 0 ? (
        <Typography color="muted" type="body-xs">
          {copy.charts.noData}
        </Typography>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.slice(0, 6).map(([source, tokens]) => (
            <div key={source} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <SourceIcon label={source} size={12} />
                <span className="min-w-0 flex-1 truncate">
                  {sourceDisplayLabel(source)}
                </span>
                <span className="text-muted tabular-nums">
                  {formatTokens(tokens)} · {formatPercent(tokens / total)}
                </span>
              </div>
              <div className="bg-default h-1 overflow-hidden rounded-full">
                <div
                  className="bg-accent h-full rounded-full"
                  style={{ width: `${(tokens / total) * 100}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>,
    document.body,
  );
}
