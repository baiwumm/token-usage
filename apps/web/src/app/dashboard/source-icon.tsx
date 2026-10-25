"use client";

// Source / model icon: brand logo first (public/brand-logos, MIT assets from
// TokenTracker + juejin-usage), deterministic colored tile as the fallback
// for anything without a shipped logo. Drop a `<name>.svg` into
// public/brand-logos and add it to the map to light up a new brand.

import { useMemo } from "react";

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

/** Collector source → logo file under public/brand-logos. */
const SOURCE_LOGOS: Record<string, string> = {
  zcode: "zcode.svg",
  codex: "codex.svg",
  opencode: "opencode.svg",
  cursor: "cursor.svg",
  "trae-cn": "trae.svg",
  trae: "trae.svg",
  qoder: "qoder.svg",
  "qoder-cn": "qoder-cn.svg",
  reasonix: "reasonix.png",
  antigravity: "antigravity.svg",
  mimo: "mimo.svg",
  kimi: "kimi.svg",
  gemini: "gemini.svg",
  "gemini-cli": "gemini.svg",
  grok: "grok.svg",
  copilot: "copilot.svg",
  cline: "cline.png",
  deepseek: "deepseek.svg",
  pi: "pi.svg",
  "pi-zai-coding-cn": "pi.svg",
  "pi-stepfun": "pi.svg",
  workbuddy: "workbuddy.svg",
  codebuddy: "codebuddy.svg",
  commandcode: "commandcode.svg",
  command_code: "commandcode.svg",
  kiro: "kiro.svg",
  devin: "devin.svg",
  lmstudio: "lmstudio.svg",
  openclaw: "openclaw.svg",
  hermes: "hermes.svg",
  kilo: "kilo.svg",
  acode: "acode.png",
  anythingllm: "anythingllm.svg",
  unsloth: "unsloth.svg",
  dsh: "volcano-ark.svg",
  zai: "zcode.svg",
};

/**
 * Model-name prefixes that carry a recognizable vendor mark. Only unambiguous
 * vendors map; everything else (glm / step / hy / qwen / minimax …) falls
 * back to the tile rather than showing a wrong brand.
 */
const MODEL_PREFIX_LOGOS: Array<[prefix: string, file: string]> = [
  ["deepseek", "deepseek.svg"],
  ["kimi", "kimi.svg"],
  ["gemini", "gemini.svg"],
  ["grok", "grok.svg"],
  ["mimo", "mimo.svg"],
  ["gpt", "codex.svg"],
  ["composer", "cursor.svg"],
  ["claude", "claude-code.svg"],
];

function colorFor(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return TILE_COLORS[hash % TILE_COLORS.length];
}

function logoFor(label: string): string | null {
  const key = label.trim().toLowerCase();

  const source = SOURCE_LOGOS[key];

  if (source) return `/brand-logos/${source}`;
  for (const [prefix, file] of MODEL_PREFIX_LOGOS) {
    if (key.startsWith(prefix)) return `/brand-logos/${file}`;
  }

  return null;
}

export function SourceIcon({
  label,
  size = 16,
}: {
  label: string;
  size?: number;
}) {
  const logo = useMemo(() => logoFor(label), [label]);
  const initial = (label.trim() || "?").charAt(0).toUpperCase();

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        alt=""
        aria-hidden="true"
        className="shrink-0 object-contain select-none"
        height={size}
        src={logo}
        style={{ height: size, width: size }}
        width={size}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] font-semibold text-white select-none"
      style={{
        background: colorFor(label),
        fontSize: Math.round(size * 0.62),
        height: size,
        width: size,
      }}
    >
      {initial}
    </span>
  );
}
