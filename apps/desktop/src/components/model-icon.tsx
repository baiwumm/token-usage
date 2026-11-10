import { useMemo } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { modelLogoFile, tileColorFor } from "@/lib/source-logos";

/**
 * Vendor mark for a raw model id (web dashboard's Top models parity). Model
 * names without a registered prefix fall back to the same deterministic
 * letter tile the source rows use, so a row never renders a blank slot.
 */
export function ModelIcon({
  model,
  size = 16,
}: {
  model: string;
  size?: number;
}) {
  const logo = useMemo(() => modelLogoFile(model), [model]);

  if (logo) return <BrandLogo file={logo} size={size} />;

  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-[4px] font-semibold text-white select-none"
      style={{
        background: tileColorFor(model),
        fontSize: Math.round(size * 0.62),
        height: size,
        width: size,
      }}
    >
      {(model.trim() || "?").charAt(0).toUpperCase()}
    </span>
  );
}
