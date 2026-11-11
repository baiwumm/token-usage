import type { ProjectUsage } from "@/lib/queue-lines";

import { describe, expect, it } from "vitest";

import {
  isHttpUrl,
  mergeProjectsByRepo,
  parseProjectRepoMap,
  repoAliasIndex,
  repoName,
  resolveProjectRepo,
} from "@/lib/project-repos";

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

describe("repoName / repoAliasIndex / resolveProjectRepo", () => {
  const urls = {
    "baiwumm/token-usage": "https://github.com/baiwumm/token-usage",
    "baiwumm/margin": "https://github.com/baiwumm/margin",
    "baiwumm/TokenTracker": "https://github.com/baiwumm/TokenTracker",
  };

  it("takes the last path segment of keys and URLs", () => {
    expect(repoName("baiwumm/token-usage")).toBe("token-usage");
    expect(repoName("https://github.com/baiwumm/token-usage/")).toBe(
      "token-usage",
    );
    expect(repoName("https://github.com/baiwumm")).toBe("baiwumm");
    expect(repoName("")).toBe("");
  });

  it("resolves both the confirmed key and the bare basename", () => {
    const index = repoAliasIndex(urls);

    expect(resolveProjectRepo("baiwumm/token-usage", index)).toBe(
      urls["baiwumm/token-usage"],
    );
    expect(resolveProjectRepo("token-usage", index)).toBe(
      urls["baiwumm/token-usage"],
    );
    expect(resolveProjectRepo("TokenTracker", index)).toBe(
      urls["baiwumm/TokenTracker"],
    );
    expect(resolveProjectRepo("unknown", index)).toBe(null);
  });
});

describe("mergeProjectsByRepo", () => {
  const row = (
    projectKey: string,
    tokens: number,
    conversations = 1,
  ): ProjectUsage => ({
    projectKey,
    tokens,
    conversations,
    share: 0,
    totalCostUsd: 0,
    lastActiveMs: null,
    sourceTokens: {},
  });
  const urls = {
    "baiwumm/token-usage": "https://github.com/baiwumm/token-usage",
    "baiwumm/margin": "https://github.com/baiwumm/margin",
  };

  it("folds basename and owner/name rows of one repository into one row", () => {
    const merged = mergeProjectsByRepo(
      [
        row("token-usage", 600, 3),
        row("baiwumm/token-usage", 200, 1),
        row("margin", 100, 1),
        row("local-only", 50, 1),
      ],
      urls,
      1_000,
    );

    expect(merged).toEqual([
      {
        projectKey: "token-usage",
        tokens: 800,
        conversations: 4,
        share: 0.8,
        totalCostUsd: 0,
        lastActiveMs: null,
        sourceTokens: {},
        repoUrl: urls["baiwumm/token-usage"],
        memberKeys: ["token-usage", "baiwumm/token-usage"],
      },
      {
        projectKey: "margin",
        tokens: 100,
        conversations: 1,
        share: 0.1,
        totalCostUsd: 0,
        lastActiveMs: null,
        sourceTokens: {},
        repoUrl: urls["baiwumm/margin"],
        memberKeys: ["margin"],
      },
      {
        projectKey: "local-only",
        tokens: 50,
        conversations: 1,
        share: 0.05,
        totalCostUsd: 0,
        lastActiveMs: null,
        sourceTokens: {},
        repoUrl: null,
        memberKeys: ["local-only"],
      },
    ]);
  });

  it("keeps shares on the window total and tolerates an empty window", () => {
    const merged = mergeProjectsByRepo([row("margin", 250)], urls, 1_000);

    expect(merged[0]?.share).toBe(0.25);
    expect(mergeProjectsByRepo([], urls, 0)).toEqual([]);
  });

  it("names a merged row from the repository when only owner/name rows exist", () => {
    const merged = mergeProjectsByRepo(
      [row("baiwumm/token-usage", 10)],
      urls,
      10,
    );

    expect(merged[0]?.projectKey).toBe("token-usage");
  });
});
