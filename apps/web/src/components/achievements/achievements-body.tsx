"use client";

// Body of /achievements: summary, the four category blocks ordered unlocked
// first, the empty-usage banner and the detail dialog. Pure projection of the
// payload — the client owns fetching, the new-badge bookkeeping and the states.

import type { AchievementsPayload } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { Button, Card } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";

import { AchievementDetail } from "./achievement-detail";
import { AchievementsSection } from "./achievements-section";
import { AchievementsSummary } from "./achievements-summary";

import { useProfile } from "@/lib/auth/profile";
import {
  ACHIEVEMENT_CATEGORIES,
  type AchievementCategory,
} from "@/lib/achievements/catalog";
import { achievementCopy } from "@/lib/copy/achievements";

export function AchievementsBody({
  payload,
  locale,
  newIds,
}: {
  payload: AchievementsPayload;
  locale: Locale;
  newIds: ReadonlySet<string>;
}) {
  const router = useRouter();
  const { profile } = useProfile();
  const [selected, setSelected] = useState<
    AchievementsPayload["achievements"][number] | null
  >(null);
  const [open, setOpen] = useState(false);

  const openDetail = useCallback(
    (id: string) => {
      const entry = payload.achievements.find((item) => item.id === id);

      if (!entry) return;
      setSelected(entry);
      setOpen(true);
    },
    [payload.achievements],
  );

  // A brand-new account has zero on every metric: the grid still renders (all
  // locked) with the pairing hint on top, which is more useful than a blank page.
  const hasUsage = payload.achievements.some((entry) => entry.value > 0);

  return (
    <div className="flex flex-col gap-6">
      <AchievementsSummary
        achievements={payload.achievements}
        locale={locale}
      />

      {hasUsage ? null : (
        <Card className="p-5">
          <Card.Header>
            <Card.Title>
              {achievementCopy(locale, "achievements.ui.emptyTitle")}
            </Card.Title>
            <Card.Description>
              {achievementCopy(locale, "achievements.ui.emptyBody")}
            </Card.Description>
          </Card.Header>
          <Card.Content>
            <Button
              size="sm"
              variant="primary"
              onPress={() => router.push("/device")}
            >
              {achievementCopy(locale, "achievements.ui.emptyPair")}
            </Button>
          </Card.Content>
        </Card>
      )}

      {ACHIEVEMENT_CATEGORIES.map((category) => (
        <AchievementsSection
          key={category}
          achievements={sortedForCategory(payload, category)}
          category={category}
          locale={locale}
          newIds={newIds}
          onOpen={openDetail}
        />
      ))}

      <AchievementDetail
        handle={profile?.displayName || profile?.email || ""}
        locale={locale}
        open={open}
        progress={selected}
        onOpenChange={setOpen}
      />
    </div>
  );
}

/** Unlocked first, then the highest tier; catalog order breaks the ties. */
function sortedForCategory(
  payload: AchievementsPayload,
  category: AchievementCategory,
): AchievementsPayload["achievements"] {
  return payload.achievements
    .filter((entry) => entry.category === category)
    .sort((a, b) => b.tier - a.tier);
}
