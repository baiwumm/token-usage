"use client";

// Full-width achievements card for /wrapped: achievements unlocked by the end
// of the selected year (tier ≥ 1), highest tier first, each with its medallion
// and tier label. The card is display-only — the detail dialog and the share
// card live on /achievements. Hidden while the optional achievements request is
// unresolved or failed, so a fetch failure never claims "nothing earned".
//
// The payload is a single all-history snapshot (tiers only ever go up), so the
// year scoping happens here with lib/achievements/annual.ts: an earlier year
// legitimately shows fewer rows and lower tiers (2026-11-12 operator call,
// replacing the earlier all-time-only card).

import type { AchievementsPayload } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";
import type { WrappedCopy } from "@/lib/copy/wrapped";

import { Card, Typography } from "@heroui/react";

import { AchievementMedallion } from "@/components/achievement-medallion";
import { TierBadge } from "@/components/achievement-tier-badge";
import { achievementsAsOfYear } from "@/lib/achievements/annual";
import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementsCard({
  achievements,
  copy,
  locale,
  year,
}: {
  achievements: AchievementsPayload | null;
  copy: WrappedCopy;
  locale: Locale;
  /** Selected wrapped year — rows are scoped to this year's end. */
  year: number;
}) {
  if (!achievements) return null;

  const earned = achievementsAsOfYear(achievements.achievements, year);

  return (
    <Card className="gap-4 p-5">
      <Card.Header className="flex-row items-center justify-between gap-3">
        <Card.Title>
          {formatMessage(copy.achievementsTitle, locale, { year })}
        </Card.Title>
        <Typography className="tabular-nums" color="muted" type="body-xs">
          {formatMessage(copy.achievementsCount, locale, {
            count: earned.length,
          })}
        </Typography>
      </Card.Header>
      <Card.Content>
        {earned.length === 0 ? (
          <Typography color="muted" type="body-sm">
            {copy.achievementsEmpty}
          </Typography>
        ) : (
          <ul className="grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
            {earned.map(({ progress, tier: earnedTier }) => {
              const catalogEntry = achievementById(progress.id);
              const tier = TIERS.find((entry) => entry.tier === earnedTier);
              const name = achievementCopy(
                locale,
                catalogEntry?.copyKey ?? `achievements.${progress.id}.name`,
              );

              return (
                <li
                  key={progress.id}
                  className="flex min-w-0 items-center gap-3"
                >
                  <AchievementMedallion
                    art={catalogEntry?.art}
                    className="w-10"
                    icon={catalogEntry?.icon ?? "tokens"}
                    id={progress.id}
                    tier={earnedTier}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <TierBadge
                      className="self-start"
                      label={achievementCopy(locale, tier?.copyKey ?? "")}
                      tier={earnedTier}
                    />
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
