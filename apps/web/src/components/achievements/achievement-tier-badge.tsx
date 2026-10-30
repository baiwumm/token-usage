"use client";

// Tier label: a metallic gradient pill that names the tier (青铜 / 白银 /
// 黄金 / 钻石 / 王者). The ramp is the same one that paints the badge ring,
// the tier track and the progress bar, so a tier reads the same everywhere.
//
// The label is decorative chrome: the tier is also carried by text, so colour
// is never the only channel.

import { tierGradient, tierRamp } from "./achievement-tiers";

export function TierBadge({
  tier,
  label,
  size = "sm",
  className,
}: {
  /** 0 = locked (neutral ramp). */
  tier: number;
  label: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const ramp = tierRamp(tier);

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold whitespace-nowrap ${
        size === "md" ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[11px]"
      } ${className ?? ""}`}
      style={{
        background: tierGradient(tier),
        color: ramp.ink,
        textShadow: "0 1px 0 rgba(255, 255, 255, 0.35)",
        boxShadow:
          "inset 0 1px 1px rgba(255, 255, 255, 0.4), 0 0 0 1px rgba(10, 15, 12, 0.06)",
      }}
    >
      {label}
    </span>
  );
}
