"use client";

// Read-only strip shown on every protected page of the demo instance
// (docs/demo-instance-plan.md §5). Renders nothing on normal deployments.

import { Typography } from "@heroui/react";

import { DEMO_COPY } from "@/lib/copy/demo";
import { useLocale } from "@/lib/copy/locale";
import { isDemoUi } from "@/lib/demo";

export function DemoBanner() {
  const [locale] = useLocale();

  if (!isDemoUi()) return null;
  const copy = DEMO_COPY[locale];

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-default/50 bg-surface-secondary px-4 py-2 text-center md:px-8">
      <Typography className="text-accent" type="body-xs" weight="semibold">
        {copy.banner.title}
      </Typography>
      <Typography color="muted" type="body-xs">
        {copy.banner.body}
      </Typography>
    </div>
  );
}
