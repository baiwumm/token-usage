"use client";

// Summary for /achievements: the title and subtitle on the left, the tier
// progress with a thin progress bar on the right — the headline counts tiers
// (every achievement contributes 0–5), so advancing a tier keeps moving the
// number after the unlocked count has maxed out. The unlocked count trails the
// five tier tallies as the sixth item of the line below. Both columns keep the
// same height so their tops align. It replaced the old hero band — the wall
// below carries the badges, so the summary stays a header, not a panel.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";
import type { ReactNode } from "react";

import { Typography } from "@heroui/react";

import { tierGradient } from "@/components/achievement-tiers";
import { TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementsSummary({
  achievements,
  locale,
  refreshSlot,
}: {
  achievements: AchievementProgress[];
  locale: Locale;
  /** Rendered beside the tier headline, vertically centered — the refresh button. */
  refreshSlot?: ReactNode;
}) {
  const unlocked = achievements.filter((entry) => entry.tier >= 1).length;
  const total = achievements.length;
  const totalTiers = total * TIERS.length;
  const tiers = achievements.reduce((sum, entry) => sum + entry.tier, 0);
  const percent = totalTiers > 0 ? Math.round((tiers / totalTiers) * 100) : 0;

  return (
    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-col gap-1">
          <Typography type="h2" weight="semibold">
            {achievementCopy(locale, "achievements.ui.summaryLabel")}
          </Typography>
          <Typography color="muted" type="body-xs">
            {achievementCopy(locale, "achievements.ui.subtitle")}
          </Typography>
        </div>

        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-2">
            <div className="flex items-baseline gap-2">
              <span className="text-muted text-sm">
                {achievementCopy(locale, "achievements.ui.tierProgressLabel")}
              </span>
              <span className="text-4xl leading-none font-semibold tabular-nums">
                {tiers}
              </span>
              <span className="text-muted text-lg tabular-nums">
                / {totalTiers}
              </span>
            </div>
            {refreshSlot}
          </div>
          <div
            aria-label={formatMessage(
              achievementCopy(locale, "achievements.ui.tierProgress"),
              locale,
              { tiers, totalTiers, unlocked, total },
            )}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            className="bg-default h-1.5 w-40 overflow-hidden rounded-full"
            role="progressbar"
          >
            <span
              className="bg-accent block h-full rounded-full"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs">
        {TIERS.map((tier) => {
          const count = achievements.filter(
            (entry) => entry.tier === tier.tier,
          ).length;

          return (
            <span key={tier.key} className="flex items-center gap-1.5">
              <span
                aria-hidden="true"
                className="size-2.5 rounded-full"
                style={{ background: tierGradient(tier.tier) }}
              />
              <span className="text-muted">
                {achievementCopy(locale, tier.copyKey)}
              </span>
              <span className="font-semibold tabular-nums">{count}</span>
            </span>
          );
        })}
        <span className="flex items-center gap-1.5">
          <span className="text-muted">
            {achievementCopy(locale, "achievements.ui.unlockedLabel")}
          </span>
          <span className="font-semibold tabular-nums">
            {formatMessage(
              achievementCopy(locale, "achievements.ui.unlockedCount"),
              locale,
              { unlocked, total },
            )}
          </span>
        </span>
      </div>
    </section>
  );
}
