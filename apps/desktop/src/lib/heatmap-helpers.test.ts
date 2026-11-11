import { describe, expect, it } from "vitest";

import {
  alignWeeks,
  buildHeatmap,
  buildMonthMarkers,
  clipHeatmap,
  fitHeatmapWidth,
  heatmapGridWidth,
  heatmapPeriodStartMs,
  heatmapStartMs,
  HEATMAP_DAYS,
  HEATMAP_WEEKS,
  weekdayIndex,
} from "@/lib/heatmap-helpers";
import { localDayKey } from "@/lib/queue-lines";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");
const MONTH_LABELS = new Intl.DateTimeFormat("zh-CN", {
  month: "short",
  timeZone: "UTC",
});

function row(source: string, hourStart: string, totalTokens: number) {
  return {
    source,
    model: "glm-5",
    hourStart,
    projectKey: "",
    inputTokens: totalTokens,
    cachedInputTokens: 0,
    cacheCreationInputTokens: 0,
    outputTokens: 0,
    reasoningOutputTokens: 0,
    billableTotalTokens: null,
    totalCostUsd: 0,
    conversationCount: 1,
    credits: 0,
    totalTokens,
  };
}

describe("heatmap helpers", () => {
  it("spans exactly 364 days ending today, never into the future", () => {
    const data = buildHeatmap([], NOW);
    const cells = data.weeks.flat().filter((cell) => cell !== null);

    expect(cells).toHaveLength(HEATMAP_DAYS);
    expect(new Set(cells.map((cell) => cell.day)).size).toBe(HEATMAP_DAYS);
    expect(cells.at(-1)?.day).toBe(localDayKey(NOW));
    expect(data.to).toBe(localDayKey(NOW));
    // web 同款: from = to − weeks*7 + 1 (local midnight of that day).
    const today = new Date(NOW);

    today.setHours(0, 0, 0, 0);
    const expectedStart = new Date(today.getTime());

    expectedStart.setDate(today.getDate() - (HEATMAP_DAYS - 1));
    expect(heatmapStartMs(NOW)).toBe(expectedStart.getTime());
  });

  it("aligns weeks to Monday with null head and tail padding", () => {
    const data = buildHeatmap([], NOW);

    for (const column of data.weeks) {
      expect(column).toHaveLength(7);
    }
    // The window starts mid-week (web 同款): the first column is null-padded
    // up to the first real day, and every later full column starts on Monday.
    const firstCell = data.weeks[0]?.find((cell) => cell !== null);

    expect(firstCell).toBeDefined();
    const secondColumnFirst = data.weeks[1]?.find((cell) => cell !== null);

    expect(secondColumnFirst).toBeDefined();
    expect(weekdayIndex(secondColumnFirst!.day)).toBe(1);
    // The tail column holds every day after the last full week, null-padded.
    const lastColumn = data.weeks.at(-1);

    expect(lastColumn?.some((cell) => cell === null)).toBe(true);
    expect(data.weeks.flat().filter((cell) => cell === null)).toHaveLength(
      data.weeks.length * 7 - HEATMAP_DAYS,
    );
  });

  it("folds the queue into local days with canonicalized sources", () => {
    const hourStart = new Date(NOW - 60_000).toISOString();
    const data = buildHeatmap(
      [
        row("codex", hourStart, 500),
        row("trae-cn", hourStart, 200),
        row("trae", hourStart, 100),
      ],
      NOW,
    );
    const key = localDayKey(Date.parse(hourStart));
    const cell = data.weeks.flat().find((entry) => entry?.day === key);

    expect(cell).toEqual({
      day: key,
      totalTokens: 800,
      sources: { codex: 500, trae: 300 },
    });
    expect(data.totalTokens).toBe(800);
    expect(data.activeDays).toBe(1);
  });

  it("keeps empty days at zero and counts active days only", () => {
    const data = buildHeatmap(
      [row("codex", new Date(NOW).toISOString(), 1)],
      NOW,
    );

    expect(data.activeDays).toBe(1);
    expect(data.totalTokens).toBe(1);
    expect(
      data.weeks
        .flat()
        .filter((cell) => cell !== null && cell.totalTokens === 0),
    ).toHaveLength(HEATMAP_DAYS - 1);
  });

  it("places month markers on week columns inside the range", () => {
    const data = buildHeatmap([], NOW);
    const markers = buildMonthMarkers(data.weeks.length, data.to, MONTH_LABELS);

    expect(markers.length).toBeGreaterThanOrEqual(12);
    expect(markers.length).toBeLessThanOrEqual(13);
    for (const [position, marker] of markers.entries()) {
      expect(marker.label).toMatch(/^\d{1,2}月$/);
      expect(marker.index).toBeGreaterThanOrEqual(0);
      expect(marker.index).toBeLessThanOrEqual(data.weeks.length);
      if (position > 0) {
        expect(marker.index).toBeGreaterThan(markers[position - 1]!.index);
      }
    }
  });

  it("never fits wider than the container and degrades on junk input", () => {
    for (const width of [340, 400, 620, 768, 1040, 1152]) {
      const fit = fitHeatmapWidth(width, HEATMAP_WEEKS + 1);

      expect(fit.weeks).toBeGreaterThan(0);
      expect(heatmapGridWidth(fit.weeks, fit.cellSize)).toBeLessThanOrEqual(
        width,
      );
    }
    expect(fitHeatmapWidth(0, HEATMAP_WEEKS).weeks).toBe(0);
    expect(fitHeatmapWidth(1152, 0).weeks).toBe(0);
  });

  it("drops weeks before shrinking cells below the 15px floor", () => {
    // The full 53-column grid needs 26 + 53 * 19 = 1033px; between 621px and
    // that, cells stay at MIN_CELL and the oldest weeks are cut from the left.
    const fit = fitHeatmapWidth(1040, HEATMAP_WEEKS + 1);

    expect(fit.weeks).toBe(HEATMAP_WEEKS + 1);
    expect(fit.cellSize).toBeGreaterThanOrEqual(15);

    const narrow = fitHeatmapWidth(600, HEATMAP_WEEKS + 1);

    expect(narrow.cellSize).toBe(15);
    expect(narrow.weeks).toBeLessThan(HEATMAP_WEEKS + 1);
  });

  it("follows the period filter: today keeps only today's cell", () => {
    const hourStart = new Date(NOW - 60_000).toISOString();
    const data = buildHeatmap([row("codex", hourStart, 500)], NOW);
    const clipped = clipHeatmap(data, heatmapPeriodStartMs(NOW, "today"));
    const cells = clipped.weeks.flat().filter((cell) => cell !== null);

    expect(cells).toHaveLength(1);
    expect(cells[0]?.day).toBe(localDayKey(NOW));
    expect(clipped.activeDays).toBe(1);
    expect(clipped.totalTokens).toBe(500);
    expect(clipped.weeks).toHaveLength(1);
  });

  it("clips 7d / 30d to their calendar days and keeps all unchanged", () => {
    const hourStart = new Date(NOW - 60_000).toISOString();
    const data = buildHeatmap([row("codex", hourStart, 500)], NOW);
    const week = clipHeatmap(data, heatmapPeriodStartMs(NOW, "7d"));
    const weekCells = week.weeks.flat().filter((cell) => cell !== null);
    const month = clipHeatmap(data, heatmapPeriodStartMs(NOW, "30d"));
    const monthCells = month.weeks.flat().filter((cell) => cell !== null);

    expect(weekCells).toHaveLength(7);
    expect(monthCells).toHaveLength(30);
    expect(week.activeDays).toBe(1);
    expect(month.totalTokens).toBe(500);
    // 总计 has no start → the whole 364-day payload passes through.
    expect(clipHeatmap(data, heatmapPeriodStartMs(NOW, "all"))).toBe(data);
    expect(data.weeks.flat().filter((cell) => cell !== null)).toHaveLength(
      HEATMAP_DAYS,
    );
  });

  it("alignWeeks pads around a mid-week start", () => {
    // 2026-11-11 is a Wednesday: two leading nulls, then the cells; the
    // trailing column holds the 5 leftover cells + 2 nulls.
    const cells = Array.from({ length: 10 }, (_, index) => ({
      day: localDayKey(Date.UTC(2026, 10, 11 + index)),
      totalTokens: 0,
      sources: {},
    }));
    const columns = alignWeeks(cells);

    expect(columns[0]?.[0]).toBeNull();
    expect(columns[0]?.[1]).toBeNull();
    expect(columns[0]?.[2]?.day).toBe("2026-11-11");
    expect(columns.at(-1)?.filter((cell) => cell === null)).toHaveLength(2);
  });
});
