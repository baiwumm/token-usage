// Pure pricing-lookup logic. No I/O, no async. Vendored verbatim from the
// reference implementation (api/_lib/pricing/matcher.js), TS-ported.
//
// Resolve order:
//   0. CURATED source exact match (source-specific pricing)
//   1. CURATED exact match (self-defined aliases like kiro-*, hy3-*)
//   2. LiteLLM exact match (mainstream claude/gpt-5/gemini)
//   3. CURATED alias (e.g. "auto" -> "composer-1")
//   4. CURATED fuzzy substring (e.g. "kiro-future-xyz" matches via "kiro")
//   5. LiteLLM suffix-strip (gpt-5-codex-high-fast -> gpt-5-codex)
//   5b. LiteLLM provider-prefix strip (mimo-v2.5-pro -> openrouter/xiaomi/mimo-v2.5-pro)
//   6. LiteLLM reverse substring (longest-key first)
//   7. null  (caller decides what to do — typically zero-pricing + negative cache)

export type Rates = {
  input?: number;
  output?: number;
  cache_read?: number;
  cache_write?: number;
  priority_multiplier?: number;
  [key: string]: unknown;
};

export type CuratedTables = {
  exact: Record<string, Rates>;
  alias: Record<string, string>;
  source_exact: Record<string, Record<string, Rates>>;
  fuzzy: Array<{ match: string; ref: string }>;
};

export type LookupResult =
  | { hit: true; source: string; value: Rates }
  | { hit: false; source: string; value: null };

const SUFFIX_STRIP_PATTERNS = [
  /-xhigh-fast$/,
  /-high-fast$/,
  /-medium-fast$/,
  /-low-fast$/,
  /-xhigh$/,
  /-high$/,
  /-medium$/,
  /-low$/,
  /-fast$/,
];

export function stripReasoningSuffix(model: string): string {
  for (const re of SUFFIX_STRIP_PATTERNS) {
    if (re.test(model)) return model.replace(re, "");
  }

  return model;
}

export function normalizeAntigravityModel(
  model: string | null | undefined,
): string | null | undefined {
  if (!model || typeof model !== "string") return model;
  let lower = model
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b(thinking|xhigh|high|medium|low|fast)\b/gi, " ")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  lower = stripReasoningSuffix(lower);

  if (lower.startsWith("gemini-claude-") || lower.startsWith("gemini-gpt-")) {
    lower = lower.substring(7);
  }

  if (/^gemini-3\.\d+-flash-lite/.test(lower)) return "gemini-2.5-flash-lite";
  if (/^gemini-3\.\d+-flash/.test(lower)) return "gemini-2.5-flash";
  if (/^gemini-3\.\d+-pro/.test(lower)) return "gemini-2.5-pro";
  if (/^claude-(sonnet|opus|haiku)-4\.\d+/.test(lower)) {
    return lower.replace(
      /^claude-(sonnet|opus|haiku)-4\.(\d+)/,
      "claude-$1-4-$2",
    );
  }
  if (lower.startsWith("gpt-oss-120b")) return "antigravity-gpt-oss-120b";

  return lower;
}

// Zed stores model names inconsistently across versions and providers; see the
// reference matcher for the rationale. "fast" must NOT be stripped here (it is
// part of `grok-code-fast-1`).
export function normalizeZedModel(
  model: string | null | undefined,
): string | null | undefined {
  if (!model || typeof model !== "string") return model;
  let m = model
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9./]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (/^claude-(sonnet|opus|haiku)-\d+\.\d+/.test(m)) {
    m = m.replace(/^(claude-(?:sonnet|opus|haiku)-\d+)\.(\d+)/, "$1-$2");
  }

  return m;
}

