"use strict";

// TRAE stores the last request's usage alongside optional whole-turn prompt
// and completion counters. Reconcile the request first: its total cannot
// validate a whole-turn count, and its cache count is not a whole-turn count.
function normalizeTraeUsage(raw, { model } = {}) {
  let usage = raw;
  if (typeof usage === "string") {
    try { usage = JSON.parse(usage); } catch { return null; }
  }
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  const fields = [
    "prompt_tokens", "prompt_tokens_total", "input_tokens",
    "completion_tokens", "completion_tokens_total", "output_tokens",
    "cache_read_input_tokens", "cache_creation_input_tokens",
    "reasoning_tokens", "reasoning_output_tokens", "total_tokens",
  ];
  for (const field of fields) {
    if (usage[field] != null && (!Number.isSafeInteger(usage[field]) || usage[field] < 0)) {
      return null;
    }
  }
  for (const [left, right] of [["prompt_tokens", "input_tokens"],
    ["completion_tokens", "output_tokens"], ["reasoning_tokens", "reasoning_output_tokens"]]) {
    if (usage[left] != null && usage[right] != null && usage[left] !== usage[right]) return null;
  }
  if (!["prompt_tokens", "prompt_tokens_total", "input_tokens", "completion_tokens",
    "completion_tokens_total", "output_tokens"].some((field) => usage[field] != null)) {
    return null;
  }
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.prompt_tokens_total ?? 0;
  const output = usage.completion_tokens ?? usage.output_tokens ?? usage.completion_tokens_total ?? 0;
  const aggregateInput = usage.prompt_tokens_total > 0 ? usage.prompt_tokens_total : input;
  const aggregateOutput = usage.completion_tokens_total > 0 ? usage.completion_tokens_total : output;
  if (aggregateInput < input || aggregateOutput < output) return null;
  const cached = usage.cache_read_input_tokens ?? 0;
  let written = usage.cache_creation_input_tokens ?? 0;
  let reasoning = usage.reasoning_tokens ?? usage.reasoning_output_tokens ?? 0;
  let estimated = false;
  const isGemini = /^gemini(?:-|$)/i.test(normalizeTraeModel(model ?? usage.name));
  // Some TRAE Gemini rows copy the cache-read counter into the write field,
  // even when their sum exceeds the entire prompt. Gemini's GenerateContent
  // metadata reports cachedContentTokenCount, not an additional write count.
  // Keep the reported read and mark this narrow compatibility repair estimated.
  if (isGemini && cached > 0 && written === cached && cached + written > input) {
    written = 0;
    estimated = true;
  }
  // Older TRAE Gemini rows omit thoughts while retaining Gemini's total
  // (prompt + candidates + thoughts). Infer only that documented residual,
  // never an arbitrary provider's unexplained total.
  if (isGemini && usage.reasoning_tokens == null && usage.reasoning_output_tokens == null &&
    usage.total_tokens > input + output && written === 0 && cached <= input) {
    reasoning = usage.total_tokens - input - output;
    estimated = true;
  }
  // A total is necessary to distinguish inclusive/exclusive counters when
  // cache or reasoning is present. Missing metadata must not imply $0 usage
  // or guessed input. A zero *_total field means unset, not an empty turn.
  if (usage.total_tokens == null && (cached || written || reasoning)) return null;
  const total = usage.total_tokens ?? (input + output);
  if (!Number.isSafeInteger(total)) return null;
  const candidates = new Map();
  for (const includedCache of new Set([cached + written, cached, 0])) {
    for (const includedReasoning of new Set([reasoning, 0])) {
      const noncached = input - includedCache;
      const nonreasoning = output - includedReasoning;
      if (noncached < 0 || nonreasoning < 0) continue;
      if (noncached + cached + written + nonreasoning + reasoning !== total) continue;
      const totals = {
        input_tokens: noncached,
        cached_input_tokens: cached,
        cache_creation_input_tokens: written,
        output_tokens: nonreasoning,
        reasoning_output_tokens: reasoning,
        total_tokens: total,
      };
      candidates.set(JSON.stringify(totals), totals);
    }
  }
  if (candidates.size !== 1) return null;
  const totals = candidates.values().next().value;
  if (aggregateInput !== input || aggregateOutput !== output) {
    // The *_total counters cover the whole turn; the cache and reasoning fields
    // describe its final request. The difference in prompt tokens has no cache
    // split, so it counts toward total_tokens but no priced column. Completion
    // tokens are priced the same with or without caching and stay in output.
    const unpriced = aggregateInput - input;
    totals.output_tokens += aggregateOutput - output;
    totals.total_tokens += unpriced + aggregateOutput - output;
    if (unpriced > 0) totals.unpriced_input_tokens = unpriced;
  }
  if (Object.values(totals).some((value) => !Number.isSafeInteger(value))) return null;
  if (estimated) totals.usage_precision = "estimated";
  return totals;
}

