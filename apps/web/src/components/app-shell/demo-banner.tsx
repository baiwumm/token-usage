"use client";

// Read-only strip shown on every protected page of the demo instance
// (docs/demo-instance-plan.md §5). Renders nothing on normal deployments.
//
// Transparent by design and rendered inside the sticky header stack of
// `app-shell/index.tsx`, so it scrolls with the top bar instead of clipping a
// band of colour over the blurred header. The sticky container supplies the
// background/blur.

import { Typography } from "@heroui/react";

import { DEMO_COPY } from "@/lib/copy/demo";
import { useLocale } from "@/lib/copy/locale";
import { isDemoUi } from "@/lib/demo";

export function DemoBanner() {
  const [locale] = useLocale();

  if (!isDemoUi()) return null;
  const copy = DEMO_COPY[locale];

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 pt-2 pb-0.5 text-center md:px-8">
      <Typography className="text-accent" type="body-xs" weight="semibold">
        {copy.banner.title}
      </Typography>
      <Typography color="muted" type="body-xs">
        {copy.banner.body}
      </Typography>
    </div>
  );
}
