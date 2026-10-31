"use client";

// Dashboard achievements strip (docs/achievements-plan.md §3.5): the latest
// unlocks and the tiers closest to landing, at most five of each, stacked
// top-to-bottom. Tiles mirror the /achievements wall (centred medallion, name,
// tier pill) and open the same detail dialog on click — the wall's progress
// bars moved into the dialog (2026-10-31 operator call).

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Typography } from "@heroui/react";

import { AchievementMedallion } from "@/components/achievements/achievement-medallion";
import { TierBadge } from "@/components/achievements/achievement-tier-badge";
import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";

function AchievementTile({
  locale,
  progress,
  onOpen,
}: {
  locale: Locale;
  progress: AchievementProgress;
  onOpen: (id: string) => void;
}) {
  const catalogEntry = achievementById(progress.id);
  const currentTier =
    TIERS.find((entry) => entry.tier === progress.tier) ?? null;
  const name = achievementCopy(
    locale,
    catalogEntry?.copyKey ?? `achievements.${progress.id}.name`,
  );

  return (
    <button
      aria-label={name}
      className="flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl p-1 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2"
      type="button"
      onClick={() => onOpen(progress.id)}
    >
      <AchievementMedallion
        art={catalogEntry?.art}
        className="w-20 md:w-24"
        icon={catalogEntry?.icon ?? "tokens"}
        id={progress.id}
        tier={progress.tier}
      />
      <span className="w-full truncate text-sm font-medium">{name}</span>
      {currentTier ? (
        <TierBadge
          label={achievementCopy(locale, currentTier.copyKey)}
          tier={progress.tier}
        />
      ) : null}
    </button>
  );
}

function AchievementGroup({
  locale,
  title,
  rows,
  onOpen,
}: {
  locale: Locale;
  title: string;
  rows: readonly AchievementProgress[];
  onOpen: (id: string) => void;
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
            onOpen={onOpen}
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
  onOpen,
}: {
  locale: Locale;
  recent: readonly AchievementProgress[];
  nearest: readonly AchievementProgress[];
  recentTitle: string;
  nearestTitle: string;
  onOpen: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <AchievementGroup
        locale={locale}
        rows={recent}
        title={recentTitle}
        onOpen={onOpen}
      />
      <AchievementGroup
        locale={locale}
        rows={nearest}
        title={nearestTitle}
        onOpen={onOpen}
      />
    </div>
  );
}
