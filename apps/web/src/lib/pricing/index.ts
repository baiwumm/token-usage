// Public pricing API. Vendored from the reference implementation
// (api/_lib/pricing/index.js), TS-ported. Keeps the same synchronous shape so
// computeRowCost and the account series behave identically.
//
// This copy serves the bundled static snapshot ONLY. The online price updater
// was intentionally not ported — private instances never make outbound pricing
// requests at runtime; ensurePricingLoaded() is a no-op marking the seed loaded.

import curatedOverrides from "./curated-overrides.json";
import selfhostOverridesJson from "./selfhost-overrides.json";
import seedSnapshotJson from "./seed-snapshot.json";
import {
  buildLitellmPerMillionMap,
  lookupPricing,
  type CuratedTables,
  type Rates,
} from "./matcher";

type OverrideEntry = Rates & { _selfhost?: boolean };
type OverrideTables = {
  exact?: Record<string, OverrideEntry>;
  alias?: Record<string, string>;
  source_exact?: Record<string, Record<string, OverrideEntry>>;
  fuzzy?: Array<{ match?: string; ref?: string }>;
};

const curated = curatedOverrides as unknown as CuratedTables & {
  fuzzy?: Array<{ match: string; ref: string }>;
};
const selfhost = selfhostOverridesJson as unknown as OverrideTables;

// Self-host curated additions: the merge is additive, in-memory and
// upstream-wins — on a key collision the selfhost entry is dropped. Every
// selfhost entry is cloned with a `_selfhost` flag which
// computeModelPricingInfo maps to the "selfhost-curated" provenance.
function mergeSelfhostOverrides(
  curatedTables: CuratedTables,
  overrides: OverrideTables,
) {
  const droppedKeys: string[] = [];
  const merged: CuratedTables = {
    exact: { ...curatedTables.exact },
    alias: { ...curatedTables.alias },
    source_exact: {},
    fuzzy: [...(curatedTables.fuzzy || [])],
  };

  for (const [source, table] of Object.entries(
    curatedTables.source_exact || {},
  )) {
    merged.source_exact[source] = { ...table };
  }
  for (const [key, entry] of Object.entries(overrides.exact || {})) {
    if (Object.prototype.hasOwnProperty.call(merged.exact, key)) {
      droppedKeys.push(`exact:${key}`);
      continue;
    }
    merged.exact[key] = markSelfhostEntry(entry);
  }
  for (const [key, ref] of Object.entries(overrides.alias || {})) {
    if (Object.prototype.hasOwnProperty.call(merged.alias, key)) {
      droppedKeys.push(`alias:${key}`);
      continue;
    }
    merged.alias[key] = ref;
  }
  for (const [source, table] of Object.entries(overrides.source_exact || {})) {
    const target = (merged.source_exact[source] =
      merged.source_exact[source] || {});

    for (const [key, entry] of Object.entries(table)) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        droppedKeys.push(`source_exact:${source}:${key}`);
        continue;
      }
      target[key] = markSelfhostEntry(entry);
    }
  }
  // Fuzzy refs resolve against merged.exact, so a selfhost fuzzy entry only
  // ships when its ref exists; upstream fuzzy patterns keep array order.
  const exactRefs = new Set(Object.keys(merged.exact));

  for (const item of overrides.fuzzy || []) {
    if (!item || !item.match || !item.ref || !exactRefs.has(item.ref)) {
      droppedKeys.push(`fuzzy:${item?.match}`);
      continue;
    }
    if (merged.fuzzy.some((existing) => existing.match === item.match)) {
      droppedKeys.push(`fuzzy:${item.match}`);
      continue;
    }
    merged.fuzzy.push(item as { match: string; ref: string });
  }

  return { merged, droppedKeys };
}

function markSelfhostEntry(entry: OverrideEntry): OverrideEntry {
  return { ...entry, _selfhost: true };
}

const { merged: curatedWithSelfhost, droppedKeys: selfhostDroppedKeys } =
  mergeSelfhostOverrides(curated, selfhost);