// Claude desktop/CLI sometimes reports display-style names; relays add
// provider path prefixes. Normalize lookup-only; raw names stay in storage.
export function normalizeClaudeModel(
  model: string | null | undefined,
): string | null | undefined {
  if (!model || typeof model !== "string") return model;
  const base = model.includes("/")
    ? model.slice(model.lastIndexOf("/") + 1)
    : model;
  let m = base
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (/^claude-(sonnet|opus|haiku)-\d+\.\d+/.test(m)) {
    return m.replace(/^(claude-(?:sonnet|opus|haiku)-\d+)\.(\d+)/, "$1-$2");
  }
  if (/^(sonnet|opus|haiku)-\d+[.-]\d+/.test(m)) {
    return m
      .replace(/^(sonnet|opus|haiku)-/, "claude-$1-")
      .replace(/^(claude-(?:sonnet|opus|haiku)-\d+)\.(\d+)/, "$1-$2");
  }
  // Restore inverted tier/version order ONLY for major>=4; Claude 3.x is
  // genuinely version-first and must stay untouched.
  if (/^claude-(?:[4-9]|\d{2,})[.-]\d+-(?:sonnet|opus|haiku)/.test(m)) {
    return m.replace(
      /^claude-(\d+)[.-](\d+)-(sonnet|opus|haiku)/,
      "claude-$3-$1-$2",
    );
  }

  return m;
}

// Cursor decorates model ids with reasoning effort; preserve Fast SKUs.
export function normalizeCursorModel(
  model: string | null | undefined,
): string | null | undefined {
  if (!model || typeof model !== "string") return model;
  let m = model
    .trim()
    .replace(/\([^)]*\)/g, " ")
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
  const parts = m.split("-");
  const isFast = parts.includes("fast");

  if (/^(?:cursor-)?grok-4[.-]7(?:-|$)/.test(m)) {
    return isFast ? "cursor-grok-4.7-fast" : "cursor-grok-4.7";
  }
  if (/^(?:cursor-)?grok-4[.-]6(?:-|$)/.test(m)) {
    return isFast ? "cursor-grok-4.6-fast" : "cursor-grok-4.6";
  }
  if (/^(?:cursor-)?grok-4[.-]5(?:-|$)/.test(m)) {
    return isFast ? "cursor-grok-4.5-fast" : "cursor-grok-4.5";
  }

  const decorations = new Set([
    "thinking",
    "xhigh",
    "high",
    "medium",
    "low",
    "minimal",
  ]);

  m = parts.filter((part) => !decorations.has(part)).join("-");
  if (m.startsWith("claude-")) return normalizeClaudeModel(m);

  return m;
}

// WorkBuddy's auto-router records the literal "auto"; map to its default
// Tencent Hunyuan model instead of Cursor's Composer alias.
export function normalizeWorkbuddyModel(
  model: string | null | undefined,
): string | null | undefined {
  if (typeof model === "string" && model.trim().toLowerCase() === "auto") {
    return "hy3-preview-agent";
  }

  return model;
}

export function normalizeIFlytekMaasModel(
  model: string | null | undefined,
): string | null | undefined {
  if (!model || typeof model !== "string") return model;
  const trimmed = model.trim();
  const lower = trimmed.toLowerCase();

  if (lower === "xsparkx2agent") return "xsparkx2";

  return trimmed;
}

// Unsloth Studio mixes local engines and paid providers; sentinel prevents
// the reverse-substring matcher from billing a local model as a cloud SKU.
export function normalizeUnslothModel(
  model: string | null | undefined,
): string | null | undefined {
  if (typeof model !== "string") return model;
  const lower = model.trim().toLowerCase();

  if (lower.startsWith("local/") || lower.startsWith("unpriced/")) {
    return "__tokentracker_unpriced_unsloth_model__";
  }

  return model;
}

// Per-source model-name normalizers, applied at pricing-lookup time only.
const SOURCE_MODEL_NORMALIZERS: Record<
  string,
  (m: string | null | undefined) => string | null | undefined
> = {
  acode: normalizeIFlytekMaasModel,
  antigravity: normalizeAntigravityModel,
  claude: normalizeClaudeModel,
  cursor: normalizeCursorModel,
  "pi-anthropic": normalizeClaudeModel,
  "prime-agent-anthropic": normalizeClaudeModel,
  zed: normalizeZedModel,
  unsloth: normalizeUnslothModel,
  workbuddy: normalizeWorkbuddyModel,
};

const sortedKeysCache = new WeakMap<object, string[]>();

function getSortedKeys(litellm: Record<string, Rates>): string[] {
  let cached = sortedKeysCache.get(litellm);

  if (!cached) {
    cached = Object.keys(litellm).sort((a, b) => b.length - a.length);
    sortedKeysCache.set(litellm, cached);
  }

  return cached;
}

function buildDotRestoredModel(model: string): string {
  if (typeof model !== "string") return "";
  const lower = model.toLowerCase();
  const restored = lower.replace(/(\d+)-(\d+)/g, "$1.$2");

  return restored === lower ? "" : restored;
}

