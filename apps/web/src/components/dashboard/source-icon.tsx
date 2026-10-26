"use client";

// Source / model icon: brand logo first (public/brand-logos, MIT assets from
// TokenTracker + juejin-usage), deterministic colored tile as the fallback
// for anything without a shipped logo. Identity resolution (aliases, display
// labels, white-logo backdrops) lives in ./sources.

import { useMemo } from "react";

import { logoNeedsBackdrop, modelLogoFile, sourceLogoFile } from "./sources";

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

function colorFor(label: string): string {
  let hash = 0;

  for (let index = 0; index < label.length; index += 1) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }

  return TILE_COLORS[hash % TILE_COLORS.length];
}

export function SourceIcon({
  label,
  size = 16,
}: {
  label: string;
  size?: number;
}) {
  // Models try vendor prefixes first (deepseek-v4-flash → DeepSeek), sources
  // resolve through the canonical map; both fall back to the tile.
  const logo = useMemo(
    () => modelLogoFile(label) ?? sourceLogoFile(label),
    [label],
  );
  const initial = (label.trim() || "?").charAt(0).toUpperCase();

  if (logo) {
    const img = (
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

    // White marks (Pi) vanish on light cards — give them a quiet backdrop.
    if (logoNeedsBackdrop(logo)) {
      return (
        <span
          aria-hidden="true"
          className="bg-default ring-border/60 inline-flex shrink-0 items-center justify-center rounded-[4px] ring-1 select-none"
          style={{ height: size, width: size }}
        >
          {img}
        </span>
      );
    }

    return img;
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