export const ZERO_PRICING = {
  input: 0,
  output: 0,
  cache_read: 0,
  cache_write: 0,
};
const PI_SUBSCRIPTION_SOURCES = new Set([
  "pi-github-copilot",
  "pi-copilot",
  "prime-agent-github-copilot",
  "prime-agent-copilot",
]);
// LM Studio's server logs describe inference served by the local developer
// server (including LM Link).
const LOCAL_INFERENCE_SOURCES = new Set(["lmstudio"]);
// OpenAI long-context pricing depends on a single request's raw input,
// including cached tokens, never a session/day aggregate.
const OPENAI_LONG_CONTEXT_INPUT_THRESHOLD = 272_000;
const SOURCES_WITH_AUTHORITATIVE_COST = new Set(["grok", "cline"]);
const DEEPSEEK_TIME_PRICED_MODELS = [
  "deepseek-v4-flash",
  "deepseek-v4.1-flash",
  "deepseek-flash",
  "deepseek-v4-pro",
];

// Static seed load. The JSON module import keeps the snapshot in the bundle so
// serverless file tracing always ships it; shallow-copy before dropping _meta
// (imported JSON namespaces are frozen).
const seedRaw: Record<string, unknown> = (() => {
  const parsed = { ...(seedSnapshotJson as Record<string, unknown>) };

  delete parsed._meta;

  return parsed;
})();

const state = {
  loaded: false,
  loadingPromise: null as null,
  revision: 0,
  litellmRawMap: seedRaw,
  litellmPerMillionMap: buildLitellmPerMillionMap(seedRaw),
  source: Object.keys(seedRaw).length ? "seed-snapshot:static" : null,
  // negativeCache prevents re-walking the LiteLLM map for models we've already
  // determined are unknown.
  negativeCache: new Set<string>(),
};

export async function ensurePricingLoaded() {
  state.loaded = true;

  return state;
}

export function resetPricingForTests() {
  state.loaded = false;
  state.loadingPromise = null;
  state.litellmRawMap = seedRaw;
  state.litellmPerMillionMap = buildLitellmPerMillionMap(seedRaw);
  state.source = Object.keys(seedRaw).length ? "seed-snapshot:static" : null;
  state.revision += 1;
  state.negativeCache.clear();
  rowCostCache = new WeakMap();
}

export function getPricingRevision(): number {
  return state.revision;
}

export function getModelPricing(
  model: unknown,
  opts: { source?: string } | string = {},
): Rates {
  if (!model) return ZERO_PRICING;
  let lookupSource: string | null = null;

  if (typeof opts === "string") {
    lookupSource = opts.toLowerCase();
  } else if (typeof opts.source === "string") {
    lookupSource = opts.source.toLowerCase();
  }
  const cacheKey = lookupSource ? `${lookupSource}\0${model}` : String(model);

  if (state.negativeCache.has(cacheKey)) return ZERO_PRICING;

  const result = lookupPricing(model, {
    curated: curatedWithSelfhost,
    litellm: state.litellmPerMillionMap,
    source: lookupSource,
  });

  if (result.hit) {
    // Copy out and drop the _selfhost provenance flag: callers see only rate
    // fields, and a mutating caller cannot poison the shared table.
    const value = result.value;

    if (!value || typeof value !== "object") return value;
    const rates: Record<string, unknown> = { ...value };

    delete rates._selfhost;

    return rates as Rates;
  }

  state.negativeCache.add(cacheKey);

  return ZERO_PRICING;
}

// Memoized per pricing revision; copies go out so a mutating caller cannot
// poison the cache.
const pricingInfoCache: {
  revision: number;
  entries: Map<string, PricingInfo>;
} = {
  revision: -1,
  entries: new Map(),
};

export type PricingInfo = {
  status: "priced" | "free" | "unpriced";
  source: string | null;
  input: number;
  output: number;
  cache_read: number;
  cache_write: number;
};

