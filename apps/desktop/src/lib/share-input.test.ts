import { describe, expect, it } from "vitest";

import { buildMonitorSnapshot } from "@/lib/monitor";
import { buildShareInput } from "@/lib/share-input";

const NOW = Date.parse("2026-11-08T12:00:00.000Z");

function queueRow(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    source: "codex",
    model: "deepseek-v4-flash",
    hour_start: "2026-11-08T01:00:00.000Z",
    total_tokens: 150,
    input_tokens: 100,
    cached_input_tokens: 30,
    cache_creation_input_tokens: 0,
    output_tokens: 20,
    conversation_count: 2,
    ...overrides,
  });
}

function snapshotWithQueue(queue: string) {
  return buildMonitorSnapshot(
    {
      queue,
      pause: null,
      queueState: null,
      syncLog: null,
      projectRepos: null,
    },
    { available: true, version: "0.5.5" },
    null,
    NOW,
  );
}

describe("buildShareInput", () => {
  it("projects the usage window into the share-card shape", () => {
    const snapshot = snapshotWithQueue(
      `${queueRow()}\n${queueRow({ source: "claude", model: "glm-5.3", hour_start: "2026-11-07T01:00:00.000Z", total_tokens: 850, input_tokens: 500, cached_input_tokens: 250, output_tokens: 100, conversation_count: 1 })}\n`,
    );
    const input = buildShareInput({
      hostname: "PC-1",
      period: "7d",
      snapshot,
    });

    expect(input).not.toBeNull();
    expect(input?.handle).toBe("PC-1");
    expect(input?.heroTokensFull).toBe("1,000");
    // Sources and models are ranked desc with pre-formatted shares.
    expect(input?.models[0]).toMatchObject({ name: "glm-5.3" });
    expect(input?.models[0]?.share).toContain("%");
    expect(input?.sources.length).toBe(2);
    expect(input?.topModelName).toBe("glm-5.3");
    expect(input?.topSourceName).toBe("claude");
    // The heatmap grid keeps its full-year shape regardless of the period.
    expect(input?.heatmap?.weeks.length).toBeGreaterThan(50);
    expect(input?.locale).toBe("zh");
    expect(input?.tickLabel).toContain("UTC");
  });

  it("labels presets with a date range and 总计 with the year", () => {
    const snapshot = snapshotWithQueue(`${queueRow()}\n`);
    const preset = buildShareInput({ hostname: null, period: "7d", snapshot });
    const all = buildShareInput({ hostname: null, period: "all", snapshot });

    expect(preset?.periodLabel).toContain("—");
    expect(all?.periodLabel).toBe("2026");
    // A null hostname falls back to the product name.
    expect(preset?.handle).toBe("Token Usage");
  });

  it("returns null when the window has nothing to share", () => {
    const snapshot = snapshotWithQueue(
      `${queueRow({ hour_start: "2026-10-01T01:00:00.000Z" })}\n`,
    );
    const today = buildShareInput({
      hostname: "PC-1",
      period: "today",
      snapshot,
    });

    expect(today).toBeNull();
    // …but 总计 still sees the older row.
    expect(
      buildShareInput({ hostname: "PC-1", period: "all", snapshot }),
    ).not.toBeNull();
  });
});
