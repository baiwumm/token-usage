"use client";

// Dashboard achievements strip (docs/achievements-plan.md §3.5): the latest
// unlocks and the tiers closest to landing, at most five of each, stacked
// top-to-bottom. Tiles mirror the /achievements wall (centred medallion, name,
// tier pill or thin progress bar) but are display-only — the section header's
// "view all" is the single way into /achievements, where the value, the gap
// and the day live.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Typography } from "@heroui/react";

import { AchievementMedallion } from "@/components/achievements/achievement-medallion";
import { TierBadge } from "@/components/achievements/achievement-tier-badge";
import {
  achievementById,
  progressRatioForNext,
  TIERS,
} from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

function AchievementTile({
  locale,
  progress,
}: {
  locale: Locale;
  progress: AchievementProgress;
}) {
  const catalogEntry = achievementById(progress.id);
  const currentTier =
    TIERS.find((entry) => entry.tier === progress.tier) ?? null;
  const name = achievementCopy(
    locale,
    catalogEntry?.copyKey ?? `achievements.${progress.id}.name`,
  );
  const ratio = progressRatioForNext(progress.value, progress.next_threshold);
  const percent = Math.round(ratio * 100);

  return (
    <div className="flex flex-col items-center gap-1.5 rounded-2xl p-1 text-center">
      <AchievementMedallion
        art={catalogEntry?.art}
        className="w-20 md:w-24"
        icon={catalogEntry?.icon ?? "tokens"}
        id={progress.id}
        tier={progress.tier}
      />
      <span className="w-full truncate text-sm font-medium">{name}</span>
      {currentTier ? (
        <>
          <TierBadge
            label={achievementCopy(locale, currentTier.copyKey)}
            tier={progress.tier}
          />
          {progress.next_threshold != null ? (
            <span
              aria-label={formatMessage(
                achievementCopy(locale, "achievements.ui.cardProgress"),
                locale,
                { name, percent },
              )}
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={percent}
              className="bg-default h-1 w-16 overflow-hidden rounded-full"
              role="progressbar"
            >
              <span
                className="bg-accent block h-full rounded-full"
                style={{ width: `${percent}%` }}
              />
            </span>
          ) : null}
        </>
      ) : (
        <span
          aria-label={formatMessage(
            achievementCopy(locale, "achievements.ui.cardProgress"),
            locale,
            { name, percent },
          )}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={percent}
          className="bg-default h-1 w-16 overflow-hidden rounded-full"
          role="progressbar"
        >
          <span
            className="bg-accent block h-full rounded-full"
            style={{ width: `${percent}%` }}
          />
        </span>
      )}
    </div>
  );
}

function AchievementGroup({
  locale,
  title,
  rows,
}: {
  locale: Locale;
  title: string;
  rows: readonly AchievementProgress[];
}) {
  if (rows.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      <Typography color="muted" type="body-xs">
        {title}
      </Typography>
      <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
        {rows.map((progress) => (
          <AchievementTile
            key={progress.id}
            locale={locale}
            progress={progress}
          />
        ))}
      </div>
    </div>
  );
}

export function AchievementStrip({
  locale,
  recent,
  nearest,
  recentTitle,
  nearestTitle,
}: {
  locale: Locale;
  recent: readonly AchievementProgress[];
  nearest: readonly AchievementProgress[];
  recentTitle: string;
  nearestTitle: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AchievementGroup locale={locale} rows={recent} title={recentTitle} />
      <AchievementGroup locale={locale} rows={nearest} title={nearestTitle} />
    </div>
  );
}
