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
// The artwork is a full-bleed coin disc with its own minted rim, so it is
// cropped by ARTWORK_CROP before it is framed: without the crop the coin's own
// rim reads as a second ring right next to the tier ring.

import { Lock } from "@gravity-ui/icons";
import { useEffect, useId, useRef, useState } from "react";

import { AchievementArt } from "./achievement-art";
import { achievementHue, tierMetal } from "./achievement-tiers";

import { type AchievementIcon } from "@/lib/achievements/catalog";

/**
 * Scale applied to the artwork inside its circular frame. 1 / 0.95 ≈ 1.0526
 * crops 5 % of the artwork diameter, which removes the coin's outermost beaded
 * rim so the tier ring is the only metal circle the eye lands on.
 */
const ARTWORK_CROP = 1.0526;

/** Ring band width as a share of the badge diameter (6 % = 3 % per side). */
const RING_WIDTH = 0.06;

export function AchievementMedallion({
  id,
  icon,
  tier,
  size = 96,
  art,
}: {
  id: string;
  /** Catalog glyph, used by the SVG fallback only. */
  icon: AchievementIcon;
  /** 0 = locked, 1–5 = current tier. */
  tier: number;
  size?: number;
  /** Bitmap path from the catalog (`art` field). */
  art?: string;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [failed, setFailed] = useState(false);
  const imageRef = useRef<HTMLImageElement>(null);
  const unlocked = tier >= 1;
  const metal = tierMetal(tier);
  const { hue, accent } = achievementHue(id);
  const frameInset = size * RING_WIDTH;

  // The <img> is server-rendered, so a missing file can fail before React
  // hydrates and the error event is already gone by the time onError could
  // listen for it. Check the element itself so the fallback still happens.
  useEffect(() => {
    const image = imageRef.current;

    if (image && image.complete && image.naturalWidth === 0) setFailed(true);
  }, [art]);

  if (failed || !art) {
    return <AchievementArt icon={icon} id={id} size={size} tier={tier} />;
  }

  return (
    <div
      className="relative shrink-0 transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none"
      style={{ width: size, height: size }}
    >
      {/* Unlocked badges keep a faint hue aura behind the metal ring. */}
      {unlocked ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute -inset-1 rounded-full opacity-70 transition-opacity duration-200 group-hover:opacity-100 motion-reduce:transition-none"
          style={{
            background: `radial-gradient(closest-side, hsl(${accent} 90% 60% / 0.22), transparent 78%)`,
          }}
        />
      ) : null}

      {/* Artwork disc, cropped so the coin rim does not double the ring. */}
      <div
        className="absolute overflow-hidden rounded-full"
        style={{
          inset: frameInset,
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
          style={{ transform: `scale(${ARTWORK_CROP})` }}
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
            <stop offset="0%" stopColor={metal.light} />
            <stop offset="45%" stopColor={metal.mid} />
            <stop offset="100%" stopColor={metal.deep} />
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
        <span className="bg-surface absolute right-0 bottom-0 grid size-5 place-items-center rounded-full ring-2 ring-surface">
          <Lock aria-hidden="true" className="text-muted size-3" />
        </span>
      )}
    </div>
  );
}
