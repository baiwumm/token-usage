"use client";

// The achievement coin in the detail dialog: the medallion (front) that flips
// to a metal disc carrying the tier name and the day it landed (back). Pure
// CSS 3D — `preserve-3d` + `rotateY` — no animation dependency; reduced motion
// users get an instant swap.
//
// The whole coin is one native button (Enter/Space built in, `aria-pressed`
// reports the face shown). It resets to the front whenever the dialog closes
// or another achievement opens.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Tooltip, Typography } from "@heroui/react";
import { useEffect, useState } from "react";

import { AchievementMedallion } from "./achievement-medallion";
import { tierMetal, tierRamp } from "./achievement-tiers";
import { useAchievementFormat } from "./use-achievements-format";

import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementCoin({
  progress,
  open,
  locale,
}: {
  progress: AchievementProgress;
  /** The dialog's open state — closing the dialog shows the front again. */
  open: boolean;
  locale: Locale;
}) {
  const format = useAchievementFormat();
  const [flipped, setFlipped] = useState(false);
  const entry = achievementById(progress.id);
  const currentTier = TIERS.find((tier) => tier.tier === progress.tier) ?? null;
  const metal = tierMetal(progress.tier);
  const ramp = tierRamp(progress.tier);
  const day = currentTier ? progress.achieved_at[currentTier.key] : null;
  const nextThreshold =
    progress.tier < TIERS.length ? progress.thresholds[progress.tier] : null;
  const flipLabel = achievementCopy(
    locale,
    flipped ? "achievements.ui.coinFlipBack" : "achievements.ui.coinFlip",
  );

  useEffect(() => {
    setFlipped(false);
  }, [open, progress.id]);

  return (
    <Tooltip delay={0}>
      <button
        aria-label={flipLabel}
        aria-pressed={flipped}
        className="focus-visible:outline-accent rounded-full focus-visible:outline-2 focus-visible:outline-offset-2"
        type="button"
        onClick={() => setFlipped((value) => !value)}
      >
        <span className="block w-44 [perspective:1000px]">
          <span
            className={`relative block aspect-square transition-transform duration-700 [transform-style:preserve-3d] motion-reduce:transition-none ${
              flipped ? "[transform:rotateY(180deg)]" : ""
            }`}
          >
            <span className="absolute inset-0 [backface-visibility:hidden]">
              <AchievementMedallion
                art={entry?.art}
                className="w-full"
                icon={entry?.icon ?? "tokens"}
                id={progress.id}
                tier={progress.tier}
              />
            </span>

            <span
              className="absolute inset-0 flex items-center justify-center rounded-full [backface-visibility:hidden] [transform:rotateY(180deg)]"
              style={{
                background: `radial-gradient(circle at 32% 26%, ${metal.light}, ${metal.mid} 58%, ${metal.deep})`,
                boxShadow:
                  "inset 0 2px 6px rgba(255, 255, 255, 0.45), inset 0 -8px 18px rgba(0, 0, 0, 0.28), 0 0 0 1px rgba(10, 15, 12, 0.12)",
              }}
            >
              <span className="flex flex-col items-center gap-1.5 px-6 text-center">
                {currentTier ? (
                  <>
                    <Typography
                      className="text-lg font-semibold"
                      style={{ color: ramp.ink }}
                    >
                      {achievementCopy(locale, currentTier.copyKey)}
                    </Typography>
                    {day ? (
                      <Typography
                        className="tabular-nums"
                        style={{ color: ramp.ink, opacity: 0.8 }}
                        type="body-xs"
                      >
                        {formatMessage(
                          achievementCopy(
                            locale,
                            "achievements.ui.dialogAchieved",
                          ),
                          locale,
                          { date: day },
                        )}
                      </Typography>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Typography
                      className="text-lg font-semibold"
                      style={{ color: ramp.ink }}
                    >
                      {achievementCopy(locale, "achievements.ui.cardLocked")}
                    </Typography>
                    {nextThreshold != null ? (
                      <Typography
                        className="tabular-nums"
                        style={{ color: ramp.ink, opacity: 0.8 }}
                        type="body-xs"
                      >
                        {achievementCopy(locale, "achievements.ui.dialogNext")}
                        {" · "}
                        {format(progress.unit, nextThreshold)}
                      </Typography>
                    ) : null}
                  </>
                )}
              </span>
            </span>
          </span>
        </span>
      </button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{flipLabel}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}
