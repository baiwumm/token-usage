import { useMemo } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { sourceLogoFile, tileColorFor } from "@/lib/source-logos";

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

  if (logo) return <BrandLogo file={logo} size={size} />;

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
      {(source.trim() || "?").charAt(0).toUpperCase()}
    </span>
  );
}
