import { describe, expect, it } from "vitest";

import {
  buildHeatmap,
  heatmapLevel,
  heatmapStartMs,
  HEATMAP_DAYS,
} from "@/lib/heatmap-helpers";
import { localDayKey } from "@/lib/queue-lines";

const NOW = Date.parse("2026-11-10T12:00:00.000Z");

describe("heatmap helpers", () => {
  it("lays out 12 Monday-aligned weeks ending on Sunday", () => {
    const { days } = buildHeatmap("", NOW);

    expect(days).toHaveLength(HEATMAP_DAYS);
    expect(new Set(days.map((day) => day.day)).size).toBe(HEATMAP_DAYS);
    expect(new Date(`${days[0]?.day}T00:00:00`).getDay()).toBe(1);
    expect(new Date(`${days[days.length - 1]?.day}T00:00:00`).getDay()).toBe(0);
  });

  it("starts 11 weeks before this week's Monday", () => {
    const today = new Date(NOW);
    const mondayThisWeek = new Date(NOW);

    mondayThisWeek.setHours(0, 0, 0, 0);
    mondayThisWeek.setDate(today.getDate() - ((today.getDay() + 6) % 7));

    const daysApart = Math.round(
      (mondayThisWeek.getTime() - heatmapStartMs(NOW)) / (24 * 3600e3),
    );

    expect(daysApart).toBe(11 * 7);
  });

  it("folds the queue into local days and leaves future cells empty", () => {
    const hourStart = new Date(NOW - 60_000).toISOString();
    const row = {
      source: "codex",
      model: "gpt-5",
      hour_start: hourStart,
      total_tokens: 500,
      conversation_count: 2,
    };
    const data = buildHeatmap(JSON.stringify(row), NOW);
    const key = localDayKey(Date.parse(hourStart));

    expect(data.days.find((entry) => entry.day === key)).toEqual({
      day: key,
      tokens: 500,
      conversations: 2,
    });
    expect(data.totalTokens).toBe(500);
    expect(data.maxTokens).toBe(500);
  });

  it("maps usage onto the five-step scale", () => {
    expect(heatmapLevel(0, 100)).toBe(0);
    expect(heatmapLevel(10, 100)).toBe(1);
    expect(heatmapLevel(25, 100)).toBe(1);
    expect(heatmapLevel(50, 100)).toBe(2);
    expect(heatmapLevel(75, 100)).toBe(3);
    expect(heatmapLevel(100, 100)).toBe(4);
    expect(heatmapLevel(5, 0)).toBe(1);
  });
});
