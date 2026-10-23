// Unit tests for the vendored static pricing engine. Rates below come from the
// vendored snapshots (composer-1 / kiro-agent in curated-overrides.json,
// gpt-5-codex in seed-snapshot.json).

import { describe, expect, it } from "vitest";

import curatedOverridesJson from "@/lib/pricing/curated-overrides.json";
import seedSnapshotJson from "@/lib/pricing/seed-snapshot.json";
import {
  MODEL_PRICING,
  ZERO_PRICING,
  computeRowCost,
  getModelPricing,
  getModelPricingInfo,
  getRowPricing,
  resetPricingForTests,
  __getSelfhostMergeForTests,
} from "@/lib/pricing";
import { buildLitellmPerMillionMap, convertLitellmEntry, lookupPricing, stripReasoningSuffix } from "@/lib/pricing/matcher";

const mergedCurated = __getSelfhostMergeForTests().curated;
const litellmMap = buildLitellmPerMillionMap(seedSnapshotJson);

describe("litellm conversion", () => {
  it("converts per-token rates to per-million with 10-decimal cleanup", () => {
    const converted = convertLitellmEntry({
      input_cost_per_token: 1.25e-6,
      output_cost_per_token: 1e-5,
      cache_read_input_token_cost: 1.25e-7,
    });
    expect(converted).toEqual({ input: 1.25, output: 10, cache_read: 0.125 });
  });

  it("returns null for entries with no price fields", () => {
    expect(convertLitellmEntry({ max_tokens: 8192 })).toBeNull();
    expect(convertLitellmEntry(null)).toBeNull();
  });

  it("skips meta keys when building the map", () => {
    const map = buildLitellmPerMillionMap({
      _meta: { note: "meta" },
      "gpt-5-codex": { input_cost_per_token: 1.25e-6 },
    });
    expect(Object.keys(map)).toEqual(["gpt-5-codex"]);
    expect(map["gpt-5-codex"].input).toBe(1.25);
  });

  it("avoids the 1e-7 * 1e6 float artifact", () => {
    const converted = convertLitellmEntry({ input_cost_per_token: 1e-7 });
    expect(converted?.input).toBe(0.1);
  });
});

describe("lookupPricing resolve order", () => {
  it("resolves curated exact (composer-1)", () => {
    const result = lookupPricing("composer-1", { curated: mergedCurated, litellm: litellmMap });
    expect(result.hit).toBe(true);
    expect(result.source).toBe("curated:exact");
    expect(result.value).toMatchObject({ input: 1.25, output: 10 });
  });

  it("resolves the cursor 'auto' alias to composer-1", () => {
    const result = lookupPricing("auto", { curated: mergedCurated, litellm: litellmMap, source: "cursor" });
    expect(result.hit).toBe(true);
    expect(result.source).toBe("curated:alias");
    expect(result.value).toMatchObject({ input: 1.25 });
  });

  it("resolves litellm exact (gpt-5-codex)", () => {
    const result = lookupPricing("gpt-5-codex", { curated: mergedCurated, litellm: litellmMap });
    expect(result.hit).toBe(true);
    expect(result.source).toBe("litellm:exact");
    expect(result.value).toMatchObject({ input: 1.25, output: 10 });
  });

  it("strips reasoning suffixes for litellm lookups", () => {
    expect(stripReasoningSuffix("gpt-5-codex-high-fast")).toBe("gpt-5-codex");
    expect(stripReasoningSuffix("gpt-5-codex")).toBe("gpt-5-codex");
    const result = lookupPricing("gpt-5-codex-high", { curated: mergedCurated, litellm: litellmMap });
    expect(result.hit).toBe(true);
    expect(result.source).toBe("litellm:strip");
  });

  it("resolves a selfhost source-exact entry only for its own source", () => {
    const selfhostSourceExact = Object.keys(mergedCurated.source_exact).flatMap((source) =>
      Object.keys(mergedCurated.source_exact[source]).map((model) => ({ source, model })),
    );
    expect(selfhostSourceExact.length).toBeGreaterThan(0);
    for (const { source, model } of selfhostSourceExact) {
      const withSource = lookupPricing(model, { curated: mergedCurated, litellm: litellmMap, source });
      expect(withSource.hit).toBe(true);
      expect(withSource.source).toBe("curated:source-exact");
    }
  });

  it("misses unknown models", () => {
    const result = lookupPricing("definitely-not-a-model-xyz", { curated: mergedCurated, litellm: litellmMap });
    expect(result.hit).toBe(false);
  });
});

describe("getModelPricingInfo provenance", () => {
  it("distinguishes priced, free and unpriced", () => {
    resetPricingForTests();
    expect(getModelPricingInfo("composer-1").status).toBe("priced");
    expect(getModelPricingInfo("composer-1").source).toBe("curated:exact");
    expect(getModelPricingInfo("no-such-model-abc").status).toBe("unpriced");
    expect(getModelPricingInfo("no-such-model-abc").source).toBeNull();
    expect(getModelPricingInfo("no-such-model-abc").input).toBe(0);
  });

  it("reports local inference and subscription sources as free", () => {
    resetPricingForTests();
    expect(getModelPricingInfo("any-model", { source: "lmstudio" })).toMatchObject({
      status: "free",
      source: "local_inference",
    });
    expect(getModelPricingInfo("claude-anything", { source: "pi-copilot" })).toMatchObject({
      status: "free",
      source: "subscription",
    });
  });

  it("surfaces selfhost-curated provenance", () => {
    resetPricingForTests();
    const info = getModelPricingInfo("step-5-preview");
    expect(info.status).toBe("priced");
    expect(info.source).toBe("selfhost-curated");
    expect(Array.isArray(__getSelfhostMergeForTests().droppedKeys)).toBe(true);
  });

  it("never leaks the _selfhost flag through getModelPricing", () => {
    resetPricingForTests();
    const rates = getModelPricing("step-5-preview");
    expect(Object.keys(rates)).not.toContain("_selfhost");
  });
});

