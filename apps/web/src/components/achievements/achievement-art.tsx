"use client";

// Fallback badge artwork for one achievement: a metal ring, a glowing face
// tinted per achievement and the catalog glyph in the middle.
//
// This is the parametric SVG badge. Since P4 it is only rendered when the
// bitmap artwork fails to load (see `achievement-medallion.tsx`) — the page
// must never show an empty badge slot. Everything is inline SVG + Tailwind, so
// the fallback costs no request and stays crisp at any density.

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

import { achievementHue, tierMetal } from "./achievement-tiers";

import { type AchievementIcon } from "@/lib/achievements/catalog";

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
  const metal = tierMetal(tier);
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
