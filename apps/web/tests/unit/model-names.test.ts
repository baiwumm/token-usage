// Unit tests for the model display grouping (2026-10-31 口径): casing drift
// across collectors must not split one model into two rows.

import { describe, expect, it } from "vitest";

import { ModelDisplayName, modelGroupKey } from "@/lib/model-names";

describe("modelGroupKey", () => {
  it("folds casing and trims", () => {
    expect(modelGroupKey("GLM-5.3-Flash")).toBe("glm-5.3-flash");
    expect(modelGroupKey("  glm-5.3-flash ")).toBe("glm-5.3-flash");
  });

  it("falls back to unknown for empty ids", () => {
    expect(modelGroupKey("")).toBe("unknown");
    expect(modelGroupKey("   ")).toBe("unknown");
  });
});

describe("ModelDisplayName", () => {
  it("resolves the variant that carried the most tokens", () => {
    const picker = new ModelDisplayName();

    picker.add("glm-5.3-flash", 945_574_134);
    picker.add("GLM-5.3-Flash", 12_064_251_323);

    expect(picker.resolve()).toBe("GLM-5.3-Flash");
  });

  it("keeps the first-seen spelling on an exact tie", () => {
    const picker = new ModelDisplayName();

    picker.add("GLM-5.3", 100);
    picker.add("glm-5.3", 100);

    expect(picker.resolve()).toBe("GLM-5.3");
  });

  it("accumulates per variant instead of counting calls", () => {
    const picker = new ModelDisplayName();

    picker.add("glm-5.3", 10);
    picker.add("glm-5.3", 10);
    picker.add("GLM-5.3", 15);
    // glm-5.3 sums to 20 and must beat the single 15-token GLM-5.3 call.
    expect(picker.resolve()).toBe("glm-5.3");

    picker.add("GLM-5.3", 15);
    // Now GLM-5.3 sums to 30 and takes over.
    expect(picker.resolve()).toBe("GLM-5.3");
  });

  it("defaults to unknown when nothing was added", () => {
    expect(new ModelDisplayName().resolve()).toBe("unknown");
  });
});
