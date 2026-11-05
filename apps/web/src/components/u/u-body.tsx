"use client";

// Public page body for /u/<token> (docs/badge.md §6). Everything arrives as
// aggregates from the server page; no token, hash or user id reaches this
// tree. The 30-day window is gone: every figure describes the all-time total.
//
// 2026-11-05: heatmap and achievements are always rendered (no switches),
// the heatmap sits above the two breakdown columns, and the repository
// subsection is gone.

import type { PublicPageData } from "@/lib/public-page/types";

import { Description } from "@heroui/react";

import { UAchievements } from "./u-achievements";
import { UBrand } from "./u-brand";
import { UBreakdownSection } from "./u-breakdown-section";
import { UHeatmap } from "./u-heatmap";
import { UHero } from "./u-hero";
import { UMetrics } from "./u-metrics";

import { PUBLIC_PAGE_COPY } from "@/lib/copy/public-page";
import { useLocale } from "@/lib/copy/locale";

const DIVIDER = "border-border mt-16 border-t pt-16";

export function UBody({ data }: { data: PublicPageData }) {
  const [locale] = useLocale();
  const copy = PUBLIC_PAGE_COPY[locale];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col px-6 py-16 md:px-10 md:py-24">
      <UBrand locale={locale} />

      <UHero copy={copy} data={data} locale={locale} />

      <div className="border-border mt-12 border-t pt-10">
        <UMetrics copy={copy} data={data} locale={locale} />
      </div>

      <div className={DIVIDER}>
        <UHeatmap
          copy={copy}
          locale={locale}
          payload={data.heatmap}
          timezone={data.timezone}
        />
      </div>

      <div className={DIVIDER}>
        <UBreakdownSection copy={copy} data={data} />
      </div>

      <div className={DIVIDER}>
        <UAchievements copy={copy} items={data.achievements} locale={locale} />
      </div>

      <footer className="border-border mt-16 flex flex-col gap-2 border-t pt-8">
        <Description className="text-muted text-xs">{copy.footer}</Description>
      </footer>
    </main>
  );
}