// TRAE writes one exact provider usage per model request into
// server_history_info.extra_info for agent loops that issue many requests per
// turn; chat_turn keeps only the last request. The exact counters use the same
// inclusive-completion semantics as chat_turn, so the same normalizer applies.
const TRAE_REQUEST_SEMANTICS = "provider_raw_usage_completion_includes_reasoning";

function traeExactCount(value, fallback = null) {
  if (value == null) return fallback;
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value === "string") {
    const text = value.trim();
    if (!/^\d+$/.test(text)) return null;
    const parsed = Number(text);
    return Number.isSafeInteger(parsed) ? parsed : null;
  }
  return null;
}

function normalizeTraeRequestUsage(usage, { model } = {}) {
  if (!usage || typeof usage !== "object" || Array.isArray(usage)) return null;
  if (usage.usage_kind !== "chat_completion" || usage.semantics !== TRAE_REQUEST_SEMANTICS) return null;
  const prompt = traeExactCount(usage.prompt_tokens);
  const completion = traeExactCount(usage.completion_tokens);
  const reasoning = traeExactCount(usage.reasoning_tokens, 0);
  const total = traeExactCount(usage.total_tokens);
  if (prompt == null || completion == null || reasoning == null || total == null) return null;
  // Provider semantics: completion includes reasoning, and the exact total is
  // prompt + completion. Anything else is a malformed row, not a new layout.
  if (reasoning > completion || prompt + completion !== total) return null;
  return normalizeTraeUsage({
    prompt_tokens: prompt,
    completion_tokens: completion,
    reasoning_tokens: reasoning,
    total_tokens: total,
    prompt_tokens_total: 0,
    completion_tokens_total: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
  }, { model });
}

function normalizeTraeModel(value) {
  if (typeof value !== "string") return "trae-unknown";
  const model = value.trim().split("__")[0].toLowerCase().replace(/\s+/g, "-");
  // TRAE's display alias otherwise fuzzy-matches a regional Sonnet SKU and
  // loses cache pricing. Sonnet 4 has the fixed 2025-05-14 API model id.
  if (model === "claude-4-sonnet") return "claude-sonnet-4-20250514";
  return model && model !== "-" && !model.includes("|") ? model : "trae-unknown";
}

function traeTimestamp(value) {
  if (value == null || value === "") return null;
  let millis;
  if (typeof value === "number" || (typeof value === "string" && /^\d+(\.\d+)?$/.test(value))) {
    const numeric = Number(value);
    millis = numeric < 100_000_000_000 ? numeric * 1000 : numeric;
  } else if (typeof value === "string") {
    millis = Date.parse(value);
  }
  if (!Number.isFinite(millis) || millis <= 0) return null;
  const date = new Date(millis);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

module.exports = {
  normalizeTraeUsage,
  normalizeTraeRequestUsage,
  normalizeTraeModel,
  traeTimestamp,
};
