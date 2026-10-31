"use client";

// One cell of the badge wall: the coin artwork in its tier ring, the name and
// either the tier label (unlocked) or a thin progress bar (locked).
//
// The wall carries no numbers — the value, the gap to the next tier and the
// day it landed live in the detail dialog. The whole cell is one button, so
// the grid has a single tab stop per achievement and no nested interactive
// elements (docs/ui-spec.md 成就 → 墙格).

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { AchievementMedallion } from "./achievement-medallion";
import { TierBadge } from "./achievement-tier-badge";

import {
  achievementById,
  progressRatioForNext,
  TIERS,
} from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementCard({
  progress,
  locale,
  isNew,
  onOpen,
}: {
  progress: AchievementProgress;
  locale: Locale;
  isNew: boolean;
  onOpen: () => void;
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
  const tierLabel = currentTier
    ? achievementCopy(locale, currentTier.copyKey)
    : achievementCopy(locale, "achievements.ui.cardLocked");
  // The wall cell is the only stop for a badge, so its label carries the tier
  // and — while locked — how far the next tier is.
  const ariaLabel = currentTier
    ? `${name} · ${tierLabel}`
    : `${name} · ${tierLabel} · ${percent}%`;

  return (
    <div className="group relative flex flex-col items-center">
      <button
        aria-label={ariaLabel}
        className="focus-visible:outline-accent flex w-full flex-col items-center gap-2 rounded-2xl p-1 text-center transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 motion-reduce:transition-none"
        type="button"
        onClick={onOpen}
      >
        <span className="relative inline-flex">
          <AchievementMedallion
            art={catalogEntry?.art}
            className="w-24 md:w-28"
            icon={catalogEntry?.icon ?? "tokens"}
            id={progress.id}
            tier={progress.tier}
          />
          {isNew ? (
            <span className="bg-accent text-accent-foreground absolute -top-1 -right-1 z-10 rounded-full px-1.5 py-0.5 text-[10px] font-semibold">
              {achievementCopy(locale, "achievements.ui.newBadge")}
            </span>
          ) : null}
        </span>

        <span className="w-full truncate text-xs font-medium">{name}</span>

        {currentTier ? (
          <TierBadge label={tierLabel} tier={progress.tier} />
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
            className="bg-default h-1 w-12 overflow-hidden rounded-full"
            role="progressbar"
          >
            <span
              className="bg-accent block h-full rounded-full"
              style={{ width: `${percent}%` }}
            />
          </span>
        )}
      </button>
    </div>
  );
}