describe("computeRowCost", () => {
  it("prices a known model by per-million rates × token columns", () => {
    resetPricingForTests();
    // composer-1: input 1.25, output 10, cache_read 0.125 per MTok.
    const cost = computeRowCost({
      source: "cursor",
      model: "composer-1",
      input_tokens: 1_000_000,
      output_tokens: 100_000,
      cached_input_tokens: 2_000_000,
      cache_creation_input_tokens: 0,
      reasoning_output_tokens: 0,
    });
    expect(cost).toBeCloseTo(1.25 + 1 + 0.25, 10);
  });

  it("prices zero for unknown models", () => {
    resetPricingForTests();
    expect(
      computeRowCost({ source: "codex", model: "unknown-model-xyz", input_tokens: 1000, output_tokens: 1000 }),
    ).toBe(0);
  });

  it("prefers the authoritative provider-reported cost for grok", () => {
    resetPricingForTests();
    expect(
      computeRowCost({ source: "grok", model: "grok-code-fast-1", total_cost_usd: 0.42, input_tokens: 999999 }),
    ).toBe(0.42);
    // Zero stays the legacy "unreported" sentinel and falls through to pricing.
    expect(
      computeRowCost({ source: "grok", model: "grok-code-fast-1", total_cost_usd: 0, input_tokens: 0 }),
    ).toBe(0);
  });

  it("does not double-bill reasoning for sources that fold it into output", () => {
    resetPricingForTests();
    const base = computeRowCost({
      source: "cline",
      model: "composer-1",
      input_tokens: 0,
      output_tokens: 100_000,
      reasoning_output_tokens: 100_000,
    });
    const withoutReasoning = computeRowCost({
      source: "cline",
      model: "composer-1",
      input_tokens: 0,
      output_tokens: 100_000,
      reasoning_output_tokens: 0,
    });
    expect(base).toBe(withoutReasoning);
  });

  it("bills reasoning separately for sources that report it apart", () => {
    resetPricingForTests();
    const codexCost = computeRowCost({
      source: "codex",
      model: "gpt-5-codex",
      input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 1_000_000,
    });
    expect(codexCost).toBe(0);
    const claudeCost = computeRowCost({
      source: "claude-code",
      model: "composer-1",
      input_tokens: 0,
      output_tokens: 0,
      reasoning_output_tokens: 1_000_000,
    });
    expect(claudeCost).toBeCloseTo(10, 10);
  });

  it("returns 0 for local inference and subscription sources", () => {
    resetPricingForTests();
    expect(computeRowCost({ source: "lmstudio", model: "composer-1", input_tokens: 5_000_000 })).toBe(0);
    expect(computeRowCost({ source: "pi-copilot", model: "composer-1", input_tokens: 5_000_000 })).toBe(0);
  });
});

describe("deepseek time-based pricing", () => {
  // deepseek-v4-flash carries peak rates {input: 0.44} in the curated table
  // and is in the time-priced model list.
  it("halves peak rates during Beijing weekend off-peak after the cutover", () => {
    resetPricingForTests();
    // Wednesday 2026-10-21, 02:00Z = 10:00 Beijing → weekday peak, full rate.
    const weekdayPeak = computeRowCost({
      source: "other",
      model: "deepseek-v4-flash",
      hour_start: "2026-10-21T02:00:00.000Z",
      input_tokens: 1_000_000,
    });
    // Saturday 2026-10-24 (Beijing) → whole weekend off-peak, half rate.
    const weekend = computeRowCost({
      source: "other",
      model: "deepseek-v4-flash",
      hour_start: "2026-10-24T02:00:00.000Z",
      input_tokens: 1_000_000,
    });
    // Weekend before the 2026-08-23 cutover: no discount.
    const earlyWeekend = computeRowCost({
      source: "other",
      model: "deepseek-v4-flash",
      hour_start: "2026-08-01T02:00:00.000Z",
      input_tokens: 1_000_000,
    });
    expect(weekdayPeak).toBeCloseTo(0.44, 12);
    expect(weekend).toBeCloseTo(0.22, 12);
    expect(earlyWeekend).toBeCloseTo(0.44, 12);
    resetPricingForTests();
  });

  it("the pricing_tier annotation alone never changes a non-time-priced model", () => {
    resetPricingForTests();
    const peak = getRowPricing({ model: "composer-1", hour_start: "2026-10-24T10:00:00.000Z", pricing_tier: "peak" });
    const offPeak = getRowPricing({ model: "composer-1", hour_start: "2026-10-24T10:00:00.000Z", pricing_tier: "off_peak" });
    expect(peak).toEqual(offPeak);
    expect(ZERO_PRICING.input).toBe(0);
  });
});
