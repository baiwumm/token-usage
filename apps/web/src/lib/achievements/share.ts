// Projection from an unlocked achievement to the share card (docs/ui-spec.md
// 分享卡片). Kept pure and client-safe: the canvas engine draws only from this
// shape, and the unit tests check it without a DOM. Privacy: aggregated
// achievement data only — no row-level usage.

import type { AchievementProgress } from "./types";
import type { Locale } from "@/lib/copy/locale-config";

import { achievementById, TIERS, type AchievementUnit } from "./catalog";

import { achievementCopy } from "@/lib/copy/achievements";
import { SHARE_CARD_COPY } from "@/lib/copy/share-card";

export type AchievementShareData = {
  id: string;
  name: string;
  description: string;
  /** 1 bronze … 5 king (the card is only offered for unlocked tiers). */
  tier: number;
  tierKey: (typeof TIERS)[number]["key"];
  tierName: string;
  /** Pre-formatted current value (tokens / days / ratio per the preference). */
  valueLabel: string;
  /** Local day the current tier landed, when known. */
  achievedDay: string | null;
  /** Bitmap artwork path (`/achievements/<id>.png`). */
  art: string;
  /** Display name on the card; falls back to the copy module's default. */
  handle: string;
  locale: Locale;
};

/**
 * Null when the progress row cannot be shared: still locked (tier 0) or not
 * in the catalog.
 */
export function buildAchievementShareData(
  progress: AchievementProgress,
  {
    locale,
    handle,
    formatValue,
  }: {
    locale: Locale;
    handle: string;
    formatValue: (unit: AchievementUnit, value: number) => string;
  },
): AchievementShareData | null {
  const tier = TIERS.find((entry) => entry.tier === progress.tier);
  const entry = achievementById(progress.id);

  if (!tier || !entry) return null;

  return {
    id: progress.id,
    name: achievementCopy(locale, entry.copyKey),
    description: achievementCopy(locale, entry.descriptionKey),
    tier: progress.tier,
    tierKey: tier.key,
    tierName: achievementCopy(locale, tier.copyKey),
    valueLabel: formatValue(progress.unit, progress.value),
    achievedDay: progress.achieved_at[tier.key] ?? null,
    art: entry.art,
    handle: handle.trim() || SHARE_CARD_COPY[locale].achievement.handleFallback,
    locale,
  };
}

export function achievementShareFilename(
  id: string,
  tierKey: AchievementShareData["tierKey"],
): string {
  return `token-usage-${id}-${tierKey}.png`;
}
