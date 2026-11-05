"use client";

// L4: every unlocked achievement, always visible. Clicking one opens the
// shared /achievements detail dialog (values, tier timeline and history
// included), just like the signed-in page.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";
import type { PublicPageCopy } from "@/lib/copy/public-page";

import { Button, Description, Typography, cn } from "@heroui/react";
import { useState } from "react";

import { UAchievementDialog } from "./u-achievement-dialog";

import { AchievementMedallion } from "@/components/achievements/achievement-medallion";
import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function UAchievements({
  items,
  copy,
  locale,
}: {
  items: AchievementProgress[];
  copy: PublicPageCopy;
  locale: Locale;
}) {
  const [selected, setSelected] = useState<AchievementProgress | null>(null);
  const [open, setOpen] = useState(false);

  return (
    <section
      className="u-reveal flex flex-col gap-6"
      style={{ animationDelay: "320ms" }}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <Typography type="h4">{copy.achievementsTitle}</Typography>
        <Description className="text-muted tabular-nums text-xs">
          {formatMessage(copy.achievementsCount, locale, {
            count: items.length,
          })}
        </Description>
      </div>

      {items.length === 0 ? (
        <Description className="text-muted text-xs">
          {copy.achievementsEmpty}
        </Description>
      ) : (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-5 md:grid-cols-6">
          {items.map((item, index) => {
            const entry = achievementById(item.id);
            const tierKey = TIERS.find(
              (tier) => tier.tier === item.tier,
            )?.copyKey;
            const tierLabel = tierKey ? achievementCopy(locale, tierKey) : "";
            const name = achievementCopy(
              locale,
              entry?.copyKey ?? `achievements.${item.id}.name`,
            );

            return (
              <Button
                key={item.id}
                aria-label={`${name} · ${tierLabel}`}
                className={cn(
                  "u-medallion group h-auto! min-h-0! w-full flex-col! items-center gap-2 rounded-xl! p-2!",
                  "cursor-pointer",
                )}
                style={{ animationDelay: `${360 + index * 60}ms` }}
                variant="ghost"
                onPress={() => {
                  setSelected(item);
                  setOpen(true);
                }}
              >
                <span className="inline-flex transition-transform duration-200 group-hover:-translate-y-1 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
                  <AchievementMedallion
                    art={entry?.art}
                    className="size-20 md:size-24"
                    icon={entry?.icon ?? "tokens"}
                    id={item.id}
                    tier={item.tier}
                  />
                </span>
                <Typography
                  className="w-full truncate text-center"
                  type="body-xs"
                >
                  {name}
                </Typography>
                <Description className="text-muted text-xs">
                  {tierLabel}
                </Description>
              </Button>
            );
          })}
        </div>
      )}

      <UAchievementDialog
        locale={locale}
        open={open}
        progress={selected}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) setSelected(null);
        }}
      />
    </section>
  );
}