// Preserve matcher provenance: a known zero rate is free, a missing model is
// unpriced. Both return zero dollars, but they mean different things in the UI.
export function getModelPricingInfo(
  model: unknown,
  opts: { source?: string } | string = {},
): PricingInfo {
  const source = typeof opts === "string" ? opts : opts.source;
  const sourceKey = typeof source === "string" ? source.toLowerCase() : null;

  if (pricingInfoCache.revision !== state.revision) {
    pricingInfoCache.revision = state.revision;
    pricingInfoCache.entries.clear();
  }
  const cacheKey = `${sourceKey || ""}\0${model ? String(model) : ""}`;
  let info = pricingInfoCache.entries.get(cacheKey);

  if (!info) {
    info = computeModelPricingInfo(model, opts, sourceKey);
    pricingInfoCache.entries.set(cacheKey, info);
  }

  return { ...info };
}

function computeModelPricingInfo(
  model: unknown,
  opts: { source?: string } | string,
  sourceKey: string | null,
): PricingInfo {
  const sourceForLookup = sourceKey ?? "";

  if (
    LOCAL_INFERENCE_SOURCES.has(sourceForLookup) ||
    PI_SUBSCRIPTION_SOURCES.has(sourceForLookup)
  ) {
    return {
      status: "free",
      source: LOCAL_INFERENCE_SOURCES.has(sourceForLookup)
        ? "local_inference"
        : "subscription",
      ...ZERO_PRICING,
    };
  }
  const result = lookupPricing(model, {
    curated: curatedWithSelfhost,
    litellm: state.litellmPerMillionMap,
    source: sourceKey,
  });
  const rates = getModelPricing(model, opts);
  const hitSource = !result.hit
    ? null
    : result.value &&
        typeof result.value === "object" &&
        result.value._selfhost === true
      ? "selfhost-curated"
      : result.source;

  return {
    status: !result.hit
      ? "unpriced"
      : [rates.input, rates.output, rates.cache_read, rates.cache_write].some(
            (value) => Number(value) > 0,
          )
        ? "priced"
        : "free",
    source: hitSource,
    input: Number(rates.input) || 0,
    output: Number(rates.output) || 0,
    cache_read: Number(rates.cache_read) || 0,
    cache_write: Number(rates.cache_write) || 0,
  };
}

function isDeepSeekTimePricedModel(model: unknown): boolean {
  const lower = String(model || "").toLowerCase();

  return DEEPSEEK_TIME_PRICED_MODELS.some((name) => lower.includes(name));
}

// From 00:00 Beijing time on 2026-08-23 DeepSeek bills whole Beijing weekends
// off-peak, peak hours included. The weekend is bounded in Beijing time, so it
// runs 16:00Z Friday to 16:00Z Sunday; China has had no DST since 1991.
const DEEPSEEK_WEEKEND_OFF_PEAK_FROM_MS = Date.UTC(2026, 7, 22, 16, 0, 0);

function isBeijingWeekendOffPeak(timestamp: number): boolean {
  if (timestamp < DEEPSEEK_WEEKEND_OFF_PEAK_FROM_MS) return false;
  const beijingDay = new Date(timestamp + 8 * 60 * 60 * 1000).getUTCDay();

  return beijingDay === 0 || beijingDay === 6;
}

function isDeepSeekOffPeak(
  row: Record<string, unknown> | null | undefined,
): boolean {
  if (row?.pricing_tier === "off_peak") return true;
  if (row?.pricing_tier === "peak") return false;
  const timestamp = Date.parse(String(row?.hour_start || ""));

  if (!Number.isFinite(timestamp)) return false;
  if (isBeijingWeekendOffPeak(timestamp)) return true;
  const hour = new Date(timestamp).getUTCHours();

  return !((hour >= 1 && hour < 4) || (hour >= 6 && hour < 10));
}

