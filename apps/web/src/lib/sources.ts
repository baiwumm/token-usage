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
  omp: "omp.svg",
  openclaw: "openclaw.svg",
  hermes: "hermes.svg",
  kilo: "kilo.svg",
  acode: "acode.png",
  anythingllm: "anythingllm.svg",
  unsloth: "unsloth.svg",
  zed: "zed.svg",
  stepfun: "stepfun.png",
};

/** White-on-transparent marks that need a backdrop to read on light cards. */
const WHITE_LOGOS = new Set<string>([]);

/**
 * Light-theme logo files that ship a dark-theme twin: the twin lives next to
 * the light file as `<name>-dark.<same ext>` under public/brand-logos, and
 * the light file name goes in this set to activate it. Registration is the
 * switch — an unregistered (or not-yet-dropped) twin would render a broken
 * image in dark mode. Example: codex.svg + codex-dark.svg → add "codex.svg".
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

/** Dark-theme twin for a registered logo file, if any. */
export function darkLogoFile(file: string): string | null {
  const base = file.replace(/^\/brand-logos\//, "");

  if (!DARK_LOGO_FILES.has(base)) return null;

  const dot = base.lastIndexOf(".");

  return dot === -1
    ? null
    : `/brand-logos/${base.slice(0, dot)}-dark${base.slice(dot)}`;
}

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
  ["step", "stepfun.png"],
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
