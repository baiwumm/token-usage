"use client";

// Source / model icon: a deterministic colored tile with the label's initial.
// Sources come from collector config (arbitrary strings), so a real logo set
// can't be exhaustive — the tile gives every source a stable, recognizable
// mark (same hash → same color) and upgrades to real logos later if needed.

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
  const initial = (label.trim() || "?").charAt(0).toUpperCase();

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
