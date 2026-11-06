"use client";

// Global unlock notifier (docs/achievements-plan.md §3.5). Mounted once by the
// app shell, it compares the read-time payload against the account's server
// watermark and raises one aggregate toast when something unlocked since the
// last visit — whichever page the user is on.
//
// One run per full page load (module flag, SPA navigation does not repeat it),
// after a short delay so the first screen keeps the bandwidth. The
// achievements page manages the watermark itself and is skipped.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { toast } from "@heroui/react";
import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  fetchAchievementsShared,
  markAchievementsSeen,
} from "@/lib/achievements/api";
import { achievementById, TIERS } from "@/lib/achievements/catalog";
import { maxAchievedDay, unlocksSince } from "@/lib/achievements/highlights";
import { achievementCopy } from "@/lib/copy/achievements";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone, dayKeyInTz } from "@/lib/dashboard/ranges";

const START_DELAY_MS = 1_200;
const TOAST_TIMEOUT_MS = 6_000;
/** Names spelled out in the toast; the rest collapse into a count. */
const MAX_SPELLED_OUT = 2;

let started = false;

function tierName(locale: Locale, tier: number): string {
  if (tier < 1) return achievementCopy(locale, "achievements.ui.cardLocked");

  return achievementCopy(locale, TIERS[tier - 1].copyKey);
}

function rowName(locale: Locale, row: AchievementProgress): string {
  const entry = achievementById(row.id);

  return achievementCopy(
    locale,
    entry?.copyKey ?? `achievements.${row.id}.name`,
  );
}

function unlockToast(
  locale: Locale,
  fresh: readonly AchievementProgress[],
): string {
  const separator = locale === "zh" ? "、" : ", ";
  const names = fresh
    .slice(0, MAX_SPELLED_OUT)
    .map((row) => `${rowName(locale, row)} · ${tierName(locale, row.tier)}`)
    .join(separator);

  if (fresh.length > MAX_SPELLED_OUT) {
    return formatMessage(
      achievementCopy(locale, "achievements.ui.unlockedToastMore"),
      locale,
      { names, count: fresh.length },
    );
  }

  return formatMessage(
    achievementCopy(locale, "achievements.ui.unlockedToast"),
    locale,
    { names },
  );
}

export function AchievementUnlockWatcher() {
  const [locale] = useLocale();
  const pathname = usePathname();

  useEffect(() => {
    if (started) return;
    if (pathname.startsWith("/achievements")) {
      started = true;

      return;
    }

    async function check() {
      const timezone = browserTimezone();
      const payload = await fetchAchievementsShared({ tz: timezone });
      const latest = maxAchievedDay(payload.achievements);

      // First visit: record a baseline without surfacing the back catalogue.
      if (payload.seen_through === null) {
        void markAchievementsSeen(latest ?? dayKeyInTz(new Date(), timezone));

        return;
      }

      const fresh = unlocksSince(payload.achievements, payload.seen_through);

      if (fresh.length === 0) return;

      toast(unlockToast(locale, fresh), {
        variant: "success",
        timeout: TOAST_TIMEOUT_MS,
      });

      if (latest) void markAchievementsSeen(latest);
    }

    const timer = window.setTimeout(() => {
      if (started) return;
      started = true;
      if (document.visibilityState === "hidden") return;

      // Unauthenticated (mid redirect) or a failed compute: the toast is
      // decoration, the next full load tries again.
      void check().catch(() => {});
    }, START_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [locale, pathname]);

  return null;
}
