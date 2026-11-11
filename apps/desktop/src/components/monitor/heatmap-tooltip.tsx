// The shared hover tooltip for the activity heatmap: one portalled panel
// instead of a Tooltip tree per cell (371 cells would rebuild too much on
// each 10 s refresh). Ported from web's dashboard/heatmap-tooltip.tsx with
// the desktop SourceIcon / source labels; the day is pure data, so there are
// no copy keys here.

import type { TooltipAnchor } from "@/lib/heatmap-helpers";

import { Typography } from "@heroui/react";
import { createPortal } from "react-dom";

import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/source-logos";

/**
 * Formatting is injected by the parent so the tooltip stays a pure view of
 * the cell it anchors (desktop zh-CN compact tokens + percent share).
 */
export function HeatmapTooltip({
  tooltip,
  emptyLabel,
  formatPercent,
  formatTokens,
}: {
  tooltip: TooltipAnchor;
  emptyLabel: string;
  formatPercent: (ratio: number) => string;
  formatTokens: (value: number) => string;
}) {
  const entries = Object.entries(tooltip.cell.sources).sort(
    (first, second) => second[1] - first[1],
  );
  const total = tooltip.cell.totalTokens || 1;

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
          {formatTokens(tooltip.cell.totalTokens)}
        </span>
      </div>
      {entries.length === 0 ? (
        <Typography color="muted" type="body-xs">
          {emptyLabel}
        </Typography>
      ) : (
        <div className="flex flex-col gap-1.5">
          {entries.slice(0, 6).map(([source, tokens]) => (
            <div key={source} className="flex flex-col gap-0.5">
              <div className="flex items-center gap-1.5">
                <SourceIcon size={12} source={source} />
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
