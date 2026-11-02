// Spec-first golden tests for the badge SVG renderer (docs/badge.md §5).
// The module lands with P2; while it is absent the suite skips itself (see
// tests/helpers/spec-first.ts) so `pnpm verify` stays green. The fixtures are
// the canonical ones from docs/badge.md appendix A — the implementation must
// satisfy these assertions unchanged, and the byte-level snapshots land with
// the P2 implementation for operator review.

import { describe, expect, it } from "vitest";

import { loadSpecModule, unwrapSpecModule } from "../helpers/spec-first";

type BadgeStyle = "panel" | "compact" | "sparkline";
type BadgeTheme = "dark" | "light" | "auto";

type BadgeData = {
  scope: "user" | "repo";
  project: string | null;
  displayName: string;
  range: "all" | "30d";
  totals: { tokens: number; costUsd: number; activeDays: number };
  sources: { key: string; label: string; tokens: number; share: number }[];
  models: { key: string; label: string; tokens: number }[];
  series: number[];
};

type RenderModule = {
  renderBadgeSvg: (data: BadgeData, options: { style: BadgeStyle; theme: BadgeTheme }) => string;
};

const render = await loadSpecModule<RenderModule>("../../src/lib/badge/render");

// docs/badge.md appendix A — canonical fixture A ("seasoned account").
const fixtureA: BadgeData = {
  scope: "user",
  project: null,
  displayName: "Ming Wei",
  range: "all",
  totals: { tokens: 18480000000, costUsd: 1318.4, activeDays: 214 },
  sources: [
    { key: "codex", label: "Codex", tokens: 18480000000, share: 1 },
    { key: "cursor", label: "Cursor", tokens: 0, share: 0 },
  ],
  models: [
    { key: "gpt-5.2-codex", label: "GPT-5.2 Codex", tokens: 12000000000 },
    { key: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", tokens: 6480000000 },
  ],
  series: [0, 120000, 480000, 0, 96000],
};

// docs/badge.md appendix A — canonical fixture B ("new repo", zero sessions:
// a normal render, not a fallback, per §2.3).
const fixtureB: BadgeData = {
  scope: "repo",
  project: "fresh-repo",
  displayName: "Ming Wei",
  range: "all",
  totals: { tokens: 0, costUsd: 0, activeDays: 0 },
  sources: [],
  models: [],
  series: [],
};

function renderA(style: BadgeStyle, theme: BadgeTheme): string {
  const { renderBadgeSvg } = unwrapSpecModule(render, "lib/badge/render");
  return renderBadgeSvg(fixtureA, { style, theme });
}

describe.skipIf(!render)("badge svg renderer (docs/badge.md §5)", () => {
  it("is deterministic — identical input yields byte-identical output (§5.1)", () => {
    expect(renderA("panel", "dark")).toBe(renderA("panel", "dark"));
    expect(renderA("compact", "light")).toBe(renderA("compact", "light"));
    expect(renderA("sparkline", "auto")).toBe(renderA("sparkline", "auto"));
  });

  it("panel (user) shows the three stat slots, brand mark and formatted numbers (§5.2)", () => {
    const svg = renderA("panel", "dark");

    expect(svg).toContain("<svg");
    expect(svg).toContain("TOKEN USAGE");
    expect(svg).toContain("Ming Wei");
    expect(svg).toContain("TOTAL USAGE");
    expect(svg).toContain("TOKENS");
    expect(svg).toContain("COST");
    expect(svg).toContain("ACTIVE DAYS");
    expect(svg).toContain("18.48B");
    expect(svg).toContain("$1,318.40");
    expect(svg).toContain("214");
    expect(svg).toContain("TOP SOURCES");
    expect(svg).toContain("Codex");
    expect(svg).toContain("100%");
  });

  it("panel (repo) switches the right block to TOP MODELS and shows the project (§5.2)", () => {
    const { renderBadgeSvg } = unwrapSpecModule(render, "lib/badge/render");
    const svg = renderBadgeSvg(fixtureB, { style: "panel", theme: "dark" });

    expect(svg).toContain("TOP MODELS");
    expect(svg).not.toContain("TOP SOURCES");
    expect(svg).toContain("fresh-repo");
    // Zero-session repo renders zeros — a normal badge, not a fallback (§2.3).
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("undefined");
  });

  it("compact is the single-line 20px double-segment badge (§5.3)", () => {
    const svg = renderA("compact", "dark");

    expect(svg).toContain('height="20"');
    expect(svg).toContain("token usage");
    expect(svg).toContain("18.48B");
    expect(svg).toContain("$1,318.40");
  });

  it("sparkline embeds a polyline of the daily series (§5.4)", () => {
    const svg = renderA("sparkline", "dark");

    expect(svg).toContain("<polyline");
  });

  it("theme dark/light use the static palettes without a media query (§5.5)", () => {
    expect(renderA("panel", "dark")).toContain("#7c8cff");
    expect(renderA("panel", "light")).toContain("#4f46e5");
    expect(renderA("panel", "dark")).not.toContain("prefers-color-scheme");
    expect(renderA("panel", "light")).not.toContain("prefers-color-scheme");
  });

  it("theme auto embeds the prefers-color-scheme media query (§5.5)", () => {
    const svg = renderA("panel", "auto");

    expect(svg).toContain("prefers-color-scheme: dark");
    expect(svg).toContain("#7c8cff");
    expect(svg).toContain("#4f46e5");
  });

  it("escapes XML-special text and never emits it raw (§5.1)", () => {
    const { renderBadgeSvg } = unwrapSpecModule(render, "lib/badge/render");
    const svg = renderBadgeSvg(
      { ...fixtureB, project: 'a<b>&"c' },
      { style: "panel", theme: "dark" },
    );

    expect(svg).toContain("&lt;b&gt;&amp;&quot;c");
    expect(svg).not.toContain("<b>");
  });

  it("truncates project display at 24 characters with an ellipsis (§5.1)", () => {
    const { renderBadgeSvg } = unwrapSpecModule(render, "lib/badge/render");
    const long = "p".repeat(40);
    const svg = renderBadgeSvg(
      { ...fixtureB, project: long },
      { style: "panel", theme: "dark" },
    );

    expect(svg).toContain("…");
    expect(svg).not.toContain(long);
  });

  it("keeps output free of scripts, external references and broken numbers (§5.1)", () => {
    for (const style of ["panel", "compact", "sparkline"] as const) {
      for (const theme of ["dark", "light", "auto"] as const) {
        const svg = renderA(style, theme);
        expect(svg).not.toContain("<script");
        // The SVG namespace declaration is an identifier that is never
        // fetched — without it browsers refuse to decode the image (operator
        // call 2026-11-02); any other http:// reference is still forbidden.
        expect(svg.replace('xmlns="http://www.w3.org/2000/svg"', "")).not.toContain("http://");
        expect(svg).not.toContain("https://");
        expect(svg).not.toContain("NaN");
        expect(svg).not.toContain("undefined");
      }
    }
  });

  it("falls back to AI Coding Usage when the display-name snapshot is empty (§5.2)", () => {
    const { renderBadgeSvg } = unwrapSpecModule(render, "lib/badge/render");
    const svg = renderBadgeSvg(
      { ...fixtureA, displayName: "" },
      { style: "panel", theme: "dark" },
    );

    expect(svg).toContain("AI Coding Usage");
  });

  it("pins byte-level goldens for every style × theme on fixture A", () => {
    for (const style of ["panel", "compact", "sparkline"] as const) {
      for (const theme of ["dark", "light", "auto"] as const) {
        expect(renderA(style, theme)).toMatchSnapshot(
          `badge-${style}-${theme}`,
        );
      }
    }
  });
});
