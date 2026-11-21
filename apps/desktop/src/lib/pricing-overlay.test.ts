// Remote pricing overlay unit tests (docs/cli-contract.md §2.16, desktop
// read face): wire-doc validation, cloud-over-bundled merge precedence, the
// HTTP fetch layer (timeout/HTTP-error/malformed all degrade to null), and
// the TTL-gated ensurePricingOverlay refresh (never throws, never blocks).

import { describe, expect, it, beforeEach } from "vitest";

import {
  fetchPricingOverlay,
  mergeOverlayDocs,
  validateOverlayDoc,
} from "@/lib/pricing-overlay";
import {
  ensurePricingOverlay,
  getModelPricing,
  getPricingRevision,
  resetPricingForTests,
  __getOverlayStateForTests,
} from "@/lib/pricing";

beforeEach(() => {
  resetPricingForTests();
});

function jsonFetcher(payload: unknown, { status = 200 } = {}) {
  let calls = 0;

  return {
    calls: () => calls,
    impl: (async () => {
      calls += 1;

      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      };
    }) as unknown as typeof fetch,
  };
}

describe("validateOverlayDoc", () => {
  it("normalizes a well-formed document and drops unknown fields", () => {
    const doc = validateOverlayDoc({
      exact: {
        m: {
          input: 1,
          output: 2,
          cache_read: 0.5,
          priority_multiplier: 2,
          bogus: "x",
        },
      },
      alias: { a: "m" },
      fuzzy: [{ match: "k", ref: "m" }],
      source_exact: { cursor: { m2: { input: 0, output: 0 } } },
    });

    expect(doc).not.toBeNull();
    expect(doc!.exact.m).toEqual({
      input: 1,
      output: 2,
      cache_read: 0.5,
      priority_multiplier: 2,
    });
    expect(doc!.fuzzy).toEqual([{ match: "k", ref: "m" }]);
  });

  it("rejects malformed documents whole", () => {
    for (const doc of [
      null,
      "doc",
      [],
      { exact: { m: { input: "1", output: 2 } } },
      { exact: { m: { output: 2 } } },
      { alias: { a: "" } },
      { fuzzy: [{ match: "k" }] },
      {},
    ]) {
      expect(validateOverlayDoc(doc)).toBeNull();
    }
  });
});

describe("mergeOverlayDocs", () => {
  it("cloud shadows per key, union kept, fuzzy prepended", () => {
    const merged = mergeOverlayDocs(
      {
        exact: {
          bundled: { input: 1, output: 2 },
          shared: { input: 4, output: 20 },
        },
        alias: {},
        source_exact: {},
        fuzzy: [{ match: "old", ref: "bundled" }],
      },
      {
        exact: { shared: { input: 9, output: 9 } },
        alias: {},
        source_exact: {},
        fuzzy: [{ match: "new", ref: "shared" }],
      },
    );

    expect(merged.exact.shared.input).toBe(9);
    expect(merged.exact.bundled.input).toBe(1);
    expect(merged.fuzzy.map((item) => item.match)).toEqual(["new", "old"]);
  });
});

describe("fetchPricingOverlay", () => {
  it("returns the validated overlay for a healthy endpoint", async () => {
    const fetcher = jsonFetcher({
      revision: "abc123",
      overlay: { exact: { m: { input: 1, output: 2 } } },
    });
    const result = await fetchPricingOverlay({
      baseUrl: "https://pricing.test",
      fetchImpl: fetcher.impl,
    });

    expect(result.overlay).not.toBeNull();
    expect(result.revision).toBe("abc123");
  });

  it("HTTP errors, malformed payloads and empty tables all resolve to overlay:null", async () => {
    expect(
      (
        await fetchPricingOverlay({
          baseUrl: "https://pricing.test",
          fetchImpl: jsonFetcher({}, { status: 500 }).impl,
        })
      ).overlay,
    ).toBeNull();
    expect(
      (
        await fetchPricingOverlay({
          baseUrl: "https://pricing.test",
          fetchImpl: jsonFetcher({
            revision: "x",
            overlay: { exact: { m: { input: "bad" } } },
          }).impl,
        })
      ).overlay,
    ).toBeNull();
    expect(
      (
        await fetchPricingOverlay({
          baseUrl: "https://pricing.test",
          fetchImpl: jsonFetcher({ revision: "x", overlay: null }).impl,
        })
      ).overlay,
    ).toBeNull();
    expect(
      (
        await fetchPricingOverlay({
          baseUrl: null,
          fetchImpl: jsonFetcher({ revision: "x", overlay: null }).impl,
        })
      ).overlay,
    ).toBeNull();
  });
});

describe("ensurePricingOverlay wiring", () => {
  it("cloud overlay shadows the bundled rate and feeds lookups", async () => {
    expect(getModelPricing("claude-opus-5-5").input).toBe(4);

    await ensurePricingOverlay({
      baseUrl: "https://pricing.test",
      fetchImpl: jsonFetcher({
        revision: "abc123",
        overlay: { exact: { "claude-opus-5-5": { input: 9, output: 90 } } },
      }).impl,
    });

    expect(getModelPricing("claude-opus-5-5").input).toBe(9);
    expect(__getOverlayStateForTests().source).toBe("remote");
  });

  it("the TTL gate skips refetching within the window", async () => {
    const fetcher = jsonFetcher({
      revision: "abc123",
      overlay: { exact: { m: { input: 1, output: 2 } } },
    });

    await ensurePricingOverlay({
      baseUrl: "https://pricing.test",
      fetchImpl: fetcher.impl,
    });
    const revision = getPricingRevision();

    await ensurePricingOverlay({
      baseUrl: "https://pricing.test",
      fetchImpl: fetcher.impl,
    });

    expect(fetcher.calls()).toBe(1);
    expect(getPricingRevision()).toBe(revision);
  });

  it("a failing fetch keeps the bundled tables and never throws", async () => {
    await ensurePricingOverlay({
      baseUrl: "https://pricing.test",
      fetchImpl: (async () => {
        throw new Error("offline");
      }) as unknown as typeof fetch,
    });

    expect(getModelPricing("claude-opus-5-5").input).toBe(4);
    expect(__getOverlayStateForTests().overlay).toBeNull();
  });
});