function lookupExactCaseInsensitive(
  table: Record<string, Rates> | undefined,
  model: string,
): Rates | null {
  if (!table || !model) return null;
  if (table[model]) return table[model];
  const lower = model.toLowerCase();

  for (const key of Object.keys(table)) {
    if (key.toLowerCase() === lower) return table[key];
  }

  return null;
}

function lookupContainedExactCaseInsensitive(
  table: Record<string, Rates> | undefined,
  model: string,
): Rates | null {
  if (!table || !model) return null;
  const lower = model.toLowerCase();
  const keys = Object.keys(table).sort((a, b) => b.length - a.length);

  for (const key of keys) {
    const start = lower.indexOf(key.toLowerCase());

    if (start < 0) continue;
    // A model generation must not match a later numeric version (Opus 5.5
    // is a separate SKU from Opus 5). Dated and provider suffixes still work.
    const suffix = lower.slice(start + key.length);

    if (/^[.\d]/.test(suffix)) continue;

    return table[key];
  }

  return null;
}

export function lookupPricing(
  model: unknown,
  {
    curated,
    litellm,
    source,
  }: {
    curated: CuratedTables;
    litellm: Record<string, Rates>;
    source?: string | null;
  } = {} as never,
): LookupResult {
  if (!model || typeof model !== "string") {
    return { hit: false, source: "empty", value: null };
  }
  const normalize =
    typeof source === "string"
      ? SOURCE_MODEL_NORMALIZERS[source.toLowerCase()]
      : null;
  const lookupModel = (normalize ? normalize(model) : model) as string;
  const lower = lookupModel.toLowerCase();
  const dotForm = buildDotRestoredModel(lookupModel);

  // 0. CURATED source exact. Source-specific prices apply only to their source.
  const sourceKey = typeof source === "string" ? source.toLowerCase() : "";

  if (sourceKey === "workbuddy-ai" && lower.trim() === "auto") {
    return { hit: false, source: "miss", value: null };
  }
  if (sourceKey === "cline" && lower.endsWith(":free")) {
    return {
      hit: true,
      source: "curated:cline-free-suffix",
      value: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    };
  }
  // OpenCode Zen free models carry a `-free` suffix on the paid model id.
  if (sourceKey === "opencode" && lower.endsWith("-free")) {
    return {
      hit: true,
      source: "curated:opencode-free-suffix",
      value: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
    };
  }
  // AStudio does not disclose its routed model. Stop before generic aliases
  // and fuzzy matching can turn an unresolved router into a priced model.
  if (sourceKey === "acode" && (lower === "auto" || lower.endsWith("-auto"))) {
    return { hit: false, source: "miss", value: null };
  }
  const sourceExact = curated.source_exact?.[sourceKey];

  if (sourceExact) {
    const sourceValue = lookupExactCaseInsensitive(sourceExact, lookupModel);

    if (sourceValue) {
      return { hit: true, source: "curated:source-exact", value: sourceValue };
    }
  }

  // 1. CURATED exact. Qwen Flash's provider-qualified and dated IDs share the
  // reference SKU; the boundary stays strict (Flash-Next/Max priced apart).
  if (
    /(?:^|\/)qwen3[.-]8-flash(?:-\d{4}-\d{2}-\d{2})?$/.test(lower.trim()) &&
    curated.exact?.["qwen3.8-flash"]
  ) {
    return {
      hit: true,
      source: "curated:exact",
      value: curated.exact["qwen3.8-flash"],
    };
  }
  if (curated.exact && curated.exact[lookupModel]) {
    return {
      hit: true,
      source: "curated:exact",
      value: curated.exact[lookupModel],
    };
  }
  const curatedDotExact = lookupExactCaseInsensitive(curated.exact, dotForm);

  if (curatedDotExact) {
    return { hit: true, source: "curated:exact-dot", value: curatedDotExact };
  }

  // 2. LiteLLM exact
  if (litellm && litellm[lookupModel]) {
    return { hit: true, source: "litellm:exact", value: litellm[lookupModel] };
  }
  const litellmDotExact = lookupExactCaseInsensitive(litellm, dotForm);

  if (litellmDotExact) {
    return { hit: true, source: "litellm:exact-dot", value: litellmDotExact };
  }
  const curatedDotContainedExact = lookupContainedExactCaseInsensitive(
    curated.exact,
    dotForm,
  );

  if (curatedDotContainedExact) {
    return {
      hit: true,
      source: "curated:exact-dot",
      value: curatedDotContainedExact,
    };
  }

  // 3. CURATED alias (literal mapping like "auto" -> "composer-1")
  if (
    curated.alias &&
    curated.alias[lookupModel] &&
    curated.exact[curated.alias[lookupModel]]
  ) {
    return {
      hit: true,
      source: "curated:alias",
      value: curated.exact[curated.alias[lookupModel]],
    };
  }

  // 4. CURATED fuzzy substring, also over the dot-restored variant.
  if (Array.isArray(curated.fuzzy)) {
    for (const { match, ref } of curated.fuzzy) {
      if (!match || !ref) continue;
      const needle = match.toLowerCase();

      if (!curated.exact[ref]) continue;
      if (lower.includes(needle)) {
        return {
          hit: true,
          source: "curated:fuzzy",
          value: curated.exact[ref],
        };
      }
      if (dotForm && dotForm.includes(needle)) {
        return {
          hit: true,
          source: "curated:fuzzy",
          value: curated.exact[ref],
        };
      }
    }
  }

  // 5. LiteLLM suffix-strip
  if (litellm) {
    const stripped = stripReasoningSuffix(lookupModel);

    if (stripped !== lookupModel && litellm[stripped]) {
      return { hit: true, source: "litellm:strip", value: litellm[stripped] };
    }
  }

  // 5b. LiteLLM provider-prefix strip. Pick the lexicographically smallest
  // provider key so the resolved price is deterministic.
  if (litellm) {
    const suffix = "/" + lower;
    let best: string | null = null;

    for (const key of Object.keys(litellm)) {
      if (key.length > suffix.length && key.toLowerCase().endsWith(suffix)) {
        if (best === null || key < best) best = key;
      }
    }
    if (best)
      return {
        hit: true,
        source: "litellm:prefix-strip",
        value: litellm[best],
      };
  }

  // 6. LiteLLM reverse substring (longest-key first)
  if (litellm) {
    const sorted = getSortedKeys(litellm);

    for (const key of sorted) {
      const keyLower = key.toLowerCase();

      // Only accept if model is a superset of key (model contains key), to
      // avoid e.g. "gpt-5" matching "gpt-5-pro" in the wrong direction.
      if (lower.includes(keyLower) || (dotForm && dotForm.includes(keyLower))) {
        return { hit: true, source: "litellm:fuzzy", value: litellm[key] };
      }
    }
  }

  return { hit: false, source: "miss", value: null };
}

