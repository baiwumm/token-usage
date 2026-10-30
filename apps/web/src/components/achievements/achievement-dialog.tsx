"use client";

// Achievement detail dialog: the large medallion on a hue wash, the current
// value with its tier label, then the upstream-style read-out — progress to
// the next tier with a metallic bar, the five-segment tier history, and the
// five-tier timeline with the threshold of every tier. The day a tier landed
// rides along in tooltips (timeline badge and history segment).
//
// Layout follows the upstream TokenTracker dialog (docs/ui-spec.md 成就 → 详情):
// label on the left, value on the right, one visual language for "tier".

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Modal, Tooltip, Typography } from "@heroui/react";

import { AchievementMedallion } from "./achievement-medallion";
import { TierBadge } from "./achievement-tier-badge";
import { achievementHue, tierGradient } from "./achievement-tiers";
import { useAchievementFormat } from "./use-achievements-format";

import {
  achievementById,
  progressRatioForNext,
  TIERS,
} from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementDialog({
  progress,
  open,
  locale,
  onOpenChange,
}: {
  /** Last selection, kept mounted while the close animation runs. */
  progress: AchievementProgress | null;
  open: boolean;
  locale: Locale;
  onOpenChange: (open: boolean) => void;
}) {
  const format = useAchievementFormat();
  const catalogEntry = progress ? achievementById(progress.id) : undefined;
  const name = progress
    ? achievementCopy(
        locale,
        catalogEntry?.copyKey ?? `achievements.${progress.id}.name`,
      )
    : "";
  const description = progress
    ? achievementCopy(
        locale,
        catalogEntry?.descriptionKey ??
          `achievements.${progress.id}.description`,
      )
    : "";
  const coverage = catalogEntry?.coverageKey
    ? achievementCopy(locale, catalogEntry.coverageKey)
    : null;
  const unitLabel = (value: number) =>
    progress ? format(progress.unit, value) : "";
  const { hue } = achievementHue(progress?.id ?? "");

  const currentTier =
    progress != null
      ? (TIERS.find((tier) => tier.tier === progress.tier) ?? null)
      : null;
  const nextTier =
    progress != null
      ? (TIERS.find((tier) => tier.tier === progress.tier + 1) ?? null)
      : null;
  const tierLabel = currentTier
    ? achievementCopy(locale, currentTier.copyKey)
    : achievementCopy(locale, "achievements.ui.cardLocked");
  const achievedDay = currentTier
    ? (progress?.achieved_at[currentTier.key] ?? null)
    : null;
  const ratio = progress
    ? progressRatioForNext(progress.value, progress.next_threshold)
    : 0;

  return (
    <Modal.Backdrop
      isOpen={open && progress != null}
      onOpenChange={onOpenChange}
    >
      <Modal.Container size="lg">
        <Modal.Dialog className="lg:max-w-xl">
          <Modal.CloseTrigger
            aria-label={achievementCopy(locale, "achievements.ui.dialogClose")}
          />
          {progress ? (
            <>
              <Modal.Header className="items-center gap-3 text-center">
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-x-0 top-0 h-44"
                  style={{
                    background: `radial-gradient(55% 100% at 50% 0%, hsl(${hue} 88% 62% / 0.22), transparent 72%)`,
                  }}
                />
                <div className="relative">
                  <AchievementMedallion
                    art={catalogEntry?.art}
                    className="w-44"
                    icon={catalogEntry?.icon ?? "tokens"}
                    id={progress.id}
                    tier={progress.tier}
                  />
                </div>
                <Modal.Heading className="relative">{name}</Modal.Heading>
                <Typography className="relative" color="muted" type="body-sm">
                  {description}
                </Typography>
              </Modal.Header>

              <Modal.Body className="gap-6">
                {/* Current value + the tier label as a metallic badge. */}
                <div className="flex items-end justify-between gap-4">
                  <div className="flex flex-col gap-1">
                    <Typography color="muted" type="body-xs">
                      {achievementCopy(locale, "achievements.ui.dialogCurrent")}
                    </Typography>
                    <span className="text-3xl leading-none font-semibold tabular-nums">
                      {unitLabel(progress.value)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end gap-1.5">
                    <TierBadge
                      label={tierLabel}
                      size="md"
                      tier={progress.tier}
                    />
                    {achievedDay ? (
                      <Typography
                        className="tabular-nums"
                        color="muted"
                        type="body-xs"
                      >
                        {formatMessage(
                          achievementCopy(
                            locale,
                            "achievements.ui.dialogAchieved",
                          ),
                          locale,
                          { date: achievedDay },
                        )}
                      </Typography>
                    ) : null}
                  </div>
                </div>

                <dl className="border-border/60 mt-2 flex flex-col gap-4 border-t pt-5">
                  {/* Progress to the next tier, painted with the tier ramp. */}
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3 text-xs">
                      <dt className="text-muted">
                        {nextTier == null
                          ? achievementCopy(
                              locale,
                              "achievements.ui.dialogMaxed",
                            )
                          : formatMessage(
                              achievementCopy(
                                locale,
                                "achievements.ui.dialogProgressTo",
                              ),
                              locale,
                              {
                                tier: achievementCopy(locale, nextTier.copyKey),
                              },
                            )}
                      </dt>
                      {nextTier == null ? null : (
                        <dd className="tabular-nums">
                          {unitLabel(progress.value)} →{" "}
                          {unitLabel(progress.next_threshold ?? 0)}
                        </dd>
                      )}
                    </div>
                    <div className="bg-default h-1.5 w-full overflow-hidden rounded-full">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.round(ratio * 100)}%`,
                          background: tierGradient(progress.tier, 90),
                        }}
                      />
                    </div>
                  </div>

                  {/* Tier history: one segment per tier, the day in a tooltip. */}
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <dt className="text-muted">
                      {achievementCopy(
                        locale,
                        "achievements.ui.dialogTierHistory",
                      )}
                    </dt>
                    <dd className="flex items-center gap-1">
                      {TIERS.map((tier) => {
                        const reached = progress.tier >= tier.tier;
                        const day = progress.achieved_at[tier.key];

                        return (
                          <Tooltip key={tier.key} delay={0}>
                            <span
                              className="inline-flex h-2 w-8 overflow-hidden rounded-full"
                              style={
                                reached
                                  ? {
                                      background: tierGradient(tier.tier),
                                      boxShadow:
                                        "inset 0 1px 1px rgba(255, 255, 255, 0.4)",
                                    }
                                  : undefined
                              }
                            >
                              {reached ? null : (
                                <span className="bg-default h-full w-full rounded-full" />
                              )}
                            </span>
                            <Tooltip.Content showArrow placement="bottom">
                              <Tooltip.Arrow />
                              <Typography type="body-xs">
                                {achievementCopy(locale, tier.copyKey)}
                                {" · "}
                                {day
                                  ? formatMessage(
                                      achievementCopy(
                                        locale,
                                        "achievements.ui.dialogAchieved",
                                      ),
                                      locale,
                                      { date: day },
                                    )
                                  : `${unitLabel(progress.thresholds[tier.tier - 1])} · ${achievementCopy(
                                      locale,
                                      "achievements.ui.dialogLocked",
                                    )}`}
                              </Typography>
                            </Tooltip.Content>
                          </Tooltip>
                        );
                      })}
                    </dd>
                  </div>
                </dl>

                {/* Five-tier timeline: every threshold, every landing day. */}
                <div className="mt-2 flex flex-col gap-2">
                  <Typography color="muted" type="body-xs">
                    {achievementCopy(locale, "achievements.ui.dialogTimeline")}
                  </Typography>
                  <ul className="flex flex-col">
                    {TIERS.map((tier) => {
                      const day = progress.achieved_at[tier.key];
                      const reached = progress.tier >= tier.tier;

                      return (
                        <li
                          key={tier.key}
                          className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                            tier.tier === progress.tier
                              ? "bg-surface-secondary"
                              : ""
                          }`}
                        >
                          <Tooltip delay={0}>
                            <span className="shrink-0">
                              <TierBadge
                                label={achievementCopy(locale, tier.copyKey)}
                                tier={reached ? tier.tier : 0}
                              />
                            </span>
                            <Tooltip.Content showArrow placement="bottom">
                              <Tooltip.Arrow />
                              <Typography type="body-xs">
                                {achievementCopy(locale, tier.copyKey)}
                                {" · "}
                                {day
                                  ? formatMessage(
                                      achievementCopy(
                                        locale,
                                        "achievements.ui.dialogAchieved",
                                      ),
                                      locale,
                                      { date: day },
                                    )
                                  : `${unitLabel(progress.thresholds[tier.tier - 1])} · ${achievementCopy(
                                      locale,
                                      "achievements.ui.dialogLocked",
                                    )}`}
                              </Typography>
                            </Tooltip.Content>
                          </Tooltip>
                          <span
                            className={`flex-1 text-sm tabular-nums ${
                              reached ? "" : "text-muted"
                            }`}
                          >
                            {unitLabel(progress.thresholds[tier.tier - 1])}
                          </span>
                          <span className="text-muted text-xs tabular-nums">
                            {day
                              ? formatMessage(
                                  achievementCopy(
                                    locale,
                                    "achievements.ui.dialogAchieved",
                                  ),
                                  locale,
                                  { date: day },
                                )
                              : achievementCopy(
                                  locale,
                                  "achievements.ui.dialogLocked",
                                )}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {coverage ? (
                  <div className="bg-surface-secondary mt-2 flex flex-col gap-1 rounded-xl p-3">
                    <Typography className="font-medium" type="body-xs">
                      {achievementCopy(
                        locale,
                        "achievements.ui.dialogCoverage",
                      )}
                    </Typography>
                    <Typography color="muted" type="body-xs">
                      {coverage}
                    </Typography>
                  </div>
                ) : null}
              </Modal.Body>
            </>
          ) : null}
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
