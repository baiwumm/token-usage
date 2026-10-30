"use client";

// Generated badge artwork for one achievement: a metal ring, a glowing face
// tinted per achievement and the catalog glyph in the middle. Each achievement
// gets its own hue so a grid of badges reads as a collection, and the tier
// decides the metal (bronze → silver → gold → diamond → king); locked badges
// lose the glow and turn grey with a small lock.
//
// Everything is inline SVG + Tailwind — no bitmap assets, no runtime images,
// so the art stays crisp at any density and costs one request less.

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
  Lock,
  Medal,
  Moon,
  Pencil,
  Route,
  Sparkles,
  Star,
  Tachometer,
} from "@gravity-ui/icons";
import { useId, type ComponentType, type SVGProps } from "react";

import {
  TIERS,
  type AchievementIcon,
  type TierKey,
} from "@/lib/achievements/catalog";

const GLYPHS: Record<
  AchievementIcon,
  ComponentType<SVGProps<SVGSVGElement>>
> = {
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

/** Per-achievement hue pair: the face glow and a complementary accent. */
const HUES: Record<string, { hue: number; accent: number }> = {
  token_titan: { hue: 42, accent: 18 },
  wordsmith: { hue: 330, accent: 285 },
  cachekeeper: { hue: 168, accent: 200 },
  veteran: { hue: 24, accent: 0 },
  big_day: { hue: 46, accent: 8 },
  cache_alchemy: { hue: 275, accent: 315 },
  marathon_session: { hue: 205, accent: 245 },
  model_symphony: { hue: 292, accent: 330 },
  streak: { hue: 14, accent: 38 },
  marathoner: { hue: 120, accent: 172 },
  weekend_warrior: { hue: 348, accent: 20 },
  night_owl: { hue: 248, accent: 210 },
  polyglot: { hue: 190, accent: 225 },
  multitool: { hue: 88, accent: 142 },
  project_hopper: { hue: 310, accent: 258 },
  project_devotion: { hue: 356, accent: 320 },
  fleet: { hue: 216, accent: 186 },
  sync_diligence: { hue: 142, accent: 96 },
};

const FALLBACK_HUE = { hue: 220, accent: 260 };

const METALS: Record<TierKey, { light: string; mid: string; deep: string }> = {
  bronze: { light: "#ffd9a8", mid: "#c4762f", deep: "#6d3a12" },
  silver: { light: "#ffffff", mid: "#b8c1cd", deep: "#646d7b" },
  gold: { light: "#fff3bd", mid: "#e5ad38", deep: "#8a5a10" },
  diamond: { light: "#e9fbff", mid: "#63c6ea", deep: "#25698d" },
  king: { light: "#ffe7a6", mid: "#df67c6", deep: "#5731c4" },
};

const LOCKED_METAL = { light: "#dfe3ea", mid: "#a7aeb9", deep: "#6e7480" };

export function achievementHue(id: string): { hue: number; accent: number } {
  return HUES[id] ?? FALLBACK_HUE;
}

/** Metal chip classes for the tier label on cards and in the dialog. */
export function tierChipClass(tier: number): string {
  const base =
    "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium";

  if (tier < 1) return `${base} border-border bg-default/50 text-muted`;

  const key = TIERS[tier - 1].key;

  switch (key) {
    case "bronze":
      return `${base} border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-300`;
    case "silver":
      return `${base} border-slate-400/35 bg-slate-400/10 text-slate-600 dark:text-slate-300`;
    case "gold":
      return `${base} border-yellow-500/35 bg-yellow-400/10 text-yellow-700 dark:text-yellow-300`;
    case "diamond":
      return `${base} border-sky-400/35 bg-sky-400/10 text-sky-700 dark:text-sky-300`;
    case "king":
      return `${base} border-fuchsia-400/40 bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300`;
  }
}

/** Track segment classes, one per tier (the king segment is iridescent). */
export function tierBarClass(tier: TierKey): string {
  switch (tier) {
    case "bronze":
      return "bg-linear-to-r from-amber-600 to-orange-300";
    case "silver":
      return "bg-linear-to-r from-slate-500 to-slate-200";
    case "gold":
      return "bg-linear-to-r from-amber-500 to-yellow-200";
    case "diamond":
      return "bg-linear-to-r from-sky-500 to-cyan-200";
    case "king":
      return "bg-linear-to-r from-fuchsia-500 via-amber-300 to-violet-500";
  }
}

/** Four-point sparkle, drawn at the origin; positioned with a transform. */
const SPARKLE = "M0-7 1.8-1.8 7 0 1.8 1.8 0 7-1.8 1.8-7 0-1.8-1.8Z";

export function AchievementArt({
  id,
  icon,
  tier,
  size = 96,
}: {
  id: string;
  icon: AchievementIcon;
  /** 0 = locked, 1–5 = current tier. */
  tier: number;
  size?: number;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const { hue, accent } = achievementHue(id);
  const unlocked = tier >= 1;
  const metal = unlocked ? METALS[TIERS[tier - 1].key] : LOCKED_METAL;
  const Glyph = GLYPHS[icon];
  const face = unlocked
    ? {
        inner: `hsl(${hue} 88% 66%)`,
        mid: `hsl(${hue} 55% 24%)`,
        outer: `hsl(${accent} 52% 9%)`,
      }
    : { inner: "#5b626e", mid: "#262a31", outer: "#131519" };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg aria-hidden="true" className="size-full" viewBox="0 0 120 120">
        <defs>
          <linearGradient
            id={`metal-${uid}`}
            x1="0%"
            x2="100%"
            y1="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={metal.light} />
            <stop offset="45%" stopColor={metal.mid} />
            <stop offset="100%" stopColor={metal.deep} />
          </linearGradient>
          <radialGradient cx="50%" cy="32%" id={`face-${uid}`} r="74%">
            <stop offset="0%" stopColor={face.inner} />
            <stop offset="58%" stopColor={face.mid} />
            <stop offset="100%" stopColor={face.outer} />
          </radialGradient>
          <radialGradient cx="50%" cy="50%" id={`glow-${uid}`} r="50%">
            <stop
              offset="0%"
              stopColor={`hsl(${hue} 92% 62%)`}
              stopOpacity={unlocked ? 0.45 : 0}
            />
            <stop
              offset="68%"
              stopColor={`hsl(${accent} 90% 60%)`}
              stopOpacity={unlocked ? 0.16 : 0}
            />
            <stop
              offset="100%"
              stopColor={`hsl(${accent} 90% 60%)`}
              stopOpacity="0"
            />
          </radialGradient>
        </defs>

        <circle cx="60" cy="60" fill={`url(#glow-${uid})`} r="60" />

        {/* Twelve rays behind the ring: the "minted" edge. */}
        {unlocked
          ? Array.from({ length: 12 }, (_, index) => {
              const angle = (index * Math.PI) / 6;

              return (
                <line
                  key={index}
                  stroke={metal.light}
                  strokeLinecap="round"
                  strokeOpacity={0.4}
                  strokeWidth={1.6}
                  x1={60 + Math.cos(angle) * 53.5}
                  x2={60 + Math.cos(angle) * 57.5}
                  y1={60 + Math.sin(angle) * 53.5}
                  y2={60 + Math.sin(angle) * 57.5}
                />
              );
            })
          : null}

        <circle
          cx="60"
          cy="60"
          fill="none"
          r="47"
          stroke={`url(#metal-${uid})`}
          strokeWidth="8"
        />
        <circle
          cx="60"
          cy="60"
          fill="none"
          r="47"
          stroke="#ffffff"
          strokeOpacity="0.28"
          strokeWidth="1.2"
        />
        <circle
          cx="60"
          cy="60"
          fill="none"
          r="51"
          stroke={metal.light}
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />
        <circle cx="60" cy="60" fill={`url(#face-${uid})`} r="43" />
        <circle
          cx="60"
          cy="60"
          fill="none"
          r="43"
          stroke="#000000"
          strokeOpacity="0.25"
          strokeWidth="1.4"
        />
        <circle
          cx="60"
          cy="60"
          fill="none"
          r="37.5"
          stroke={`url(#metal-${uid})`}
          strokeOpacity="0.45"
          strokeWidth="0.8"
        />

        {/* High tiers earn sparkles — the only difference the art carries by
            tier besides the metal, so the medal still reads as one family. */}
        {unlocked && tier >= 4 ? (
          <>
            <path
              d={SPARKLE}
              fill={metal.light}
              transform="translate(33 30) scale(0.9)"
            />
            <path
              d={SPARKLE}
              fill={metal.light}
              transform="translate(88 76) scale(0.66)"
            />
          </>
        ) : null}
        {unlocked && tier >= 5 ? (
          <path
            d={SPARKLE}
            fill={metal.light}
            transform="translate(86 34) scale(0.5)"
          />
        ) : null}
      </svg>

      <span className="absolute inset-0 grid place-items-center">
        <Glyph
          aria-hidden="true"
          className={unlocked ? "text-white/95" : "text-white/45"}
          style={{
            width: size * 0.38,
            height: size * 0.38,
            filter: unlocked
              ? `drop-shadow(0 2px 6px hsl(${accent} 90% 45% / 0.55))`
              : "none",
          }}
        />
      </span>

      {unlocked ? null : (
        <span className="absolute right-0 bottom-0 grid size-6 place-items-center rounded-full bg-default ring-2 ring-surface">
          <Lock aria-hidden="true" className="size-3 text-muted" />
        </span>
      )}
    </div>
  );
}
