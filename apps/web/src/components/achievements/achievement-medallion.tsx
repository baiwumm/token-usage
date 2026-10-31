"use client";

// The achievement badge: the generated coin artwork in `public/achievements/`
// framed by a metal ring that carries the tier (bronze → silver → gold →
// diamond → king). The artwork itself is tier-agnostic — one image per
// achievement, reused across the five tiers — so the ring is the only tier
// signal on the badge.
//
// Locked badges drop their colour, dim and carry a lock badge. If the bitmap
// fails to load the badge falls back to the parametric SVG badge
// (`achievement-art.tsx`); the page never shows an empty badge slot.
//
// Everything inside the badge is proportional to the box, so the badge can be
// sized by CSS: the tier ring is 6 % of the diameter and the artwork fills
// the rest. The artwork is a full-bleed coin disc with its own minted rim, so
// it is scaled to cover the frame plus a 5 % crop (see `lib/achievements/
// art-fit.ts` — the shipped coins fill 70–85 % of their canvas and are
// normalised to the same on-screen size).

import { Lock } from "@gravity-ui/icons";
import { useEffect, useId, useRef, useState } from "react";

import { AchievementArt } from "./achievement-art";
import { achievementHue, tierRingStops } from "./achievement-tiers";

import { type AchievementIcon } from "@/lib/achievements/catalog";
import { artworkScale } from "@/lib/achievements/art-fit";

/** Ring band width as a share of the badge diameter (6 % = 3 % per side). */
const RING_WIDTH = 0.06;

export function AchievementMedallion({
  id,
  icon,
  tier,
  art,
  className,
}: {
  id: string;
  /** Catalog glyph, used by the SVG fallback only. */
  icon: AchievementIcon;
  /** 0 = locked, 1–5 = current tier. */
  tier: number;
  /** Bitmap path from the catalog (`art` field). */
  art?: string;
  /** Box size; the ring, the crop and the lock badge scale with it. */
  className?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const unlocked = tier >= 1;
  const [ringMid, ringLight, ringDeep] = tierRingStops(tier);
  const { hue, accent } = achievementHue(id);

  // The <img> is server-rendered, so a missing file can fail before React
  // hydrates and the error event is already gone by the time onError could
  // listen for it. Check the element itself so the fallback still happens.
  useEffect(() => {
    const image = imageRef.current;

    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, [art]);

  if (failed || !art) {
    return (
      <AchievementArt className={className} icon={icon} id={id} tier={tier} />
    );
  }

  return (
    <div
      className={`relative aspect-square shrink-0 ${className ?? "size-24"}`}
    >
      {/* Unlocked badges keep a faint hue aura behind the metal ring. */}
      {unlocked ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full opacity-70"
          style={{
            background: `radial-gradient(closest-side, hsl(${accent} 90% 60% / 0.22), transparent 78%)`,
          }}
        />
      ) : null}

      {/* Artwork disc, cropped so the coin rim does not double the ring. */}
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          inset: `${RING_WIDTH * 100}%`,
          filter: unlocked
            ? `drop-shadow(0 4px 12px hsl(${hue} 88% 46% / 0.45))`
            : "grayscale(1) brightness(0.85) opacity(0.55)",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          ref={imageRef}
          alt=""
          aria-hidden="true"
          className="size-full object-cover"
          decoding="async"
          height={256}
          loading="lazy"
          src={art}
          style={{ transform: `scale(${artworkScale(id)})` }}
          width={256}
          onError={() => setFailed(true)}
        />
      </div>

      {/* Tier ring: metal band plus a dark hairline that seats the coin. */}
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 size-full"
        viewBox="0 0 100 100"
      >
        <defs>
          <linearGradient
            id={`ring-${uid}`}
            x1="0%"
            x2="100%"
            y1="0%"
            y2="100%"
          >
            <stop offset="0%" stopColor={ringMid} />
            <stop offset="42%" stopColor={ringLight} />
            <stop offset="100%" stopColor={ringDeep} />
          </linearGradient>
        </defs>
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={50 - RING_WIDTH * 50}
          stroke={`url(#ring-${uid})`}
          strokeWidth={RING_WIDTH * 100}
        />
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={50 - RING_WIDTH * 100}
          stroke="#000000"
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        <circle
          cx="50"
          cy="50"
          fill="none"
          r={50 - RING_WIDTH * 50}
          stroke="#ffffff"
          strokeOpacity={unlocked ? 0.28 : 0.12}
          strokeWidth="0.8"
        />
      </svg>

      {unlocked ? null : (
        <span className="bg-surface absolute right-0 bottom-0 grid h-[21%] w-[21%] place-items-center rounded-full ring-2 ring-surface">
          <Lock aria-hidden="true" className="text-muted h-1/2 w-1/2" />
        </span>
      )}
    </div>
  );
}
