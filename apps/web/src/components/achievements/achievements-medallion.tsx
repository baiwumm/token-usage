"use client";

// Achievement medallion: icon inside a tier-gradient ring with the five-tier
// tick marks. Locked achievements keep the shape but drop the gradient and the
// icon contrast, so the grid still reads as a grid. Colour is never the only
// signal — cards and the dialog print the tier name next to it.

import type { ComponentType, SVGProps } from "react";

import {
  Archive,
  ArrowsRotateRight,
  Calendar,
  Clock,
  Compass,
  Flame,
  Globe,
  Heart,
  Layers,
  Medal,
  Moon,
  Pencil,
  Route,
  Sparkles,
  Star,
  Tachometer,
} from "@gravity-ui/icons";

import {
  TIERS,
  type AchievementIcon,
  type TierKey,
} from "@/lib/achievements/catalog";

const ICONS: Record<AchievementIcon, ComponentType<SVGProps<SVGSVGElement>>> = {
  tokens: Medal,
  feather: Pencil,
  archive: Archive,
  calendar: Calendar,
  sparkle: Star,
  flask: Sparkles,
  timer: Clock,
  layers: Layers,
  flame: Flame,
  route: Route,
  weekend: Calendar,
  moon: Moon,
  globe: Globe,
  tools: Tachometer,
  compass: Compass,
  heart: Heart,
  devices: Star,
  refresh: ArrowsRotateRight,
};

// Metal gradients stay semantic: bronze → silver → gold → diamond, then a
// black-gold/laser king ring. `bg-linear-to-br` carries them on a 2px frame.
const RING: Record<TierKey, string> = {
  bronze: "from-amber-700 via-amber-500 to-amber-300",
  silver: "from-zinc-500 via-zinc-300 to-zinc-400",
  gold: "from-yellow-600 via-amber-400 to-yellow-200",
  diamond: "from-sky-500 via-cyan-300 to-sky-200",
  king: "from-fuchsia-600 via-amber-300 to-violet-600",
};

export function AchievementMedallion({
  icon,
  tier,
  size = "md",
}: {
  icon: AchievementIcon;
  /** 0 = locked, 1–5 = current tier. */
  tier: number;
  size?: "md" | "lg";
}) {
  const Icon = ICONS[icon];
  const tierKey =
    tier >= 1 && tier <= TIERS.length ? TIERS[tier - 1].key : null;
  const frame = size === "lg" ? "size-20" : "size-14";
  const glyph = size === "lg" ? "size-9" : "size-6";

  return (
    <div
      className={`relative grid shrink-0 place-items-center rounded-full p-[2px] ${
        tierKey ? `bg-linear-to-br ${RING[tierKey]}` : "bg-border/70"
      } ${frame}`}
    >
      <div className="grid size-full place-items-center rounded-full bg-surface">
        <Icon
          aria-hidden="true"
          className={`${glyph} ${
            tierKey ? "text-foreground" : "text-muted/70"
          }`}
        />
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-x-0 -bottom-1 flex justify-center gap-1"
      >
        {TIERS.map((entry) => (
          <span
            key={entry.key}
            className={`size-1.5 rounded-full ${
              entry.tier <= tier ? "bg-foreground/70" : "bg-border"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
