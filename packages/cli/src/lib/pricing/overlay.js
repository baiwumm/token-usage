// Remote curated pricing overlay (docs/cli-contract.md §2.16): the instance's
// token_pricing_overrides table served by GET /api/functions/token-usage-
// pricing, in the same shape as the bundled curated-overrides.json. Letting
// the instance owner fix or pin rates in their own database means a price
// correction reaches every collection machine on its next sync instead of
// waiting for a CLI release (the 0.6.6 "free SKU priced at 0" class of fix).
//
// Failure semantics mirror litellm-fetcher: a fetch or validation failure
// never throws out of loadPricingOverlay — the last-good cached document
// stays authoritative, and with no cache the overlay is simply absent (the
// bundled curated file keeps answering, byte-for-byte the pre-overlay
// behaviour). Validation is defence in depth: the endpoint already drops
// malformed rows, but the wire document is re-validated here before it is
// allowed to influence any lookup.

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

const MAX_TEXT = 200;
const MAX_NOTE = 2000;
const MAX_ENTRIES = 2000;
const SECTIONS = ["exact", "alias", "fuzzy", "source_exact"];

function isFiniteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isBoundedString(value, max) {
  return typeof value === "string" && value.length >= 1 && value.length <= max;
}

// Validates the wire document and returns a normalized copy (unknown fields
// dropped) or null when anything is off — a partially valid document is still
// rejected whole: silently trusting a malformed overlay could underprice
// models the operator believes are pinned.
function validateOverlayDoc(doc) {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return null;
  const out = {};
  let entries = 0;

  const exact = doc.exact;
  if (exact !== undefined) {
    if (!exact || typeof exact !== "object" || Array.isArray(exact)) return null;
    const normalized = {};
    for (const [key, value] of Object.entries(exact)) {
      if (!isBoundedString(key, MAX_TEXT)) return null;
      const rates = normalizeRates(value);
      if (!rates) return null;
      normalized[key] = rates;
      entries += 1;
    }
    if (entries) out.exact = normalized;
  }

  const alias = doc.alias;
  if (alias !== undefined) {
    if (!alias || typeof alias !== "object" || Array.isArray(alias)) return null;
    const normalized = {};
    for (const [key, target] of Object.entries(alias)) {
      if (!isBoundedString(key, MAX_TEXT) || !isBoundedString(target, MAX_TEXT)) return null;
      normalized[key] = target;
      entries += 1;
    }
    if (entries) out.alias = normalized;
  }

  const fuzzy = doc.fuzzy;
  if (fuzzy !== undefined) {
    if (!Array.isArray(fuzzy)) return null;
    const normalized = [];
    for (const item of fuzzy) {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      if (!isBoundedString(item.match, MAX_TEXT) || !isBoundedString(item.ref, MAX_TEXT)) return null;
      normalized.push({ match: item.match, ref: item.ref });
      entries += 1;
    }
    if (entries) out.fuzzy = normalized;
  }

  const sourceExact = doc.source_exact;
  if (sourceExact !== undefined) {
    if (!sourceExact || typeof sourceExact !== "object" || Array.isArray(sourceExact)) return null;
    const normalized = {};
    for (const [source, models] of Object.entries(sourceExact)) {
      if (!isBoundedString(source, 64)) return null;
      if (!models || typeof models !== "object" || Array.isArray(models)) return null;
      const scoped = {};
      for (const [key, value] of Object.entries(models)) {
        if (!isBoundedString(key, MAX_TEXT)) return null;
        const rates = normalizeRates(value);
        if (!rates) return null;
        scoped[key] = rates;
        entries += 1;
      }
      if (Object.keys(scoped).length) normalized[source] = scoped;
    }
    if (entries) out.source_exact = normalized;
  }

  if (entries > MAX_ENTRIES) return null;
  return Object.keys(out).length ? out : null;
}

function normalizeRates(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!isFiniteNonNegative(value.input) || !isFiniteNonNegative(value.output)) return null;
  const rates = { input: value.input, output: value.output };
  for (const field of ["cache_read", "cache_write", "priority_multiplier"]) {
    if (value[field] !== undefined) {
      if (!isFiniteNonNegative(value[field])) return null;
      rates[field] = value[field];
    }
  }
  if (typeof value.note === "string" && value.note.length > 0 && value.note.length <= MAX_NOTE) {
    rates.note = value.note;
  }
  return rates;
}

