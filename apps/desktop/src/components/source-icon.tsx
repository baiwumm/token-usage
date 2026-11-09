import { useMemo } from "react";

import {
  darkLogoFile,
  logoNeedsBackdrop,
  sourceLogoFile,
  tileColorFor,
} from "@/lib/source-logos";

/**
 * Source brand icon: shipped logo first (public/brand-logos, MIT assets
 * shared with apps/web), deterministic colored letter tile as the fallback.
 * A registered dark twin swaps in via .dark stacking both images.
 */
export function SourceIcon({
  source,
  size = 16,
}: {
  source: string;
  size?: number;
}) {
  const logo = useMemo(() => sourceLogoFile(source), [source]);
  const darkLogo = useMemo(() => (logo ? darkLogoFile(logo) : null), [logo]);
  const initial = (source.trim() || "?").charAt(0).toUpperCase();

  if (logo) {
    const img = darkLogo ? (
      <span
        aria-hidden="true"
        className="grid shrink-0 select-none"
        style={{ height: size, width: size }}
      >
        <img
          alt=""
          className="col-start-1 row-start-1 object-contain dark:hidden"
          height={size}
          src={logo}
          width={size}
        />
        <img
          alt=""
          className="col-start-1 row-start-1 hidden object-contain dark:block"
          height={size}
          src={darkLogo}
          width={size}
        />
      </span>
    ) : (
      <img
        alt=""
        aria-hidden="true"
        className="shrink-0 object-contain select-none"
        height={size}
        src={logo}
        width={size}
      />
    );

    // White marks vanish on light cards — give them a quiet backdrop.
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
        background: tileColorFor(source),
        fontSize: Math.round(size * 0.62),
        height: size,
        width: size,
      }}
    >
      {initial}
    </span>
  );
}
