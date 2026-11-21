"use strict";

// Remote curated pricing overlay (docs/cli-contract.md §2.16): wire-doc
// validation, merge precedence over the bundled curated file, disk-cache
// freshness + last-good semantics, and the end-to-end effect on
// getModelPricing / MODEL_PRICING / getPricingMeta.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  validateOverlayDoc,
  mergeCuratedDocs,
  loadPricingOverlay,
} = require("../src/lib/pricing/overlay");
const pricing = require("../src/lib/pricing");

let tmpDir;
let cachePath;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-overlay-"));
  cachePath = path.join(tmpDir, "pricing-overlay.json");
  pricing.resetPricingForTests();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  pricing.resetPricingForTests();
});

const GOOD_OVERLAY = {
  exact: { "overlay-only": { input: 3, output: 7 } },
  alias: { "k3-256k": "kimi-k3" },
  fuzzy: [{ match: "kiro", ref: "kiro-2" }],
  source_exact: { "workbuddy-ai": { "plan-model": { input: 0, output: 0 } } },
};

function jsonFetcher(payload, { status = 200 } = {}) {
  let calls = 0;
  return {
    calls: () => calls,
    impl: async () => {
      calls += 1;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => payload,
      };
    },
  };
}

test("validateOverlayDoc accepts a well-formed document and drops unknown fields", () => {
  const normalized = validateOverlayDoc({
    exact: { m: { input: 1, output: 2, cache_read: 0.5, bogus: "x" } },
    alias: { a: "m" },
    fuzzy: [{ match: "k", ref: "m" }],
    source_exact: { cursor: { m2: { input: 0, output: 0 } } },
  });
  assert.ok(normalized);
  assert.deepEqual(normalized.exact.m, { input: 1, output: 2, cache_read: 0.5 });
  assert.deepEqual(normalized.alias, { a: "m" });
  assert.deepEqual(normalized.fuzzy, [{ match: "k", ref: "m" }]);
});

test("validateOverlayDoc rejects malformed documents whole", () => {
  for (const doc of [
    null,
    "doc",
    [],
    { exact: { m: { input: "1", output: 2 } } },
    { exact: { m: { output: 2 } } },
    { exact: { m: { input: -1, output: 2 } } },
    { exact: { m: 5 } },
    { alias: { a: "" } },
    { fuzzy: [{ match: "k" }] },
    { source_exact: { cursor: "rates" } },
    { bogus: true },
  ]) {
    assert.equal(validateOverlayDoc(doc), null, `expected rejection for ${JSON.stringify(doc)}`);
  }
});

test("mergeCuratedDocs: overlay shadows bundled keys, union kept, fuzzy prepended", () => {
  const bundled = {
    exact: { bundled: { input: 1, output: 2 }, shared: { input: 4, output: 20 } },
    alias: { a1: "bundled" },
    fuzzy: [{ match: "old", ref: "bundled" }, { match: "older", ref: "bundled" }],
    source_exact: { cursor: { m: { input: 1, output: 1 } } },
  };
  const merged = mergeCuratedDocs(bundled, {
    exact: { shared: { input: 9, output: 9 }, "overlay-only": { input: 3, output: 7 } },
    alias: { a2: "shared" },
    fuzzy: [{ match: "new", ref: "shared" }],
    source_exact: { cursor: { m: { input: 2, output: 2 } }, grok: { n: { input: 0, output: 0 } } },
  });
  assert.equal(merged.exact.shared.input, 9, "overlay wins per key");
  assert.equal(merged.exact.bundled.input, 1, "bundled-only keys stay");
  assert.ok(merged.exact["overlay-only"]);
  assert.deepEqual(merged.alias, { a1: "bundled", a2: "shared" });
  assert.deepEqual(merged.fuzzy.map((item) => item.match), ["new", "old", "older"],
    "overlay fuzzy entries are consulted before bundled ones");
  assert.equal(merged.source_exact.cursor.m.input, 2);
  assert.ok(merged.source_exact.grok.n);
});

test("loadPricingOverlay: fresh cache answers without a fetch", async () => {
  fs.writeFileSync(cachePath, JSON.stringify({ revision: "r1", overlay: GOOD_OVERLAY, fetched_at: new Date().toISOString() }));
  const fetcher = jsonFetcher({});
  const result = await loadPricingOverlay({ baseUrl: "https://pricing.test", cachePath, fetchImpl: fetcher.impl });
  assert.equal(fetcher.calls(), 0);
  assert.equal(result.source, "cache:fresh");
  assert.equal(result.revision, "r1");
  assert.ok(result.overlay.exact["overlay-only"]);
});

test("loadPricingOverlay: stale cache refetches and rewrites the cache file", async () => {
  fs.writeFileSync(cachePath, JSON.stringify({
    revision: "r1",
    overlay: { exact: { old: { input: 1, output: 1 } } },
    fetched_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
  }));
  const fetcher = jsonFetcher({ revision: "r2", overlay: GOOD_OVERLAY });
  const result = await loadPricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: fetcher.impl,
    now: () => Date.now(),
  });
  assert.equal(fetcher.calls(), 1);
  assert.equal(result.source, "remote");
  assert.equal(result.revision, "r2");
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  assert.equal(cached.revision, "r2");
  assert.ok(cached.overlay.exact["overlay-only"]);
});

