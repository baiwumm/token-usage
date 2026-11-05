// Regression test for the clipped rightmost heatmap column on /u/<token>
// (2026-11-05). The fit calculation must never produce a grid wider than the
// measured container, at any breakpoint, with or without a 53rd week column.

import { describe, expect, it } from "vitest";

import {
  fitHeatmapWidth,
  heatmapGridWidth,
} from "../../src/components/dashboard/use-responsive-weeks";

describe("heatmap width fit", () => {
  it("never overflows the container", () => {
    for (const width of [320, 360, 375, 640, 768, 944, 1024, 1280]) {
      for (const maxWeeks of [52, 53]) {
        const fit = fitHeatmapWidth(width, maxWeeks);

        expect(fit.weeks).toBeGreaterThan(0);
        expect(heatmapGridWidth(fit.weeks, fit.cellSize)).toBeLessThanOrEqual(
          width,
        );
      }
    }
  });

  it("uses every available column when there is room", () => {
    // 53 columns need at least LABEL_WIDTH + 53 * (MIN_CELL + CELL_GAP).
    const fit = fitHeatmapWidth(1200, 53);

    expect(fit.weeks).toBe(53);
    expect(fit.cellSize).toBeGreaterThan(0);
  });

  it("degrades to a valid empty measurement", () => {
    expect(fitHeatmapWidth(0, 53).weeks).toBe(0);
    expect(fitHeatmapWidth(1200, 0).weeks).toBe(0);
  });
});
