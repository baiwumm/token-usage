"use client";

// Summary band for /achievements: the unlocked count as a large number, one
// tier tally per metal and a distribution bar that shows how the collection
// is stacked across the five tiers.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Typography } from "@heroui/react";

import { tierBarClass } from "./achievement-art";

import { TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";

export function AchievementsSummary({
  achievements,
  locale,
}: {
  achievements: AchievementProgress[];
  locale: Locale;
}) {
  const unlocked = achievements.filter((entry) => entry.tier >= 1).length;
  const locked = achievements.length - unlocked;

  return (
    <section className="border-border/60 bg-surface relative overflow-hidden rounded-3xl border p-5 md:p-6">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(70% 120% at 12% 0%, color-mix(in oklab, var(--accent) 16%, transparent), transparent 62%)",
        }}
      />

      <div className="relative flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {achievementCopy(locale, "achievements.ui.summaryLabel")}
          </Typography>
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-semibold tabular-nums">
              {unlocked}
            </span>
            <span className="text-muted text-lg tabular-nums">
              / {achievements.length}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-5">
          {TIERS.map((tier) => {
            const count = achievements.filter(
              (entry) => entry.tier === tier.tier,
            ).length;

            return (
              <div key={tier.key} className="flex flex-col items-start gap-1">
                <span className="flex items-center gap-1.5">
                  <span
                    aria-hidden="true"
                    className={`size-2 rounded-full ${tierBarClass(tier.key)}`}
                  />
                  <span className="text-muted text-[11px]">
                    {achievementCopy(locale, tier.copyKey)}
                  </span>
                </span>
                <span className="text-xl leading-none font-semibold tabular-nums">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="relative mt-5 flex h-2 items-center gap-1">
        {TIERS.map((tier) => {
          const count = achievements.filter(
            (entry) => entry.tier === tier.tier,
          ).length;

          return count > 0 ? (
            <span
              key={tier.key}
              className={`h-full rounded-full ${tierBarClass(tier.key)}`}
              style={{ flexGrow: count }}
            />
          ) : null;
        })}
        {locked > 0 ? (
          <span
            className="bg-default h-full rounded-full"
            style={{ flexGrow: locked }}
          />
        ) : null}
      </div>
    </section>
  );
}
