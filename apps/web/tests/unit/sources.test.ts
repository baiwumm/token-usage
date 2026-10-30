// Unit tests for the source/model identity maps (@/lib/sources). The logo
// lookup feeds SourceIcon, so a missing canonical rule shows a letter tile
// instead of the brand mark.

import { describe, expect, it } from "vitest";

import {
  canonicalSource,
  modelLogoFile,
  sourceDisplayLabel,
  sourceLogoFile,
} from "@/lib/sources";

describe("canonicalSource", () => {
  it("maps aliased source ids onto their canonical id", () => {
    expect(canonicalSource("claude-code")).toBe("claude");
    expect(canonicalSource("pi-stepfun")).toBe("pi");
    expect(canonicalSource("command_code")).toBe("command-code");
  });

  it("folds MiniMax source ids onto the minimax id", () => {
    expect(canonicalSource("minimax-code")).toBe("minimax");
    expect(canonicalSource("MiniMax")).toBe("minimax");
  });
});

describe("source logo and label", () => {
  it("resolves the MiniMax mark and display label", () => {
    expect(sourceLogoFile("minimax-code")).toBe("/brand-logos/minimax.svg");
    expect(sourceDisplayLabel("minimax-code")).toBe("MiniMax");
  });

  it("returns null for sources without a shipped logo", () => {
    expect(sourceLogoFile("totally-unknown-cli")).toBeNull();
  });
});

describe("modelLogoFile", () => {
  it("resolves vendor marks from the model id", () => {
    expect(modelLogoFile("MiniMax-M3.1-Flash")).toBe("/brand-logos/minimax.svg");
    expect(modelLogoFile("deepseek-v4.1-flash-free")).toBe(
      "/brand-logos/deepseek.svg",
    );
  });

  it("returns null when no vendor mark matches", () => {
    expect(modelLogoFile("custom_model")).toBeNull();
  });
});
