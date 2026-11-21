// Remote pricing overlay unit tests (docs/cli-contract.md §2.16): wire-doc
// validation, cloud-over-bundled merge precedence (incl. the bundled
// selfhost layer), direct-DB row assembly, and the TTL-gated
// ensurePricingLoaded refresh (never throws, never blocks on failure).

import { describe, expect, it, beforeEach } from "vitest";

import {
  loadPricingOverlayRows,
  mergeOverlayDocs,
  validateOverlayDoc,
} from "@/lib/pricing/overlay";
import {
  ensurePricingLoaded,
  getModelPricing,
  getPricingRevision,
  resetPricingForTests,
  __getOverlayStateForTests,
} from "@/lib/pricing";

beforeEach(() => {
  resetPricingForTests();
});

describe("validateOverlayDoc", () => {
  it("normalizes a well-formed document and drops unknown fields", () => {
    const doc = validateOverlayDoc({
      exact: {
        m: { input: 1, output: 2, cache_read: 0.5, priority_multiplier: 2, bogus: "x" },
      },
      alias: { a: "m" },
      fuzzy: [{ match: "k", ref: "m" }],
      source_exact: { cursor: { m2: { input: 0, output: 0 } } },
    });

    expect(doc).not.toBeNull();
    expect(doc!.exact.m).toEqual({ input: 1, output: 2, cache_read: 0.5, priority_multiplier: 2 });
    expect(doc!.alias).toEqual({ a: "m" });
    expect(doc!.fuzzy).toEqual([{ match: "k", ref: "m" }]);
  });

  it("rejects malformed documents whole", () => {
    const rejected = [
      null,
      "doc",
      [],
      { exact: { m: { input: "1", output: 2 } } },
      { exact: { m: { output: 2 } } },
      { exact: { m: { input: -1, output: 2 } } },
      { alias: { a: "" } },
      { fuzzy: [{ match: "k" }] },
      { source_exact: { cursor: "rates" } },
      {},
    ];

    for (const doc of rejected) {
      expect(validateOverlayDoc(doc)).toBeNull();
    }
  });
});

describe("mergeOverlayDocs", () => {
  it("cloud shadows per key, union kept, fuzzy prepended", () => {
    const base = {
      exact: {
        bundled: { input: 1, output: 2 },
        shared: { input: 4, output: 20 },
      },
      alias: { a1: "bundled" },
      source_exact: { cursor: { m: { input: 1, output: 1 } } },
      fuzzy: [
        { match: "old", ref: "bundled" },
        { match: "older", ref: "bundled" },
      ],
    };
    const overlay = {
      exact: {
        shared: { input: 9, output: 9 },
        "cloud-only": { input: 3, output: 7 },
      },
      alias: { a2: "shared" },
      source_exact: { cursor: { m: { input: 2, output: 2 } } },
      fuzzy: [{ match: "new", ref: "shared" }],
    };

    const merged = mergeOverlayDocs(base, overlay);

    expect(merged.exact.shared.input).toBe(9);
    expect(merged.exact.bundled.input).toBe(1);
    expect(merged.exact["cloud-only"]).toEqual({ input: 3, output: 7 });
    expect(merged.alias).toEqual({ a1: "bundled", a2: "shared" });
    expect(merged.fuzzy.map((item) => item.match)).toEqual(["new", "old", "older"]);
    expect(merged.source_exact.cursor.m.input).toBe(2);
  });
});

describe("loadPricingOverlayRows", () => {
  it("assembles rows exactly like the pricing endpoint", async () => {
    const rows = [
      { section: "exact", model_key: "alpha", source: "", value: { input: 4, output: 20, cache_write: 5 }, note: "official" },
      { section: "exact", model_key: "dropped", source: "", value: { input: -1, output: 2 } },
      { section: "alias", model_key: "k3-256k", source: "", value: "alpha" },
      { section: "fuzzy", model_key: "b-match", source: "", value: { ref: "alpha" } },
      { section: "bogus", model_key: "x", source: "", value: { input: 1, output: 1 } },
    ];

    const { overlay, rows: count } = await loadPricingOverlayRows(async () => rows);

    expect(count).toBe(3);
    expect(overlay!.exact.alpha).toEqual({ input: 4, output: 20, cache_write: 5, note: "official" });
    expect(overlay!.alias).toEqual({ "k3-256k": "alpha" });
    expect(overlay!.fuzzy).toEqual([{ match: "b-match", ref: "alpha" }]);
    expect(overlay!.source_exact).toEqual({});
  });

  it("empty, absent and failing tables all resolve to overlay:null", async () => {
    expect((await loadPricingOverlayRows(async () => [])).overlay).toBeNull();
    expect(
      (await loadPricingOverlayRows(async () => {
        throw new Error("table missing");
      })).overlay,
    ).toBeNull();
  });
});

describe("ensurePricingLoaded overlay wiring", () => {
  function selectReturning(rows: Array<Record<string, unknown>>) {
    let calls = 0;
    return {
      calls: () => calls,
      impl: async () => {
        calls += 1;
        return rows;
      },
    };
  }

  it("cloud overlay shadows the bundled rate and feeds lookups", async () => {
    const bundled = getModelPricing("claude-opus-5-5");
    expect(bundled.input).toBeGreaterThan(0);

    const fetcher = selectReturning([
      { section: "exact", model_key: "claude-opus-5-5", source: "", value: { input: 9, output: 90 } },
      { section: "exact", model_key: "brand-new", source: "", value: { input: 1, output: 2 } },
    ]);
    await ensurePricingLoaded({ selectImpl: fetcher.impl });

    expect(getModelPricing("claude-opus-5-5").input).toBe(9);
    expect(getModelPricing("brand-new").input).toBe(1);
    expect(__getOverlayStateForTests().source).toBe("table");
    expect(fetcher.calls()).toBe(1);
  });

  it("the TTL gate skips refetching within the window", async () => {
    const fetcher = selectReturning([
      { section: "exact", model_key: "m", source: "", value: { input: 1, output: 2 } },
    ]);
    await ensurePricingLoaded({ selectImpl: fetcher.impl });
    const revision = getPricingRevision();
    await ensurePricingLoaded({ selectImpl: fetcher.impl });

    expect(fetcher.calls()).toBe(1);
    expect(getPricingRevision()).toBe(revision);
  });

  it("a failing select keeps the bundled tables and never throws", async () => {
    const bundledInput = getModelPricing("claude-opus-5-5").input;
    await ensurePricingLoaded({
      selectImpl: async () => {
        throw new Error("db down");
      },
    });

    expect(getModelPricing("claude-opus-5-5").input).toBe(bundledInput);
    expect(__getOverlayStateForTests().overlay).toBeNull();
  });

  it("an emptied table reverts lookups to the bundled rate", async () => {
    const bundledInput = getModelPricing("claude-opus-5-5").input;
    await ensurePricingLoaded({
      selectImpl: async () => [
        { section: "exact", model_key: "claude-opus-5-5", source: "", value: { input: 9, output: 90 } },
      ],
    });
    expect(getModelPricing("claude-opus-5-5").input).toBe(9);

    resetPricingForTests();
    await ensurePricingLoaded({
      selectImpl: async () => [],
    });
    expect(getModelPricing("claude-opus-5-5").input).toBe(bundledInput);
    expect(__getOverlayStateForTests().overlay).toBeNull();
  });
});
