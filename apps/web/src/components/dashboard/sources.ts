"use client";

// Collector source identity (docs/ui-spec.md 来源/模型图标): raw collector
// ids → canonical id → display label + logo, following juejin-usage's
// canonicalSource/SOURCE_LABELS pattern. Display-level only — the wire and
// the database keep the collector-reported source strings.

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
  lmstudio: "LM Studio",
  openclaw: "OpenClaw",
  hermes: "Hermes",
  kilo: "Kilo",
  acode: "ACode",
  anythingllm: "AnythingLLM",
  unsloth: "Unsloth",
  zed: "Zed",
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
  openclaw: "openclaw.svg",
  hermes: "hermes.svg",
  kilo: "kilo.svg",
  acode: "acode.png",
  anythingllm: "anythingllm.svg",
  unsloth: "unsloth.svg",
};

/** White-on-transparent marks that need a backdrop to read on light cards. */
const WHITE_LOGOS = new Set(["pi.svg"]);

/** Model-name prefixes that carry a recognizable vendor mark. */
const MODEL_PREFIX_LOGOS: Array<[prefix: string, file: string]> = [
  // Zhipu GLM is the ZCode mark (operator call, 2026-10-25).
  ["glm", "zcode.svg"],
  ["z-ai", "zcode.svg"],
  ["zai", "zcode.svg"],
  ["deepseek", "deepseek.svg"],
  ["kimi", "kimi.svg"],
  ["gemini", "gemini.svg"],
  ["grok", "grok.svg"],
  ["mimo", "mimo.svg"],
  ["gpt", "codex.svg"],
  ["composer", "cursor.svg"],
  ["claude", "claude-code.svg"],
];

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

export function logoNeedsBackdrop(file: string): boolean {
  return WHITE_LOGOS.has(file.replace(/^\/brand-logos\//, ""));
}

/** Model-name logos bypass canonical sources (vendor marks on model ids). */
export function modelLogoFile(model: string): string | null {
  const key = String(model || "")
    .trim()
    .toLowerCase();

  for (const [prefix, file] of MODEL_PREFIX_LOGOS) {
    if (key.startsWith(prefix)) return `/brand-logos/${file}`;
  }

  return null;
}
