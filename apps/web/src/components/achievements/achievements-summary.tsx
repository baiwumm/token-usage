"use client";

// Summary for /achievements: the title and subtitle on the left, the
// unlocked count with a thin progress bar on the right and one small line
// with the five tier tallies. It replaced the old hero band — the wall below
// carries the badges, so the summary stays a header, not a panel.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Typography } from "@heroui/react";

import { tierGradient } from "./achievement-tiers";

import { TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementsSummary({
  achievements,
  locale,
}: {
  achievements: AchievementProgress[];
  locale: Locale;
}) {
  const unlocked = achievements.filter((entry) => entry.tier >= 1).length;
  const total = achievements.length;
  const percent = total > 0 ? Math.round((unlocked / total) * 100) : 0;

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
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl leading-none font-semibold tabular-nums">
              {unlocked}
            </span>
            <span className="text-muted text-lg tabular-nums">/ {total}</span>
          </div>
          <div
            aria-label={formatMessage(
              achievementCopy(locale, "achievements.ui.summaryUnlocked"),
              locale,
              { unlocked, total },
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
      </div>
    </section>
  );
}
