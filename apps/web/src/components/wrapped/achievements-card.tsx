"use client";

// Full-width achievements card for /wrapped: every achievement earned so far
// (tier ≥ 1), highest tier first, each with its medallion and tier label. The
// card is display-only — the detail dialog and the share card live on
// /achievements. Hidden while the optional achievements request is unresolved
// or failed, so a fetch failure never claims "nothing earned".

import type { AchievementsPayload } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";
import type { WrappedCopy } from "@/lib/copy/wrapped";

import { Card, Typography } from "@heroui/react";

import { AchievementMedallion } from "@/components/achievements/achievement-medallion";
import { TierBadge } from "@/components/achievements/achievement-tier-badge";
import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementsCard({
  achievements,
  copy,
  locale,
}: {
  achievements: AchievementsPayload | null;
  copy: WrappedCopy;
  locale: Locale;
}) {
  if (!achievements) return null;

  // Payload order is catalog order, so the stable sort keeps that order for
  // achievements sharing a tier.
  const earned = achievements.achievements
    .filter((entry) => entry.tier >= 1)
    .sort((a, b) => b.tier - a.tier);

  return (
    <Card className="gap-4 p-5">
      <Card.Header className="flex-row items-center justify-between gap-3">
        <Card.Title>{copy.achievementsTitle}</Card.Title>
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
            {earned.map((progress) => {
              const catalogEntry = achievementById(progress.id);
              const tier = TIERS.find((entry) => entry.tier === progress.tier);
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
                    tier={progress.tier}
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="truncate text-sm font-medium">{name}</span>
                    <TierBadge
                      className="self-start"
                      label={achievementCopy(locale, tier?.copyKey ?? "")}
                      tier={progress.tier}
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
