// Builds the quotable hook line for share cards from aggregates — priority:
// model loyalty → active days → leading model → multi-model → year fallback
// (structure follows the upstream reference, copy is our own).

import { fillTemplate } from "./helpers";

import { SHARE_CARD_COPY } from "@/lib/copy/share-card";

export function buildShareHook({
  activeDays,
  locale,
  modelCount,
  topModelName,
  topModelPercent,
  year,
}: {
  activeDays: number;
  locale: "zh" | "en";
  modelCount: number;
  topModelName: string | null;
  topModelPercent: number;
  year: number | null;
}): string {
  const copy = SHARE_CARD_COPY[locale].hook;

  if (topModelName && topModelPercent >= 60) {
    return fillTemplate(copy.loyal, {
      name: topModelName,
      percent: Math.round(topModelPercent),
    });
  }
  if (activeDays >= 60) {
    return fillTemplate(copy.days, { days: activeDays });
  }
  if (topModelName && topModelPercent >= 30) {
    return fillTemplate(copy.led, {
      name: topModelName,
      percent: Math.round(topModelPercent),
    });
  }
  if (modelCount > 1) {
    return fillTemplate(copy.multi, { count: modelCount });
  }

  return fillTemplate(copy.year, { year: year ?? "" });
}
