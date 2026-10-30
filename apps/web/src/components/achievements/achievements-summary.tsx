"use client";

// Summary row for /achievements: unlocked count plus one chip per tier with the
// number of achievements currently sitting at that tier.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Chip, Typography } from "@heroui/react";

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

  return (
    <section className="flex flex-wrap items-center gap-x-3 gap-y-2">
      <Typography className="tabular-nums" type="h5" weight="semibold">
        {formatMessage(
          achievementCopy(locale, "achievements.ui.summaryUnlocked"),
          locale,
          { unlocked, total: achievements.length },
        )}
      </Typography>
      <div className="flex flex-wrap items-center gap-1.5">
        {TIERS.map((tier) => {
          const count = achievements.filter(
            (entry) => entry.tier === tier.tier,
          ).length;

          return (
            <Chip
              key={tier.key}
              className="tabular-nums"
              color={tier.tier === TIERS.length ? "accent" : "default"}
              size="sm"
              variant="soft"
            >
              {`${achievementCopy(locale, tier.copyKey)} ${count}`}
            </Chip>
          );
        })}
      </div>
    </section>
  );
}
