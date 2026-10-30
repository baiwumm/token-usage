"use client";

// /achievements — read-time achievements (docs/achievements-plan.md §3, P2).
// Everything is derived from the payload; the page adds only the refresh
// affordance, the loading/error states and the "new" badge bookkeeping.
//
// New badges: the last-seen day is stored per account (token-usage.achievements
// .seen.<userId>) the moment the grid renders, so a tier that landed after that
// day shows 新 until the next visit. Nothing is written back to the server.

import { ArrowsRotateRight } from "@gravity-ui/icons";
import { Button, Skeleton, Tooltip, Typography } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AchievementsBody } from "./achievements-body";
import { AchievementsSkeleton } from "./achievements-skeleton";
import { useAchievements } from "./use-achievements";

import { achievementCopy } from "@/lib/copy/achievements";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone, dayKeyInTz } from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";
import { SectionError } from "@/components/section-states";

const SEEN_KEY_PREFIX = "token-usage.achievements.seen.";

function seenKey(userId: string): string {
  return `${SEEN_KEY_PREFIX}${userId}`;
}

/** Latest tier day across the five dates (ISO days sort lexicographically). */
function latestAchievedDay(
  achieved: Record<string, string | null>,
): string | null {
  let latest: string | null = null;

  for (const day of Object.values(achieved)) {
    if (day && (latest === null || day > latest)) latest = day;
  }

  return latest;
}

export function AchievementsClient() {
  const [locale] = useLocale();
  const { formatDateTime } = useFormat();
  const { state, error, refreshing, lastUpdatedAt, userId, refresh } =
    useAchievements();

  const [seenDay, setSeenDay] = useState<string | null>(null);
  const [seenReady, setSeenReady] = useState(false);

  useEffect(() => {
    if (!userId) return;

    try {
      setSeenDay(window.localStorage.getItem(seenKey(userId)));
    } catch {
      // storage unavailable — treat every unlocked tier as new
    }
    setSeenReady(true);
  }, [userId]);

  const payload = state.data;

  // Derived from the value read at mount: writing the marker below must not
  // clear the badges of the visit that is currently on screen.
  const newIds = useMemo(() => {
    const ids = new Set<string>();

    if (!seenReady || !payload) return ids;

    for (const entry of payload.achievements) {
      const latest = latestAchievedDay(entry.achieved_at);

      if (latest && (seenDay === null || latest > seenDay)) ids.add(entry.id);
    }

    return ids;
  }, [payload, seenDay, seenReady]);

  useEffect(() => {
    if (!userId || !seenReady || !payload) return;

    let marker: string | null = null;

    for (const entry of payload.achievements) {
      const latest = latestAchievedDay(entry.achieved_at);

      if (latest && (marker === null || latest > marker)) marker = latest;
    }

    marker ??= dayKeyInTz(new Date(), browserTimezone());
    if (seenDay !== null && marker <= seenDay) return;

    try {
      window.localStorage.setItem(seenKey(userId), marker);
    } catch {
      // best effort
    }
  }, [payload, seenDay, seenReady, userId]);

  const retry = useCallback(() => refresh(), [refresh]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <Typography color="muted" type="body-sm">
          {achievementCopy(locale, "achievements.ui.subtitle")}
        </Typography>
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-label={achievementCopy(locale, "achievements.ui.refresh")}
            size="sm"
            variant="tertiary"
            onPress={retry}
          >
            <ArrowsRotateRight
              aria-hidden="true"
              className={refreshing ? "size-4 animate-spin" : "size-4"}
            />
          </Button>
          <Tooltip.Content showArrow placement="bottom">
            <Tooltip.Arrow />
            <Typography type="body-xs">
              {lastUpdatedAt == null
                ? achievementCopy(locale, "achievements.ui.lastUpdatedNone")
                : formatMessage(
                    achievementCopy(locale, "achievements.ui.lastUpdated"),
                    locale,
                    { time: formatDateTime(new Date(lastUpdatedAt)) },
                  )}
            </Typography>
          </Tooltip.Content>
        </Tooltip>
      </header>

      {state.status === "loading" && !payload ? <AchievementsSkeleton /> : null}

      {state.status === "error" && !payload ? (
        <SectionError
          message={`${achievementCopy(locale, "achievements.ui.loadError")}${error ? ` (${error})` : ""}`}
          retry={retry}
          retryLabel={achievementCopy(locale, "achievements.ui.retry")}
        />
      ) : null}

      {payload ? (
        <AchievementsBody locale={locale} newIds={newIds} payload={payload} />
      ) : null}

      {/* A failed refresh keeps the grid: the stale note sits under it. */}
      {state.status === "error" && payload ? (
        <SectionError
          message={achievementCopy(locale, "achievements.ui.loadError")}
          retry={retry}
          retryLabel={achievementCopy(locale, "achievements.ui.retry")}
        />
      ) : null}

      {state.status === "ready" && !payload ? (
        <Skeleton className="h-40 w-full" />
      ) : null}
    </main>
  );
}
