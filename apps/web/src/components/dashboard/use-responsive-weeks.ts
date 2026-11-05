"use client";

// Width-driven cell sizing for the heatmap grid: at most `maxWeeks` columns,
// shrinking (never below MIN_CELL) when the card is narrow.

import { useEffect, useRef, useState } from "react";

import { CELL_GAP, LABEL_WIDTH, MIN_CELL } from "./heatmap-geometry";

/**
 * Pure fit calculation, exported so the right-edge clipping regression can
 * be asserted without a DOM. The rendered template is
 * `LABEL_WIDTHpx repeat(weeks, cellSizepx)` with `CELL_GAP` between every
 * adjacent column — i.e. `weeks` gaps, including the label→first-week one.
 */
export function fitHeatmapWidth(
  width: number,
  maxWeeks: number,
): { weeks: number; cellSize: number } {
  if (maxWeeks <= 0 || width <= 0) return { weeks: 0, cellSize: MIN_CELL };

  const fitted = Math.floor((width - LABEL_WIDTH) / (MIN_CELL + CELL_GAP));
  const weeks = Math.max(1, Math.min(maxWeeks, fitted || 1));

  if (weeks >= maxWeeks) {
    const gaps = maxWeeks * CELL_GAP;

    return {
      weeks: maxWeeks,
      cellSize: Math.max(
        1,
        Math.floor((width - LABEL_WIDTH - gaps) / maxWeeks),
      ),
    };
  }

  return { weeks, cellSize: MIN_CELL };
}

/** Total px width the grid will actually occupy. */
export function heatmapGridWidth(weeks: number, cellSize: number): number {
  return LABEL_WIDTH + weeks * cellSize + weeks * CELL_GAP;
}

export function useResponsiveWeeks(maxWeeks: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(MIN_CELL);
  const [visibleWeeks, setVisibleWeeks] = useState(maxWeeks);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || maxWeeks <= 0) return;

    const update = () => {
      const { weeks, cellSize } = fitHeatmapWidth(
        element.clientWidth,
        maxWeeks,
      );

      setVisibleWeeks(weeks);
      setCellSize(cellSize);
    };

    update();
    // The ResizeObserver alone covers it: any window resize that changes the
    // card width re-fires the observer, so a second window listener would
    // just run the same measurement twice per resize.
    const observer = new ResizeObserver(update);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [maxWeeks]);

  return { containerRef, cellSize, visibleWeeks };
}
