// Unit tests for the server/client locale primitives (lib/copy/locale-config.ts).

import { describe, expect, it } from "vitest";

import { htmlLangFor, resolveLocale } from "@/lib/copy/locale-config";

describe("resolveLocale", () => {
  it("prefers a valid stored cookie over Accept-Language", () => {
    expect(resolveLocale("en", "zh-CN,zh;q=0.9")).toBe("en");
    expect(resolveLocale("zh", "en-US,en;q=0.9")).toBe("zh");
  });

  it("ignores unknown stored values", () => {
    expect(resolveLocale("fr", "zh-CN,zh;q=0.9")).toBe("zh");
    expect(resolveLocale(undefined, null)).toBe("en");
  });

  it("matches Chinese from the first Accept-Language entry", () => {
    expect(resolveLocale(null, "zh-Hans-CN,zh;q=0.9,en;q=0.8")).toBe("zh");
    expect(resolveLocale(null, "en-US,en;q=0.9,zh;q=0.8")).toBe("en");
  });

  it("handles malformed or missing headers", () => {
    expect(resolveLocale(null, "")).toBe("en");
    // Empty list entries are skipped, so the next tag still wins.
    expect(resolveLocale(null, " ,zh-CN")).toBe("zh");
    expect(resolveLocale(null, "garbage")).toBe("en");
    expect(resolveLocale(null, undefined)).toBe("en");
  });
});

describe("htmlLangFor", () => {
  it("maps zh/en to BCP 47 tags", () => {
    expect(htmlLangFor("zh")).toBe("zh-CN");
    expect(htmlLangFor("en")).toBe("en");
  });
});
