"use client";

// One achievement card: generated badge on top, name + tier label, the
// description, a five-segment track and the numbers behind it. Locked cards
// keep their numbers on screen while the badge dims and carries a lock
// (docs/ui-spec.md 成就).
//
// The whole card is one press target: an invisible button overlays the card so
// the grid stays keyboard reachable without nesting interactive elements.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Card } from "@heroui/react";

import {
  AchievementArt,
  achievementHue,
  tierBarClass,
  tierChipClass,
} from "./achievement-art";
import { useAchievementFormat } from "./use-achievements-format";

import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

/** Share of the next step already covered (0–1). */
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
  const currentTier =
    TIERS.find((entry) => entry.tier === progress.tier) ?? null;
  const nextTier =
    TIERS.find((entry) => entry.tier === progress.tier + 1) ?? null;
  const name = achievementCopy(
    locale,
    catalogEntry?.copyKey ?? `achievements.${progress.id}.name`,
  );
  const description = achievementCopy(
    locale,
    catalogEntry?.descriptionKey ?? `achievements.${progress.id}.description`,
  );
  const achievedDay = currentTier
    ? progress.achieved_at[currentTier.key]
    : null;
  const ratio = progressRatio(
    progress.value,
    progress.thresholds,
    progress.next_threshold,
  );
  const unitLabel = (value: number) => format(progress.unit, value);
  const { hue } = achievementHue(progress.id);

  return (
    <Card className="group relative items-center gap-0 overflow-hidden border border-border/60 p-5 pt-6 text-center transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-lg">
      {/* Wash of the achievement's own hue behind the badge. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-20 h-44"
        style={{
          background: `radial-gradient(58% 100% at 50% 0%, hsl(${hue} 88% 62% / 0.2), transparent 72%)`,
        }}
      />

      {isNew ? (
        <span className="bg-accent text-accent-foreground absolute top-3 right-3 rounded-full px-2 py-0.5 text-[10px] font-semibold">
          {achievementCopy(locale, "achievements.ui.newBadge")}
        </span>
      ) : null}

      <AchievementArt
        icon={catalogEntry?.icon ?? "tokens"}
        id={progress.id}
        size={96}
        tier={progress.tier}
      />

      <Card.Title className="mt-4 text-sm">{name}</Card.Title>

      <div className="mt-1.5 flex items-center gap-2">
        <span className={tierChipClass(progress.tier)}>
          {currentTier
            ? achievementCopy(locale, currentTier.copyKey)
            : achievementCopy(locale, "achievements.ui.cardLocked")}
        </span>
        <span className="text-muted text-[11px] tabular-nums">
          {achievedDay
            ? formatMessage(
                achievementCopy(locale, "achievements.ui.cardAchieved"),
                locale,
                { date: achievedDay },
              )
            : null}
        </span>
      </div>

      <Card.Description className="mt-2 line-clamp-2 min-h-8 text-xs">
        {description}
      </Card.Description>

      <Card.Content className="mt-3 w-full gap-0 p-0">
        <div
          aria-label={`${name} ${unitLabel(progress.value)}`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(ratio * 100)}
          className="flex w-full items-center gap-1"
          role="progressbar"
        >
          {TIERS.map((tier) => {
            const fill =
              progress.tier >= tier.tier
                ? 1
                : tier.tier === progress.tier + 1
                  ? ratio
                  : 0;

            return (
              <span
                key={tier.key}
                className="bg-default h-1.5 flex-1 overflow-hidden rounded-full"
              >
                <span
                  className={`block h-full rounded-full ${tierBarClass(tier.key)}`}
                  style={{ width: `${fill * 100}%` }}
                />
              </span>
            );
          })}
        </div>

        <div className="mt-2 flex w-full items-baseline justify-between gap-2 text-xs tabular-nums">
          <span className="font-medium">{unitLabel(progress.value)}</span>
          <span className="text-muted">
            {nextTier == null
              ? achievementCopy(locale, "achievements.ui.cardMaxed")
              : formatMessage(
                  achievementCopy(locale, "achievements.ui.cardNext"),
                  locale,
                  {
                    tier: achievementCopy(locale, nextTier.copyKey),
                    gap: unitLabel(progress.next_threshold! - progress.value),
                  },
                )}
          </span>
        </div>
      </Card.Content>

      <button
        aria-label={`${name} — ${achievementCopy(locale, "achievements.ui.viewDetail")}`}
        className="focus-visible:outline-accent absolute inset-0 cursor-pointer rounded-[inherit] focus-visible:outline-2 focus-visible:outline-offset-2"
        type="button"
        onClick={onOpen}
      />
    </Card>
  );
}