export function getRowPricing(
  row: Record<string, unknown> | null | undefined,
): Rates {
  const pricing = getModelPricing(row?.model, {
    source: row?.source as string | undefined,
  });

  // AStudio uses iFlytek MaaS fixed prices and does not inherit DeepSeek
  // public API time-based discounts.
  if (String(row?.source || "").toLowerCase() === "acode") return pricing;
  if (!isDeepSeekTimePricedModel(row?.model) || !isDeepSeekOffPeak(row))
    return pricing;

  return {
    ...pricing,
    input: (pricing.input || 0) * 0.5,
    output: (pricing.output || 0) * 0.5,
    cache_read: (pricing.cache_read || 0) * 0.5,
    cache_write: (pricing.cache_write || 0) * 0.5,
  };
}

// Aggregation passes (daily / heatmap / breakdown / device totals) re-cost
// the same row objects several times per request, and the account snapshot
// those rows come from is itself cached — memoize per object. Rows are
// treated as immutable once costed; resetPricingForTests swaps the table so
// a fresh pricing revision never serves a stale value.
let rowCostCache = new WeakMap<object, number>();

export function computeRowCost(
  row: Record<string, unknown> | null | undefined,
): number {
  if (!row || typeof row !== "object") return computeRowCostUncached(row);
  const hit = rowCostCache.get(row);

  if (hit !== undefined) return hit;
  const cost = computeRowCostUncached(row);

  rowCostCache.set(row, cost);

  return cost;
}

