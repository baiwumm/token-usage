"use client";

// Achievement detail dialog: the large generated badge on a hue wash, the
// current value and gap, the five-tier timeline with the day each tier landed
// (threshold + lock while unreached) and the coverage note for the
// session/sync-sourced achievements (docs/ui-spec.md 成就 → 详情).

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Lock } from "@gravity-ui/icons";
import { Modal, Typography } from "@heroui/react";

import {
  AchievementArt,
  achievementHue,
  tierChipClass,
} from "./achievement-art";
import { useAchievementFormat } from "./use-achievements-format";

import { achievementById, TIERS } from "@/lib/achievements/catalog";
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
                  <AchievementArt
                    icon={catalogEntry?.icon ?? "tokens"}
                    id={progress.id}
                    size={124}
                    tier={progress.tier}
                  />
                </div>
                <Modal.Heading className="relative">{name}</Modal.Heading>
                <Typography className="relative" color="muted" type="body-sm">
                  {description}
                </Typography>
              </Modal.Header>

              <Modal.Body className="gap-5">
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
                    <span className={tierChipClass(progress.tier)}>
                      {TIERS.find((tier) => tier.tier === progress.tier)
                        ? achievementCopy(
                            locale,
                            TIERS[progress.tier - 1].copyKey,
                          )
                        : achievementCopy(
                            locale,
                            "achievements.ui.dialogLocked",
                          )}
                    </span>
                    <Typography
                      className="tabular-nums"
                      color="muted"
                      type="body-xs"
                    >
                      {progress.next_threshold == null
                        ? achievementCopy(locale, "achievements.ui.dialogMaxed")
                        : formatMessage(
                            achievementCopy(
                              locale,
                              "achievements.ui.dialogGap",
                            ),
                            locale,
                            {
                              gap: unitLabel(
                                progress.next_threshold - progress.value,
                              ),
                            },
                          )}
                    </Typography>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Typography className="font-medium" type="body-sm">
                    {achievementCopy(locale, "achievements.ui.dialogTimeline")}
                  </Typography>
                  <ul className="flex flex-col">
                    {TIERS.map((tier) => {
                      const day = progress.achieved_at[tier.key];
                      const reached = progress.tier >= tier.tier;

                      return (
                        <li
                          key={tier.key}
                          className={`flex items-center gap-3 rounded-xl px-2 py-2 ${
                            tier.tier === progress.tier
                              ? "bg-surface-secondary"
                              : ""
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                              reached
                                ? "border-transparent"
                                : "border-border text-muted"
                            }`}
                            style={
                              reached
                                ? {
                                    background: `linear-gradient(135deg, hsl(${hue} 80% 62%), hsl(${hue + 35} 70% 44%))`,
                                  }
                                : undefined
                            }
                          >
                            {reached ? (
                              <span className="size-1.5 rounded-full bg-white/90" />
                            ) : (
                              <Lock className="size-3" />
                            )}
                          </span>
                          <span
                            className={`flex-1 text-sm ${
                              reached ? "" : "text-muted"
                            }`}
                          >
                            {achievementCopy(locale, tier.copyKey)}
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
                              : `${unitLabel(progress.thresholds[tier.tier - 1])} · ${achievementCopy(
                                  locale,
                                  "achievements.ui.dialogLocked",
                                )}`}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>

                {coverage ? (
                  <div className="bg-surface-secondary flex flex-col gap-1 rounded-xl p-3">
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
