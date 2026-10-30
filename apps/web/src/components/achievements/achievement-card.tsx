"use client";

// One achievement card: medallion + name + description, the tier it reached,
// progress towards the next threshold and the day the current tier landed.
// Locked cards dim but keep their numbers on screen (docs/ui-spec.md 成就).
//
// The whole card is one press target: an invisible button overlays the card so
// the grid stays keyboard reachable without nesting interactive elements.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Card, Chip, Meter, Typography } from "@heroui/react";

import { AchievementMedallion } from "./achievements-medallion";
import { useAchievementFormat } from "./use-achievements-format";

import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

/** Lower bound of the next step: the previous threshold, or zero at bronze. */
function progressRatio(
  value: number,
  thresholds: readonly number[],
  next: number | null,
): number {
  if (next == null) return 1;
  const index = thresholds.indexOf(next);
  const base = index > 0 ? thresholds[index - 1] : 0;
  const span = next - base;

  if (span <= 0) return 1;

  return Math.min(1, Math.max(0, (value - base) / span));
}

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
  const format = useAchievementFormat();
  const catalogEntry = achievementById(progress.id);
  const tier = TIERS.find((entry) => entry.tier === progress.tier) ?? null;
  const name = achievementCopy(
    locale,
    catalogEntry?.copyKey ?? `achievements.${progress.id}.name`,
  );
  const description = achievementCopy(
    locale,
    catalogEntry?.descriptionKey ?? `achievements.${progress.id}.description`,
  );
  const achievedDay = tier
    ? progress.achieved_at[tier.key]
    : progress.achieved_at.bronze;
  const ratio = progressRatio(
    progress.value,
    progress.thresholds,
    progress.next_threshold,
  );
  const unitLabel = (value: number) => format(progress.unit, value);

  return (
    <Card
      className={`relative gap-3 p-4 ${progress.tier === 0 ? "opacity-80" : ""}`}
    >
      <Card.Header className="flex-row items-start gap-3 p-0">
        <AchievementMedallion
          icon={catalogEntry?.icon ?? "tokens"}
          tier={progress.tier}
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-1.5">
            <Card.Title className="truncate text-sm">{name}</Card.Title>
            {isNew ? (
              <Chip
                aria-label={achievementCopy(locale, "achievements.ui.newBadge")}
                className="h-5 shrink-0 px-1.5 text-[10px]"
                color="accent"
                size="sm"
                variant="soft"
              >
                {achievementCopy(locale, "achievements.ui.newBadge")}
              </Chip>
            ) : null}
          </div>
          <Card.Description className="line-clamp-2 text-xs">
            {description}
          </Card.Description>
        </div>
        {tier ? (
          <Chip
            className="shrink-0"
            color={progress.tier === TIERS.length ? "accent" : "default"}
            size="sm"
            variant="soft"
          >
            {achievementCopy(locale, tier.copyKey)}
          </Chip>
        ) : null}
      </Card.Header>

      <Card.Content className="gap-1.5 p-0">
        <Meter
          aria-label={`${name} ${unitLabel(progress.value)}`}
          value={ratio * 100}
        >
          <Meter.Track className="h-1.5">
            <Meter.Fill
              className={progress.tier >= 4 ? "bg-accent" : "bg-foreground/45"}
            />
          </Meter.Track>
        </Meter>
        <div className="flex items-baseline justify-between gap-2 tabular-nums text-xs">
          <span className="text-foreground/75">
            {formatMessage(
              achievementCopy(locale, "achievements.ui.cardCurrent"),
              locale,
              { value: unitLabel(progress.value) },
            )}
          </span>
          <span className="text-muted">
            {progress.next_threshold == null
              ? achievementCopy(locale, "achievements.ui.cardMaxed")
              : formatMessage(
                  achievementCopy(locale, "achievements.ui.cardNext"),
                  locale,
                  {
                    tier: achievementCopy(
                      locale,
                      TIERS[Math.min(progress.tier, TIERS.length - 1)].copyKey,
                    ),
                    gap: unitLabel(progress.next_threshold - progress.value),
                  },
                )}
          </span>
        </div>
        <Typography className="tabular-nums" color="muted" type="body-xs">
          {achievedDay
            ? formatMessage(
                achievementCopy(locale, "achievements.ui.cardAchieved"),
                locale,
                { date: achievedDay },
              )
            : achievementCopy(locale, "achievements.ui.cardLocked")}
        </Typography>
      </Card.Content>

      <button
        aria-label={`${name} — ${achievementCopy(locale, "achievements.ui.viewDetail")}`}
        className="absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        type="button"
        onClick={onOpen}
      />
    </Card>
  );
}
