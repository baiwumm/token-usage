"use client";

// Width-driven cell sizing for the heatmap grid: at most `maxWeeks` columns,
// shrinking (never below MIN_CELL) when the card is narrow.

import { useEffect, useRef, useState } from "react";

import { CELL_GAP, LABEL_WIDTH, MIN_CELL } from "./heatmap-geometry";

export function useResponsiveWeeks(maxWeeks: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(MIN_CELL);
  const [visibleWeeks, setVisibleWeeks] = useState(maxWeeks);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || maxWeeks <= 0) return;

    const update = () => {
      const width = element.clientWidth;
      const fitted = Math.floor(
        (width - LABEL_WIDTH + CELL_GAP) / (MIN_CELL + CELL_GAP),
      );
      const weeks = Math.max(1, Math.min(maxWeeks, fitted || 1));

      if (weeks >= maxWeeks) {
        setVisibleWeeks(maxWeeks);
        const gaps = Math.max(0, maxWeeks - 1) * CELL_GAP;

        setCellSize(
          Math.max(1, Math.floor((width - LABEL_WIDTH - gaps) / maxWeeks)),
        );
      } else {
        setVisibleWeeks(weeks);
        setCellSize(MIN_CELL);
      }
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