test("loadPricingOverlay: fetch failure keeps the stale last-good document", async () => {
  fs.writeFileSync(cachePath, JSON.stringify({
    revision: "r1",
    overlay: GOOD_OVERLAY,
    fetched_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
  }));
  const result = await loadPricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: async () => { throw new Error("network down"); },
  });
  assert.equal(result.source, "cache:stale");
  assert.equal(result.revision, "r1");
  assert.ok(result.overlay.alias["k3-256k"]);
});

test("loadPricingOverlay: no cache + fetch failure → overlay null, never throws", async () => {
  const result = await loadPricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: async () => { throw new Error("network down"); },
  });
  assert.equal(result.overlay, null);
  assert.equal(result.source, null);
});

test("loadPricingOverlay: remote overlay:null (empty table) is a valid answer", async () => {
  const fetcher = jsonFetcher({ revision: "empty", overlay: null });
  const result = await loadPricingOverlay({ baseUrl: "https://pricing.test", cachePath, fetchImpl: fetcher.impl });
  assert.equal(result.overlay, null);
  assert.equal(result.source, "remote:empty");
});

test("loadPricingOverlay: malformed remote payload is rejected, last-good kept", async () => {
  fs.writeFileSync(cachePath, JSON.stringify({ revision: "r1", overlay: GOOD_OVERLAY, fetched_at: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString() }));
  const result = await loadPricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: jsonFetcher({ revision: "r2", overlay: { exact: { m: { input: "nope" } } } }).impl,
  });
  assert.equal(result.source, "cache:stale");
  assert.equal(result.revision, "r1");
});

test("ensurePricingOverlay feeds getModelPricing, MODEL_PRICING and getPricingMeta", async () => {
  const bundled = pricing.MODEL_PRICING["claude-opus-5-5"];
  assert.ok(bundled, "bundled curated table must contain the fixture key");
  const metaBefore = pricing.getPricingMeta();
  assert.equal(metaBefore.overlay_source, null);

  await pricing.ensurePricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: jsonFetcher({
      revision: "abc123",
      overlay: { exact: { "claude-opus-5-5": { input: 9, output: 90 }, "brand-new": { input: 1, output: 2 } } },
    }).impl,
  });

  assert.equal(pricing.getModelPricing("claude-opus-5-5").input, 9, "overlay shadows the bundled rate");
  assert.equal(pricing.MODEL_PRICING["claude-opus-5-5"].input, 9, "MODEL_PRICING is a live view");
  assert.ok(pricing.MODEL_PRICING["brand-new"], "overlay-only keys appear");
  assert.ok(pricing.MODEL_PRICING["k3-256k"], "bundled-only keys stay");

  const meta = pricing.getPricingMeta();
  assert.equal(meta.overlay_revision, "abc123");
  assert.equal(meta.overlay_source, "remote");
  assert.equal(meta.overlay_entries, 2);
  assert.ok(meta.overlay_fetched_at);

  const info = pricing.getModelPricingInfo("claude-opus-5-5");
  assert.equal(info.input, 9);
  assert.equal(info.status, "priced");
});

test("ensurePricingOverlay: same payload does not churn the pricing revision", async () => {
  const fetcher = jsonFetcher({ revision: "abc123", overlay: { exact: { m: { input: 1, output: 2 } } } });
  const impl = fetcher.impl;
  await pricing.ensurePricingOverlay({ baseUrl: "https://pricing.test", cachePath, fetchImpl: impl });
  const revisionAfterFirst = pricing.getPricingRevision();
  await pricing.ensurePricingOverlay({ baseUrl: "https://pricing.test", cachePath, fetchImpl: impl });
  assert.equal(pricing.getPricingRevision(), revisionAfterFirst, "identical content must not invalidate the memoized caches");
});

test("ensurePricingOverlay: overlay:null clears back to bundled behaviour", async () => {
  await pricing.ensurePricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: jsonFetcher({ revision: "abc123", overlay: { exact: { "claude-opus-5-5": { input: 9, output: 90 } } } }).impl,
  });
  assert.equal(pricing.getModelPricing("claude-opus-5-5").input, 9);

  await pricing.ensurePricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath: path.join(tmpDir, "other-cache.json"),
    fetchImpl: jsonFetcher({ revision: "empty", overlay: null }).impl,
  });
  const bundled = pricing.MODEL_PRICING["claude-opus-5-5"];
  assert.equal(pricing.getModelPricing("claude-opus-5-5").input, bundled.input, "bundled rate restored");
  assert.equal(pricing.getPricingMeta().overlay_source, "remote:empty");
});

test("ensurePricingOverlay: a failing refresh keeps the previous overlay active", async () => {
  await pricing.ensurePricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: jsonFetcher({ revision: "abc123", overlay: { exact: { "claude-opus-5-5": { input: 9, output: 90 } } } }).impl,
  });
  // Age the cache past the TTL so the next call actually attempts a fetch
  // (within the TTL window a failing call is never even reached — the fresh
  // cache answers, which is the desired no-refetch behaviour).
  const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  cached.fetched_at = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
  fs.writeFileSync(cachePath, JSON.stringify(cached));
  await pricing.ensurePricingOverlay({
    baseUrl: "https://pricing.test",
    cachePath,
    fetchImpl: async () => { throw new Error("network down"); },
  });
  assert.equal(pricing.getModelPricing("claude-opus-5-5").input, 9, "last-good overlay survives a failed refresh");
  assert.equal(pricing.getPricingMeta().overlay_source, "cache:stale");
});
