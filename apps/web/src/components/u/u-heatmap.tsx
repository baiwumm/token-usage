"use client";

// 2026-11-05: the public page shows exactly the dashboard's heatmap —
// last 52 weeks, month/weekday rulers, the shared portal tooltip with source
// breakdown, timezone footnote and legend. Differences: no platform filter,
// no day-click drill-down, no card chrome / background, and the numbers use
// the viewer's format preferences (HeatmapCard's default useFormat).

import type { Locale } from "@/lib/copy/locale-config";
import type { PublicPageCopy } from "@/lib/copy/public-page";
import type { HeatmapPayload } from "@/lib/dashboard/api";

import { HeatmapCard } from "@/components/heatmap-card";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";

export function UHeatmap({
  payload,
  copy,
  locale,
  timezone,
}: {
  payload: HeatmapPayload;
  copy: PublicPageCopy;
  locale: Locale;
  timezone: string;
}) {
  return (
    <section className="u-reveal" style={{ animationDelay: "200ms" }}>
      <HeatmapCard
        bare
        hideFilter
        copy={DASHBOARD_COPY[locale]}
        emptyLabel={copy.empty}
        locale={locale}
        payload={payload}
        timezone={timezone}
      />
    </section>
  );
}
