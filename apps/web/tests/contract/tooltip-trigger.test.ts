// HeroUI Tooltip trigger guard (2026-11-05 browser QA follow-up; 2026-11-06
// adds the <Focusable> path).
//
// `<Tooltip>`'s root is react-aria's TooltipTrigger: hover / focus /
// aria-describedby travel through FocusableProvider -> FocusableContext, and
// it does NOT clone its children. A raw DOM element as the first child never
// consumes that context, so the tooltip silently never opens. Three
// context-aware wrappers work:
//
// - `Tooltip.Trigger` — calls useFocusable, renders a `dom.div` slot.
// - HeroUI `Button` / any react-aria component — consumes the context itself.
// - react-aria's `Focusable` (cloned child, no DOM of its own) — the escape
//   hatch when the DOM element must differ from Trigger's <div> or a <button>
//   (router <Link>, spans inside Description, the coin's native button).
//   Going through `render` instead is NOT an option: react-aria's DOMElement
//   dev-checks the element type and warns "Expected <div>/<button>, got <a>",
//   and HeroUI's Trigger is hard-wired to <div> regardless of its type
//   parameter.
//
// The overlay is a client-only portal, so this is a source-level guard rather
// than a renderToStaticMarkup assertion.

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

const FOCUSABLE_FILES = [
  "src/components/u/u-hero.tsx",
  "src/components/achievements/achievement-coin.tsx",
  "src/components/achievements/achievement-dialog.tsx",
  "src/components/app-shell/nav-items.tsx",
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
        trigger === "Tooltip.Trigger" ||
          trigger === "Button" ||
          trigger === "Focusable",
        `${file}: Tooltip root "${root[0]}" is followed by <${trigger}>`,
      ).toBe(true);
      expect(DOM_TRIGGERS.test(tail)).toBe(false);
    }
  });

  // The four files whose triggers are raw DOM elements (Link / span / button)
  // must bridge the context through <Focusable> — never through a `render`
  // prop on Button/Trigger (element-type mismatch warning).
  it.each(FOCUSABLE_FILES)(
    "%s bridges the tooltip context through <Focusable>",
    (file) => {
      const source = readFileSync(path.join(webRoot, file), "utf8");

      expect(source).toContain("<Focusable>");
      expect(source).not.toMatch(/render=\{\(props\) => </);
    },
  );
});
