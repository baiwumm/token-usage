// HeroUI Tooltip trigger guard (2026-11-05 browser QA follow-up).
//
// `<Tooltip>`'s root is react-aria's TooltipTrigger: hover / focus /
// aria-describedby travel through FocusableProvider -> FocusableContext, and
// it does NOT clone its children. A raw DOM element as the first child never
// consumes that context, so the tooltip silently never opens. Only
// `Tooltip.Trigger` (calls useFocusable) or a HeroUI `Button` (a react-aria
// component) works. The overlay is a client-only portal, so this is a
// source-level guard rather than a renderToStaticMarkup assertion.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const webRoot = path.resolve(__dirname, "../..");

const FILES = [
  "src/components/u/u-hero.tsx",
  "src/components/achievements/achievement-coin.tsx",
  "src/components/achievements/achievement-dialog.tsx",
  "src/components/achievements/achievements-client.tsx",
  "src/components/app-shell/nav-items.tsx",
  "src/components/dashboard/filter-bar.tsx",
];

// Root tag only: excludes `<Tooltip.Content>`, `<Tooltip.Arrow>`,
// `<Tooltip.Trigger>` and self-closing Recharts tooltips.
const ROOT = /<Tooltip(?=[\s>])[^>]*>/g;

const DOM_TRIGGERS = /^<(?:button|span|div|a)\b/;

describe("HeroUI Tooltip triggers (docs/badge.md §0)", () => {
  it.each(FILES)("%s uses context-aware triggers only", (file) => {
    const source = readFileSync(path.join(webRoot, file), "utf8");
    const roots = [...source.matchAll(ROOT)].filter(
      ([tag]) => !tag.endsWith("/>"),
    );

    expect(roots.length).toBeGreaterThan(0);

    for (const root of roots) {
      const tail = source.slice((root.index ?? 0) + root[0].length).trimStart();
      const trigger = /^<([A-Za-z][\w.]*)/.exec(tail)?.[1] ?? "expression";

      expect(
        trigger === "Tooltip.Trigger" || trigger === "Button",
        `${file}: Tooltip root "${root[0]}" is followed by <${trigger}>`,
      ).toBe(true);
      expect(DOM_TRIGGERS.test(tail)).toBe(false);
    }
  });

  it.each([
    "src/components/u/u-hero.tsx",
    "src/components/achievements/achievement-coin.tsx",
    "src/components/achievements/achievement-dialog.tsx",
  ])("%s renders its DOM trigger through Tooltip.Trigger", (file) => {
    const source = readFileSync(path.join(webRoot, file), "utf8");

    expect(source).toContain("Tooltip.Trigger");
  });
});
