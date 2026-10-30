// Copy guard for /achievements: every catalog key (names, descriptions, tier
// labels, coverage notes) must exist in both locales, both dictionaries must
// carry the same keys, and no id-shaped key may name an achievement the
// catalog does not have. Keeps a renamed id from shipping a raw key.

import { describe, expect, it } from "vitest";

import {
  ACHIEVEMENTS,
  ACHIEVEMENT_COPY_KEYS,
  ACHIEVEMENT_CATEGORIES,
} from "@/lib/achievements/catalog";
import { ACHIEVEMENTS_COPY } from "@/lib/copy/achievements";

const LOCALES = ["zh", "en"] as const;

describe("achievements copy", () => {
  it.each(LOCALES)("covers every catalog key in %s", (locale) => {
    const dictionary = ACHIEVEMENTS_COPY[locale];

    for (const key of ACHIEVEMENT_COPY_KEYS) {
      expect(dictionary[key]?.trim(), `${locale} ${key}`).toBeTruthy();
    }
  });

  it("covers every category label", () => {
    for (const locale of LOCALES) {
      for (const category of ACHIEVEMENT_CATEGORIES) {
        expect(
          ACHIEVEMENTS_COPY[locale][`achievements.ui.category.${category}`],
        ).toBeTruthy();
      }
    }
  });

  it("keeps both locales on the same key set", () => {
    expect(Object.keys(ACHIEVEMENTS_COPY.en).sort()).toEqual(
      Object.keys(ACHIEVEMENTS_COPY.zh).sort(),
    );
  });

  it("never defines copy for an unknown achievement id", () => {
    const known = new Set(ACHIEVEMENTS.map((achievement) => achievement.id));

    for (const key of Object.keys(ACHIEVEMENTS_COPY.zh)) {
      const match = /^achievements\.([a-z_]+)\.(name|description)$/.exec(key);

      if (match) expect(known.has(match[1]), key).toBe(true);
    }
  });
});