// Convert one LiteLLM entry (per-token) to internal per-million USD shape.
function roundToTenDecimals(n: number): number {
  return Math.round(n * 1e10) / 1e10;
}

export function convertLitellmEntry(entry: unknown): Rates | null {
  if (!entry || typeof entry !== "object") return null;
  const record = entry as Record<string, unknown>;
  const out: Rates = {};

  if (typeof record.input_cost_per_token === "number") {
    out.input = roundToTenDecimals(record.input_cost_per_token * 1_000_000);
  }
  if (typeof record.output_cost_per_token === "number") {
    out.output = roundToTenDecimals(record.output_cost_per_token * 1_000_000);
  }
  if (typeof record.cache_read_input_token_cost === "number") {
    out.cache_read = roundToTenDecimals(
      record.cache_read_input_token_cost * 1_000_000,
    );
  }
  if (typeof record.cache_creation_input_token_cost === "number") {
    out.cache_write = roundToTenDecimals(
      record.cache_creation_input_token_cost * 1_000_000,
    );
  }

  return Object.keys(out).length ? out : null;
}

// Build a per-million-USD map from a LiteLLM raw map. Skips meta keys.
export function buildLitellmPerMillionMap(
  rawData: unknown,
): Record<string, Rates> {
  if (!rawData || typeof rawData !== "object") return {};
  const out: Record<string, Rates> = {};

  for (const [name, entry] of Object.entries(
    rawData as Record<string, unknown>,
  )) {
    if (name.startsWith("_")) continue;
    const converted = convertLitellmEntry(entry);

    if (converted) out[name] = converted;
  }

  return out;
}
