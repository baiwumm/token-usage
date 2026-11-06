// Regression test for the weekday drift in the dashboard heatmap
// (2026-11-05 operator report: "today always lands on the Sunday row").
//
// Padding cells used to return null, so CSS grid auto-flow pulled every later
// cell forward and the 7 weekday rows no longer matched the ruler. They must
// render an inert placeholder that still occupies a grid slot.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/format/format", () => ({
  useFormat: () => ({
    formatTokens: (value: number) => String(value),
    formatPercent: (ratio: number) => `${Math.round(ratio * 100)}%`,
  }),
}));

import { HeatmapCard } from "@/components/heatmap-card";
import type { HeatmapPayload } from "@/lib/dashboard/api";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";

function cell(day: string, total: number) {
  return {
    day,
    total_tokens: total,
    billable_total_tokens: total,
    level: total > 0 ? 2 : 0,
    models: null,
    sources: total > 0 ? { codex: total } : null,
  };
}

/** 14 consecutive days starting on a Wednesday → 2 leading + 5 trailing pads. */
const days = Array.from({ length: 14 }, (_, index) =>
  new Date(Date.UTC(2026, 9, 28) + index * 86_400_000)
    .toISOString()
    .slice(0, 10),
);
const cells = days.map((day, index) => cell(day, index % 3 === 0 ? 100 : 0));
const payload: HeatmapPayload = {
  from: days[0],
  to: days[days.length - 1],
  week_starts_on: "mon",
  active_days: 5,
  streak_days: 0,
  weeks: [cells.slice(0, 7), cells.slice(7, 14)],
  total_cost_usd: 0,
};

describe("dashboard heatmap weekday alignment", () => {
  it("renders every real cell plus inert padding placeholders", () => {
    const html = renderToStaticMarkup(
      createElement(HeatmapCard, {
        payload,
        copy: DASHBOARD_COPY.en,
        locale: "en",
        timezone: "UTC",
        hideFilter: true,
      }),
    );
    const realCells = html.match(/data-day="/g) ?? [];
    const pads = html.match(/aria-hidden="true"[^>]*height:15px/g) ?? [];

    // 14 real days + 7 padding slots = 3 full Mon-start columns of 7.
    expect(realCells).toHaveLength(14);
    expect(pads).toHaveLength(7);
    expect(html).toContain(`data-day="${days[0]}"`);
    expect(html).toContain(`data-day="${days[days.length - 1]}"`);
  });
});
