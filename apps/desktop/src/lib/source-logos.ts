// Collector source identity for the desktop (display-level only — the queue
// keeps the collector-reported source strings). Ported from web's
// lib/sources.ts (docs/ui-spec.md 来源/模型图标) so both UIs show the same
// canonical names, brand logos and dark twins; grouping merges aliases
// (trae-cn → trae, qoder-cn → qoder, …) before the share math.

import type { SourceUsage } from "@/lib/queue-lines";

const CANONICAL_RULES: Array<[test: string, id: string]> = [
  ["pi-zai-coding-cn", "pi"],
  ["pi-stepfun", "pi"],
  ["pi", "pi"],
  ["dsh", "dsh"],
  ["claude-code", "claude"],
  ["claude", "claude"],
  ["trae-cn", "trae"],
  ["trae", "trae"],
  ["qoder-cn", "qoder"],
  ["qoder", "qoder"],
  ["gemini-cli", "gemini"],
  ["gemini", "gemini"],
  ["command_code", "command-code"],
  ["command-code", "command-code"],
  ["deepseek", "deepseek"],
  ["kilo-cli", "kilo"],
  ["kilocode", "kilo"],
  ["minimax", "minimax"],
];

const SOURCE_LABELS: Record<string, string> = {
  zcode: "ZCode",
  codex: "Codex",
  opencode: "OpenCode",
  cursor: "Cursor",
  trae: "Trae",
  qoder: "Qoder",
  reasonix: "Reasonix",
  antigravity: "Antigravity",
  mimo: "Mimo",
  kimi: "Kimi",
  "kimi-code": "Kimi Code",
  gemini: "Gemini",
  grok: "Grok",
  copilot: "Copilot",
  cline: "Cline",
  deepseek: "DeepSeek",
  dsh: "DeepSeek Harness",
  pi: "Pi",
  workbuddy: "WorkBuddy",
  codebuddy: "CodeBuddy",
  "command-code": "Command Code",
  kiro: "Kiro",
  devin: "Devin",
  droid: "Droid",
  dumate: "Qianfan",
  "every-code": "Every Code",
  goose: "Goose",
  lmstudio: "LM Studio",
  muse: "Muse",
  omo: "OmO",
  omp: "Oh My Pi",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  kilo: "Kilo",
  acode: "ACode",
  anythingllm: "AnythingLLM",
  unsloth: "Unsloth",
  zed: "Zed",
  minimax: "MiniMax",
};

/** Logo file under public/brand-logos per canonical id. */
const SOURCE_LOGOS: Record<string, string> = {
  zcode: "zcode.svg",
  codex: "codex.svg",
  opencode: "opencode.svg",
  cursor: "cursor.svg",
  trae: "trae.svg",
  qoder: "qoder.svg",
  reasonix: "reasonix.png",
  antigravity: "antigravity.svg",
  mimo: "mimo.svg",
  kimi: "kimi.svg",
  "kimi-code": "kimi.svg",
  gemini: "gemini.svg",
  grok: "grok.svg",
  copilot: "copilot.svg",
  cline: "cline.png",
  deepseek: "deepseek.svg",
  dsh: "deepseek.svg",
  pi: "pi.svg",
  workbuddy: "workbuddy.svg",
  codebuddy: "codebuddy.svg",
  "command-code": "commandcode.svg",
  kiro: "kiro.svg",
  devin: "devin.svg",
  lmstudio: "lmstudio.svg",
  omp: "omp.svg",
  openclaw: "openclaw.svg",
  hermes: "hermes.svg",
  kilo: "kilo.svg",
  acode: "acode.png",
  anythingllm: "anythingllm.svg",
  unsloth: "unsloth.svg",
  zed: "zed.svg",
  stepfun: "stepfun.png",
  minimax: "minimax.svg",
};

/** White-on-transparent marks that need a backdrop to read on light cards. */
const WHITE_LOGOS = new Set<string>([]);

/**
 * Light-theme logo files that ship a dark-theme twin: the twin lives next to
 * the light file as `<name>-dark.<same ext>` under public/brand-logos, and
 * the light file name goes in this set to activate it. Registration is the
 * switch — an unregistered (or not-yet-dropped) twin would render a broken
 * image in dark mode.
 */
const DARK_LOGO_FILES = new Set<string>([
  "acode.png",
  "anythingllm.svg",
  "codex.svg",
  "copilot.svg",
  "cursor.svg",
  "devin.svg",
  "grok.svg",
  "hermes.svg",
  "kiro.svg",
  "mimo.svg",
  "qoder.svg",
  "zcode.svg",
  "zed.svg",
]);

export function canonicalSource(source: string): string {
  const key = String(source || "")
    .trim()
    .toLowerCase();

  for (const [test, id] of CANONICAL_RULES) {
    if (key === test || key.startsWith(test)) return id;
  }

  return key || "unknown";
}

export function sourceDisplayLabel(source: string): string {
  const id = canonicalSource(source);

  return SOURCE_LABELS[id] ?? source;
}

export function sourceLogoFile(source: string): string | null {
  const file = SOURCE_LOGOS[canonicalSource(source)];

  return file ? `/brand-logos/${file}` : null;
}

/** Dark-theme twin for a registered logo file, if any. */
export function darkLogoFile(file: string): string | null {
  const base = file.replace(/^\/brand-logos\//, "");

  if (!DARK_LOGO_FILES.has(base)) return null;

  const dot = base.lastIndexOf(".");

  return dot === -1
    ? null
    : `/brand-logos/${base.slice(0, dot)}-dark${base.slice(dot)}`;
}

export function logoNeedsBackdrop(file: string): boolean {
  return WHITE_LOGOS.has(file.replace(/^\/brand-logos\//, ""));
}

// Deterministic letter-tile palette for sources without a shipped logo.
const TILE_COLORS = [
  "#2563eb",
  "#0891b2",
  "#16a34a",
  "#ca8a04",
  "#ea580c",
  "#dc2626",
  "#9333ea",
  "#0f766e",
] as const;

export function tileColorFor(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return TILE_COLORS[hash % TILE_COLORS.length];
}

/**
 * Merge raw collector rows into canonical groups and recompute shares against
 * the window total (web's groupCanonicalSources + desktop share math). Sorted
 * by tokens descending; the share of a merged row is the sum of its members.
 */
export function groupSourceUsage(
  sources: readonly SourceUsage[],
): SourceUsage[] {
  const byId = new Map<string, SourceUsage>();

  for (const entry of sources) {
    const id = canonicalSource(entry.source);
    const agg = byId.get(id);

    if (agg) {
      agg.tokens += entry.tokens;
      agg.conversations += entry.conversations;
    } else {
      byId.set(id, { ...entry, source: id });
    }
  }

  const total = [...byId.values()].reduce((sum, row) => sum + row.tokens, 0);

  return [...byId.values()]
    .map((row) => ({
      ...row,
      share: total > 0 ? row.tokens / total : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens);
}
