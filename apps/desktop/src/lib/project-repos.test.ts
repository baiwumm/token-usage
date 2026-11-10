import { describe, expect, it } from "vitest";

import { isHttpUrl, parseProjectRepoMap } from "@/lib/project-repos";

describe("parseProjectRepoMap", () => {
  it("returns the confirmed http(s) entries", () => {
    const text = JSON.stringify({
      version: 1,
      confirmed: {
        "baiwumm/token-usage": "https://github.com/baiwumm/token-usage",
        "baiwumm/legacy": "https://gitee.com/baiwumm/legacy",
      },
    });

    expect(parseProjectRepoMap(text)).toEqual({
      "baiwumm/token-usage": "https://github.com/baiwumm/token-usage",
      "baiwumm/legacy": "https://gitee.com/baiwumm/legacy",
    });
  });

  it("drops non-http values and non-string keys", () => {
    const text = JSON.stringify({
      confirmed: {
        good: "https://github.com/o/n",
        file: "file:///etc/passwd",
        js: "javascript:alert(1)",
        malformed: "https://example.com/a b",
        number: 42,
        "": "https://github.com/empty/key",
      },
    });

    expect(parseProjectRepoMap(text)).toEqual({
      good: "https://github.com/o/n",
    });
  });

  it("degrades to an empty map for missing or corrupt input", () => {
    expect(parseProjectRepoMap(null)).toEqual({});
    expect(parseProjectRepoMap("{oops")).toEqual({});
    expect(parseProjectRepoMap("[]")).toEqual({});
    expect(parseProjectRepoMap('{"version":1}')).toEqual({});
    expect(parseProjectRepoMap('{"confirmed":[]}')).toEqual({});
  });
});

describe("isHttpUrl", () => {
  it("accepts http(s) only", () => {
    expect(isHttpUrl("https://github.com/a/b")).toBe(true);
    expect(isHttpUrl("http://localhost:3000/a")).toBe(true);
    expect(isHttpUrl("ftp://example.com")).toBe(false);
    expect(isHttpUrl("https://example.com/a\nb")).toBe(false);
  });
});
