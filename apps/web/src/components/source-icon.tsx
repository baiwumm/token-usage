"use client";

// Source / model icon: brand logo first (public/brand-logos, MIT assets from
// TokenTracker + juejin-usage), deterministic colored tile as the fallback
// for anything without a shipped logo. Identity resolution (aliases, display
// labels, white-logo backdrops) lives in @/lib/sources.

import { useMemo } from "react";

import {
  darkLogoFile,
  logoNeedsBackdrop,
  modelLogoFile,
  sourceLogoFile,
} from "@/lib/sources";

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
  source,
}: {
  label: string;
  size?: number;
  /** Owning source id — used when the label is a model with no vendor mark
   *  ("auto", "lite", "custom_model"), so the row falls back to the source
   *  logo instead of the letter tile. */
  source?: string;
}) {
  // Models try vendor prefixes first (deepseek-v4-flash → DeepSeek), sources
  // resolve through the canonical map; both fall back to the tile. A
  // registered dark twin swaps in via .dark stacking both images.
  const logo = useMemo(
    () => modelLogoFile(label) ?? sourceLogoFile(source ?? label),
    [label, source],
  );
  const darkLogo = useMemo(() => (logo ? darkLogoFile(logo) : null), [logo]);
  const initial = (label.trim() || "?").charAt(0).toUpperCase();

  if (logo) {
    const img = darkLogo ? (
      <span
        aria-hidden="true"
        className="grid shrink-0 select-none"
        style={{ height: size, width: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="col-start-1 row-start-1 object-contain dark:hidden"
          height={size}
          src={logo}
          style={{ height: size, width: size }}
          width={size}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          alt=""
          className="col-start-1 row-start-1 hidden object-contain dark:block"
          height={size}
          src={darkLogo}
          style={{ height: size, width: size }}
          width={size}
        />
      </span>
    ) : (
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