// Keyed sections merge per key (overlay wins, union kept); the fuzzy list has
// no keys, so the overlay list is prepended — it must be consulted before the
// bundled entries or a cloud correction could be shadowed by an older bundled
// prefix match.
function mergeCuratedDocs(bundled, overlay) {
  const merged = {
    exact: { ...(bundled.exact || {}), ...(overlay.exact || {}) },
  };
  const bundledAlias = bundled.alias || {};
  const overlayAlias = overlay.alias || {};
  if (Object.keys(bundledAlias).length || Object.keys(overlayAlias).length) {
    merged.alias = { ...bundledAlias, ...overlayAlias };
  }
  const bundledFuzzy = Array.isArray(bundled.fuzzy) ? bundled.fuzzy : [];
  const overlayFuzzy = Array.isArray(overlay.fuzzy) ? overlay.fuzzy : [];
  if (bundledFuzzy.length || overlayFuzzy.length) {
    merged.fuzzy = [...overlayFuzzy, ...bundledFuzzy];
  }
  const bundledSourceExact = bundled.source_exact || {};
  const overlaySourceExact = overlay.source_exact || {};
  const sourceKeys = new Set([...Object.keys(bundledSourceExact), ...Object.keys(overlaySourceExact)]);
  if (sourceKeys.size) {
    merged.source_exact = {};
    for (const source of sourceKeys) {
      merged.source_exact[source] = {
        ...(bundledSourceExact[source] || {}),
        ...(overlaySourceExact[source] || {}),
      };
    }
  }
  return merged;
}

// Synchronous disk-cache read for status --json: a status process never
// fetches (no network I/O), so its overlay provenance hydrates from whatever
// the last sync run cached. Returns null on missing/invalid cache.
function readOverlayDiskCacheSync(cachePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return null;
    const overlay = validateOverlayDoc(parsed.overlay);
    if (parsed.overlay && !overlay) return null;
    return {
      overlay,
      revision: String(parsed.revision || ""),
      fetchedAtMs: Date.parse(parsed.fetched_at) || 0,
    };
  } catch {
    return null;
  }
}

async function readCache(cachePath) {
  try {
    const raw = await fsp.readFile(cachePath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const overlay = validateOverlayDoc(parsed.overlay);
    if (!overlay) return null;
    return { overlay, revision: String(parsed.revision || ""), fetchedAtMs: Date.parse(parsed.fetched_at) || 0 };
  } catch {
    return null;
  }
}

async function writeCache(cachePath, payload) {
  try {
    await fsp.mkdir(path.dirname(cachePath), { recursive: true });
    await fsp.writeFile(cachePath, `${JSON.stringify(payload)}\n`, "utf8");
  } catch {
    // A failed cache write only costs the next run a refetch.
  }
}

// Fetches (or replays from disk) the instance overlay. Resolves with
// `{ overlay, revision, fetchedAtMs, source }` where `overlay` is null when
// nothing usable is available; never rejects.
async function loadPricingOverlay({
  baseUrl,
  cachePath,
  ttlMs = 24 * 60 * 60 * 1000,
  timeoutMs = 10_000,
  fetchImpl = fetch,
  now = () => Date.now(),
} = {}) {
  const cached = cachePath ? await readCache(cachePath) : null;
  const fresh = cached && cached.fetchedAtMs > 0 && now() - cached.fetchedAtMs < ttlMs;
  if (fresh) {
    return { ...cached, source: "cache:fresh" };
  }

  const url = `${String(baseUrl || "").trim().replace(/\/$/, "")}/api/functions/token-usage-pricing`;
  if (!/^https?:\/\//.test(url)) {
    return cached ? { ...cached, source: "cache:stale" } : { overlay: null, revision: "", fetchedAtMs: 0, source: null };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { signal: controller.signal });
    if (!response.ok) throw new Error(`pricing overlay fetch failed: HTTP ${response.status}`);
    const body = await response.json();
    if (!body || typeof body !== "object") throw new Error("pricing overlay payload is not an object");
    const overlay = validateOverlayDoc(body.overlay);
    if (body.overlay && !overlay) throw new Error("pricing overlay failed validation");
    const payload = {
      overlay,
      revision: typeof body.revision === "string" ? body.revision : "",
      fetched_at: new Date(now()).toISOString(),
    };
    if (cachePath) await writeCache(cachePath, payload);
    return {
      overlay: payload.overlay,
      revision: payload.revision,
      fetchedAtMs: now(),
      source: payload.overlay ? "remote" : "remote:empty",
    };
  } catch {
    // Stale last-good beats nothing: an offline machine keeps pricing from the
    // last successful fetch rather than silently reverting to bundled-only.
    return cached ? { ...cached, source: "cache:stale" } : { overlay: null, revision: "", fetchedAtMs: 0, source: null };
  } finally {
    clearTimeout(timer);
  }
}

// For tests: the synchronous helpers stay pure, so only the cache file needs
// the fs module — exposed for direct validation assertions.
module.exports = {
  validateOverlayDoc,
  mergeCuratedDocs,
  loadPricingOverlay,
  readCache,
  readOverlayDiskCacheSync,
  MAX_ENTRIES,
};
