import { describe, expect, it } from "vitest";

import {
  canonicalSource,
  darkLogoFile,
  groupSourceUsage,
  modelLogoFile,
  sourceDisplayLabel,
  sourceLogoFile,
  tileColorFor,
} from "@/lib/source-logos";

describe("canonicalSource", () => {
  it("folds collector aliases into the canonical id", () => {
    expect(canonicalSource("trae-cn")).toBe("trae");
    expect(canonicalSource("qoder-cn")).toBe("qoder");
    expect(canonicalSource("claude-code")).toBe("claude");
    expect(canonicalSource("minimax-code")).toBe("minimax");
    expect(canonicalSource("workbuddy")).toBe("workbuddy");
    expect(canonicalSource("")).toBe("unknown");
  });
});

describe("sourceDisplayLabel / sourceLogoFile", () => {
  it("maps canonical ids to display labels and logo files", () => {
    expect(sourceDisplayLabel("zcode")).toBe("ZCode");
    expect(sourceDisplayLabel("dsh")).toBe("DeepSeek Harness");
    expect(sourceLogoFile("trae-cn")).toBe("/brand-logos/trae.svg");
    expect(sourceLogoFile("dsh")).toBe("/brand-logos/deepseek.svg");
    expect(sourceLogoFile("mystery-cli")).toBe(null);
  });

  it("only hands out dark twins that are registered", () => {
    expect(darkLogoFile("/brand-logos/codex.svg")).toBe(
      "/brand-logos/codex-dark.svg",
    );
    expect(darkLogoFile("/brand-logos/gemini.svg")).toBe(null);
    expect(darkLogoFile("/brand-logos/missing.svg")).toBe(null);
  });
});

describe("modelLogoFile", () => {
  it("picks the vendor mark by model prefix", () => {
    expect(modelLogoFile("claude-sonnet-4")).toBe(
      "/brand-logos/claude-code.svg",
    );
    expect(modelLogoFile("DeepSeek-V4")).toBe("/brand-logos/deepseek.svg");
    expect(modelLogoFile("glm-5")).toBe("/brand-logos/zcode.svg");
    expect(modelLogoFile("k3-256k")).toBe("/brand-logos/kimi.svg");
    expect(modelLogoFile("doubao-seed")).toBe("/brand-logos/volcano-ark.svg");
  });

  it("returns null for unknown or empty model ids", () => {
    expect(modelLogoFile("mystery-model")).toBe(null);
    expect(modelLogoFile("")).toBe(null);
  });
});

describe("tileColorFor", () => {
  it("is deterministic per label and stays in the palette", () => {
    expect(tileColorFor("mystery")).toBe(tileColorFor("mystery"));
    expect(tileColorFor("a")).not.toBe("");
  });
});

describe("groupSourceUsage", () => {
  const row = (source: string, tokens: number, conversations = 1) => ({
    source,
    tokens,
    conversations,
    share: 0,
  });

  it("merges alias rows and recomputes shares against the window total", () => {
    const grouped = groupSourceUsage([
      row("trae", 600, 2),
      row("workbuddy", 300, 1),
      row("trae-cn", 100, 1),
    ]);

    expect(grouped.map((entry) => [entry.source, entry.tokens])).toEqual([
      ["trae", 700],
      ["workbuddy", 300],
    ]);
    expect(grouped[0].share).toBeCloseTo(0.7, 10);
    expect(grouped[1].share).toBeCloseTo(0.3, 10);
    expect(grouped[0].conversations).toBe(3);
  });

  it("sorts by tokens descending and survives an empty window", () => {
    const grouped = groupSourceUsage([row("codex", 10), row("zcode", 50)]);

    expect(grouped.map((entry) => entry.source)).toEqual(["zcode", "codex"]);
    expect(groupSourceUsage([])).toEqual([]);
  });
});