// Same formula and reasoning-folding rule as the reference computeRowCost.
function computeRowCostUncached(
  row: Record<string, unknown> | null | undefined,
): number {
  if (LOCAL_INFERENCE_SOURCES.has(String(row?.source || "").toLowerCase()))
    return 0;
  // Pi can route a turn through a subscription-backed Copilot provider; do not
  // reinterpret the Claude model name as an Anthropic API bill.
  if (PI_SUBSCRIPTION_SOURCES.has(String(row?.source || "").toLowerCase()))
    return 0;
  // Providers with an authoritative server-reported cost (Grok) keep it when
  // positive; zero remains the legacy "unreported" sentinel.
  const reportedCost = Number(row?.total_cost_usd);

  if (
    SOURCES_WITH_AUTHORITATIVE_COST.has(String(row?.source)) &&
    Number.isFinite(reportedCost) &&
    reportedCost > 0
  ) {
    return reportedCost;
  }
  const pricing = getRowPricing(row);
  // OmO/Codex-family sources report reasoning as a subset of `output`, so
  // charging reasoning again here would double-bill every reasoning token.
  const source = String(row?.source || "");
  const reasoningIncludedInOutput =
    source === "codex" ||
    source === "acode" ||
    source === "every-code" ||
    source === "omo" ||
    source === "cline" ||
    source === "muse";
  const reasoningCost = reasoningIncludedInOutput
    ? 0
    : (Number(row?.reasoning_output_tokens) || 0) *
      (Number(pricing.output) || 0);
  const baseCost =
    ((Number(row?.input_tokens) || 0) * (Number(pricing.input) || 0) +
      (Number(row?.output_tokens) || 0) * (Number(pricing.output) || 0) +
      (Number(row?.cached_input_tokens) || 0) *
        (Number(pricing.cache_read) || 0) +
      (Number(row?.cache_creation_input_tokens) || 0) *
        (Number(pricing.cache_write) || 0) +
      reasoningCost) /
    1_000_000;

  const model = String(row?.model || "").toLowerCase();
  const usesOpenAILongContextTier =
    model === "gpt-5.6" ||
    model.includes("gpt-5.6-sol") ||
    model.includes("gpt-6-astra") ||
    model.includes("gpt-6-sol") ||
    model.includes("gpt-6.1-sol");
  // Only models whose curated entry carries an explicit Fast/priority rate get
  // the tier premium.
  const priorityMultiplier = Number(pricing.priority_multiplier);
  const hasPriorityRates =
    Number.isFinite(priorityMultiplier) && priorityMultiplier > 1;

  if (!usesOpenAILongContextTier && !hasPriorityRates) return baseCost;

  const bounded = (value: unknown, total: unknown): number =>
    Math.min(Math.max(0, Number(value) || 0), Math.max(0, Number(total) || 0));

  const longInput = bounded(row?.long_context_input_tokens, row?.input_tokens);
  const longCached = bounded(
    row?.long_context_cached_input_tokens,
    row?.cached_input_tokens,
  );
  const longCacheWrite = bounded(
    row?.long_context_cache_creation_input_tokens,
    row?.cache_creation_input_tokens,
  );
  const longOutput = bounded(
    row?.long_context_output_tokens,
    row?.output_tokens,
  );
  const longReasoning = reasoningIncludedInOutput
    ? 0
    : bounded(
        row?.long_context_reasoning_output_tokens,
        row?.reasoning_output_tokens,
      );
  const longContextPremium = usesOpenAILongContextTier
    ? (longInput * (Number(pricing.input) || 0) +
        longCached * (Number(pricing.cache_read) || 0) +
        longCacheWrite * (Number(pricing.cache_write) || 0) +
        0.5 * longOutput * (Number(pricing.output) || 0) +
        0.5 * longReasoning * (Number(pricing.output) || 0)) /
      1_000_000
    : 0;

  if (!hasPriorityRates) return baseCost + longContextPremium;

  // Priority rates are a flat multiple of the context tier actually used; the
  // premium applies to the intersection columns only.
  const priorityInput = bounded(row?.priority_input_tokens, row?.input_tokens);
  const priorityCached = bounded(
    row?.priority_cached_input_tokens,
    row?.cached_input_tokens,
  );
  const priorityCacheWrite = bounded(
    row?.priority_cache_creation_input_tokens,
    row?.cache_creation_input_tokens,
  );
  const priorityOutput = bounded(
    row?.priority_output_tokens,
    row?.output_tokens,
  );
  const priorityReasoning = reasoningIncludedInOutput
    ? 0
    : bounded(
        row?.priority_reasoning_output_tokens,
        row?.reasoning_output_tokens,
      );
  const priorityBase =
    (priorityInput * (Number(pricing.input) || 0) +
      priorityCached * (Number(pricing.cache_read) || 0) +
      priorityCacheWrite * (Number(pricing.cache_write) || 0) +
      priorityOutput * (Number(pricing.output) || 0) +
      priorityReasoning * (Number(pricing.output) || 0)) /
    1_000_000;

  const priorityLong = usesOpenAILongContextTier
    ? (bounded(
        row?.priority_long_context_input_tokens,
        Math.min(priorityInput, longInput),
      ) *
        (Number(pricing.input) || 0) +
        bounded(
          row?.priority_long_context_cached_input_tokens,
          Math.min(priorityCached, longCached),
        ) *
          (Number(pricing.cache_read) || 0) +
        bounded(
          row?.priority_long_context_cache_creation_input_tokens,
          Math.min(priorityCacheWrite, longCacheWrite),
        ) *
          (Number(pricing.cache_write) || 0) +
        0.5 *
          bounded(
            row?.priority_long_context_output_tokens,
            Math.min(priorityOutput, longOutput),
          ) *
          (Number(pricing.output) || 0) +
        0.5 *
          bounded(
            row?.priority_long_context_reasoning_output_tokens,
            Math.min(priorityReasoning, longReasoning),
          ) *
          (Number(pricing.output) || 0)) /
      1_000_000
    : 0;

  const priorityPremium =
    (priorityMultiplier - 1) * (priorityBase + priorityLong);

  return baseCost + longContextPremium + priorityPremium;
}

// Backwards-compatible curated table export for tests.
export const MODEL_PRICING = curated.exact;

// Internal hooks for tests.
export function __getStateForTests() {
  return state;
}

export function __getSelfhostMergeForTests() {
  return {
    curated: curatedWithSelfhost,
    droppedKeys: selfhostDroppedKeys,
  };
}

export { OPENAI_LONG_CONTEXT_INPUT_THRESHOLD };
