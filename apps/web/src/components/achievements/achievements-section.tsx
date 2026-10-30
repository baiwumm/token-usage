"use client";

// One category block of /achievements: heading with the unlocked ratio, then
// the card grid (single column on phones, two at md, three at lg). Unlocked
// cards come first — the body sorts each list before it gets here.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { AchievementCategory } from "@/lib/achievements/catalog";
import type { Locale } from "@/lib/copy/locale-config";

import { Typography } from "@heroui/react";

import { AchievementCard } from "./achievement-card";

import { achievementCopy } from "@/lib/copy/achievements";
import { formatMessage } from "@/lib/copy/message";

export function AchievementsSection({
  category,
  achievements,
  locale,
  newIds,
  onOpen,
}: {
  category: AchievementCategory;
  achievements: AchievementProgress[];
  locale: Locale;
  newIds: ReadonlySet<string>;
  onOpen: (id: string) => void;
}) {
  if (achievements.length === 0) return null;
  const unlocked = achievements.filter((entry) => entry.tier >= 1).length;

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="bg-accent h-4 w-1 rounded-full" />
          <Typography type="h5" weight="semibold">
            {achievementCopy(locale, `achievements.ui.category.${category}`)}
          </Typography>
        </div>
        <span className="border-border/60 bg-surface text-muted rounded-full border px-2 py-0.5 text-[11px] tabular-nums">
          {formatMessage(
            achievementCopy(locale, "achievements.ui.sectionProgress"),
            locale,
            { unlocked, total: achievements.length },
          )}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {achievements.map((progress) => (
          <AchievementCard
            key={progress.id}
            isNew={newIds.has(progress.id)}
            locale={locale}
            progress={progress}
            onOpen={() => onOpen(progress.id)}
          />
        ))}
      </div>
    </section>
  );
}
