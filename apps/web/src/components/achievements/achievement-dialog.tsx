"use client";

// Achievement detail dialog: the large medallion, the five-tier timeline with
// the day each tier landed (or its threshold while locked), the gap to the next
// tier and the coverage note for the session/sync-sourced achievements
// (docs/ui-spec.md 成就 → 详情).

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Modal, Typography } from "@heroui/react";

import { AchievementMedallion } from "./achievements-medallion";
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
              <Modal.Header>
                <AchievementMedallion
                  icon={catalogEntry?.icon ?? "tokens"}
                  size="lg"
                  tier={progress.tier}
                />
                <Modal.Heading>{name}</Modal.Heading>
                <Typography color="muted" type="body-sm">
                  {description}
                </Typography>
              </Modal.Header>

              <Modal.Body className="gap-4">
                <div className="flex flex-col gap-1">
                  <Typography color="muted" type="body-xs">
                    {achievementCopy(locale, "achievements.ui.dialogCurrent")}
                  </Typography>
                  <Typography
                    className="tabular-nums"
                    type="h5"
                    weight="semibold"
                  >
                    {unitLabel(progress.value)}
                  </Typography>
                  <Typography
                    className="tabular-nums"
                    color="muted"
                    type="body-xs"
                  >
                    {progress.next_threshold == null
                      ? achievementCopy(locale, "achievements.ui.dialogMaxed")
                      : formatMessage(
                          achievementCopy(locale, "achievements.ui.dialogGap"),
                          locale,
                          {
                            gap: unitLabel(
                              progress.next_threshold - progress.value,
                            ),
                          },
                        )}
                  </Typography>
                </div>

                <div className="flex flex-col gap-1.5">
                  <Typography className="font-medium" type="body-sm">
                    {achievementCopy(locale, "achievements.ui.dialogTimeline")}
                  </Typography>
                  <ul className="flex flex-col gap-1">
                    {TIERS.map((tier) => {
                      const day = progress.achieved_at[tier.key];
                      const reached = progress.tier >= tier.tier;

                      return (
                        <li
                          key={tier.key}
                          className={`flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-sm ${
                            tier.tier === progress.tier
                              ? "bg-surface-secondary"
                              : ""
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className={`size-1.5 rounded-full ${
                                reached ? "bg-foreground/70" : "bg-border"
                              }`}
                            />
                            <span className={reached ? "" : "text-muted"}>
                              {achievementCopy(locale, tier.copyKey)}
                            </span>
                          </span>
                          <span className="text-muted tabular-nums text-xs">
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
                  <div className="flex flex-col gap-1 rounded-lg bg-surface-secondary p-3">
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
