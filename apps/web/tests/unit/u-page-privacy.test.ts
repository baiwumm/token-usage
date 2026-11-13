// Public page rendered-markup assertions (docs/badge.md §6, §9).
// Render UBody on the server with a fake all-time payload: the heatmap and
// achievement wall are always present, both breakdown columns have five
// aligned rows, all unlocked badges are listed, and no 30-day / repository
// content or token ever reaches the HTML.

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/copy/locale", () => ({
  useLocale: () => ["en", () => {}],
}));
vi.mock("@/components/flow-number", () => ({
  FlowNumber: ({ text }: { text: string }) => createElement("span", null, text),
}));
vi.mock("@/lib/format/format", () => ({
  useFormat: () => ({
    formatTokens: (value: number) => String(value),
    formatPercent: (ratio: number) => `${Math.round(ratio * 100)}%`,
  }),
}));
vi.mock("@/components/achievement-dialog", () => ({
  AchievementDialog: () => null,
}));

import { formatPublicPeriodRange } from "@/components/u/u-format";
import { UBody } from "@/components/u/u-body";
import type { BadgeData } from "@/lib/badge/types";
import type { HeatmapPayload } from "@/lib/dashboard/api";
import type { PublicPageData } from "@/lib/public-page/types";

const account = {
  scope: "user",
  project: null,
  displayName: "Ming Wei",
  range: "all",
  totals: { tokens: 1000, costUsd: 12.5, activeDays: 2 },
  sources: Array.from({ length: 5 }, (_, index) => ({
    key: `source-${index}`,
    label: `Source ${index}`,
    tokens: 1000 - index * 100,
    share: (1000 - index * 100) / 1000,
  })),
  models: Array.from({ length: 5 }, (_, index) => ({
    key: `model-${index}`,
    label: `Model ${index}`,
    tokens: 900 - index * 100,
  })),
  series: [],
} as unknown as BadgeData;

const heatmap = {
  from: "2025-01-01",
  to: "2025-12-31",
  week_starts_on: "mon",
  active_days: 2,
  streak_days: 0,
  weeks: [],
  total_cost_usd: 1,
} as HeatmapPayload;

function makeData(overrides: Partial<PublicPageData> = {}): PublicPageData {
  return {
    account,
    meta: {
      firstDay: "2025-01-01",
      lastDay: "2025-01-03",
      updatedAt: "2025-01-03T12:00:00.000Z",
      sourceCount: 5,
      modelCount: 5,
      longestStreakDays: 1,
      peakDay: { day: "2025-01-01", tokens: 600 },
    },
    avatarDataUri: "data:image/png;base64,AAAA",
    timezone: "Asia/Shanghai",
    heatmap,
    achievements: Array.from({ length: 8 }, (_, index) => ({
      id: `token_titan_${index}`,
      category: "milestone",
      unit: "tokens",
      tier: 3,
      value: 123456,
      thresholds: [1, 2, 3, 4, 5],
      next_threshold: 6,
      achieved_at: {},
    })) as unknown as PublicPageData["achievements"],
    modelCosts: {
      "model-0": 12.5,
      "model-1": 0,
    },
    ...overrides,
  };
}

function render(data: PublicPageData): string {
  return renderToStaticMarkup(createElement(UBody, { data }));
}

describe("/u/<token> rendered markup (docs/badge.md §6)", () => {
  it("shows the avatar, all-time identity and both always-on sections", () => {
    const html = render(makeData());

    expect(html).toContain("Ming Wei");
    // HeroUI Avatar renders its fallback during SSR and swaps in the image
    // after hydration (Radix image-loading status is client-only).
    expect(html).toContain('data-slot="avatar-fallback"');
    expect(html).toContain("/logo.svg");
    expect(html).toContain("/logo-dark.svg");
    // HeroUI outline Button opens the repo on press (same pattern as the
    // app shell's GitHub action), so no href is present in the markup.
    expect(html).toContain('aria-label="GitHub"');
    expect(html).toContain("button--outline");
    // Compact scope line: "All-time data · Updated …" instead of the long
    // "All time · 2025/… → … · Updated …". The date range now lives in a
    // HeroUI Tooltip (client-only portal), so SSR markup has just the
    // trigger span — no native title attribute.
    expect(html).toContain("All-time data");
    expect(html).toContain("Updated");
    expect(html).not.toContain("All time ·");
    // <Focusable> is mandatory: react-aria passes hover/focus props via
    // FocusableContext onto the cloned child span, so the SSR markup is a
    // focusable role="button". Attribute order follows the prop merge, so
    // assert the pieces separately.
    expect(html).toContain('role="button"');
    expect(html).toContain('tabindex="0"');
    expect(html).toContain(">All-time data</span>");
    expect(html).not.toContain('title="01/01/2025');
    expect(html).toContain("Activity heatmap");
    expect(html).toContain("Achievements");
    expect(html).not.toContain("Last 30 days");
    expect(html).not.toContain("30 days");
    expect(html).not.toContain("Repositories");
  });

  it("renders five aligned rows in each breakdown column and every badge", () => {
    const html = render(makeData());
    const alignedRows = html.match(/min-h-14/g) ?? [];
    const badges = html.match(/u-medallion(?=[\s"])/g) ?? [];

    expect(alignedRows).toHaveLength(10);
    expect(badges).toHaveLength(8);
    // Both columns must share one identical row class, otherwise the source
    // Meter shifts its text line half a bar-height above the model text.
    const rowClasses = html.match(/class="[^"]*min-h-14[^"]*"/g) ?? [];

    expect(rowClasses).toHaveLength(10);
    expect(new Set(rowClasses).size).toBe(1);
    expect((html.match(/absolute inset-x-0 bottom-2/g) ?? [])).toHaveLength(5);
    // HeroUI Button + Tailwind group hover instead of a raw <button>/CSS rule.
    expect(html).toContain("button--ghost");
    expect(html).toContain("group-hover:-translate-y-1");
    expect(html).toContain("Source 4");
    expect(html).toContain("Model 4");
    // Models show "tokens · cost"; the cost note is a full-width line.
    expect(html).toContain("$12.50");
    expect(html).toContain("$0.00");
    // The standalone cost note was removed; the footer still explains pricing.
    expect(html).not.toContain("Estimated with read-time pricing");
  });

  it("states the actual public scope in the footer", () => {
    const html = render(makeData());

    expect(html).toContain("per-source breakdowns");
    expect(html).toContain("full details of unlocked achievements");
    expect(html).toContain("device identifiers");
    expect(html).not.toContain("repository");
  });

  it("never puts the token or user id in the markup", () => {
    const html = render(makeData());

    expect(html).not.toContain("tu_badge_");
    expect(html).not.toContain("user_id");
  });
});

// Tooltip content renders through a client-only portal, so it cannot be
// asserted from static markup. Test the payload itself instead.
describe("scope Tooltip payload (docs/badge.md §6)", () => {
  it("formats both day keys in UTC and skips an incomplete range", () => {
    expect(
      formatPublicPeriodRange(
        "{first} → {last}",
        "en",
        "2025-01-01",
        "2025-01-03",
      ),
    ).toBe("01/01/2025 → 01/03/2025");
    expect(
      formatPublicPeriodRange(
        "{first} → {last}",
        "zh",
        "2025-01-01",
        "2025-01-03",
      ),
    ).toBe("2025/01/01 → 2025/01/03");
    expect(
      formatPublicPeriodRange(
        "{first} → {last}",
        "en",
        null,
        "2025-01-03",
      ),
    ).toBeNull();
  });
});
