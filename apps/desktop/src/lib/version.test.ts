import { describe, expect, it } from "vitest";

import { bareVersion, compareVersions, parseVersion } from "@/lib/version";

describe("bareVersion", () => {
  it("strips a single v prefix and surrounding whitespace", () => {
    expect(bareVersion("v0.5.4")).toBe("0.5.4");
    expect(bareVersion(" V0.5.4 ")).toBe("0.5.4");
    expect(bareVersion("0.5.4")).toBe("0.5.4");
  });

  it("never produces the doubled vv prefix when the caller adds its own v", () => {
    // Regression for 0.2.1: the CLI version chip used to read `vv0.5.4`.
    expect(`v${bareVersion("v0.5.4")}`).toBe("v0.5.4");
    expect(`v${bareVersion("0.5.4")}`).toBe("v0.5.4");
  });
});

describe("parseVersion", () => {
  it("reads the numeric prefix only", () => {
    expect(parseVersion("v0.5.4")).toEqual([0, 5, 4]);
    expect(parseVersion("0.5.4-beta.1")).toEqual([0, 5, 4]);
    expect(parseVersion(" 1.2 ")).toEqual([1, 2]);
  });

  it("returns null for unparsable values", () => {
    expect(parseVersion("latest")).toBeNull();
    expect(parseVersion("")).toBeNull();
  });
});

describe("compareVersions", () => {
  it("orders dotted versions and treats missing segments as zero", () => {
    expect(compareVersions("0.5.4", "0.5.5")).toBe(-1);
    expect(compareVersions("0.6.0", "0.5.9")).toBe(1);
    expect(compareVersions("v0.5", "0.5.0")).toBe(0);
    expect(compareVersions("1.2.3", "1.2.3")).toBe(0);
  });

  it("never reports a false latest when either side is unparsable", () => {
    expect(compareVersions("latest", "0.5.4")).toBeNull();
    expect(compareVersions("0.5.4", "")).toBeNull();
  });
});
