import { describe, expect, it } from "vitest";

import { webUrl } from "@/lib/links";

describe("webUrl", () => {
  it("joins every known page onto the dashboard base", () => {
    const base = "https://token-usage.example.com";

    expect(webUrl(base, "dashboard")).toBe(`${base}/`);
    expect(webUrl(base, "projects")).toBe(`${base}/projects`);
    expect(webUrl(base, "sessions")).toBe(`${base}/sessions`);
    expect(webUrl(base, "achievements")).toBe(`${base}/achievements`);
  });

  it("normalizes trailing slashes and surrounding whitespace", () => {
    expect(webUrl(" https://example.com/// ", "projects")).toBe(
      "https://example.com/projects",
    );
  });

  it("returns null for missing or unusable bases", () => {
    expect(webUrl(null, "projects")).toBeNull();
    expect(webUrl("", "projects")).toBeNull();
    expect(webUrl("ftp://example.com", "projects")).toBeNull();
    expect(webUrl("https://exa mple.com", "projects")).toBeNull();
  });
});
