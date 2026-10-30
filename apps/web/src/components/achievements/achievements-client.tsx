"use client";

// /achievements — read-time achievements (docs/achievements-plan.md §3, P2).
// Everything is derived from the payload; the page adds only the refresh
// affordance, the loading/error states and the "new" badge bookkeeping.
//
// New badges: the account's seen watermark lives on the server
// (token_achievement_seen), so the badges follow the account across devices.
// The watermark is advanced after the grid renders — writing it earlier would
// clear the badges of the visit that is currently on screen.

import { ArrowsRotateRight } from "@gravity-ui/icons";
import { Button, Skeleton, Tooltip, Typography, toast } from "@heroui/react";
import { useCallback, useEffect, useMemo } from "react";

import { AchievementsBody } from "./achievements-body";
import { AchievementsSkeleton } from "./achievements-skeleton";
import { useAchievements } from "./use-achievements";

import { markAchievementsSeen } from "@/lib/achievements/api";
import { maxAchievedDay, unlocksSince } from "@/lib/achievements/highlights";
import { achievementCopy } from "@/lib/copy/achievements";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone, dayKeyInTz } from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";
import { SectionError } from "@/components/section-states";

export function AchievementsClient() {
  const [locale] = useLocale();
  const { formatDateTime } = useFormat();
  const { state, error, refreshing, lastUpdatedAt, refresh } =
    useAchievements();

  const payload = state.data;

  const newIds = useMemo(() => {
    if (!payload) return new Set<string>();

    return new Set(
      unlocksSince(payload.achievements, payload.seen_through).map(
        (entry) => entry.id,
      ),
    );
  }, [payload]);

  // First visit (no watermark yet) records a baseline without marking the back
  // catalogue as new; later visits advance the watermark past what was shown.
  useEffect(() => {
    if (!payload) return;

    const marker =
      maxAchievedDay(payload.achievements) ??
      dayKeyInTz(new Date(), browserTimezone());

    if (payload.seen_through !== null && marker <= payload.seen_through) return;

    void markAchievementsSeen(marker);
  }, [payload]);

  // Manual reloads report back twice: a loading toast the moment the button is
  // pressed, then the same toast flips to the result. The spinner alone is easy
  // to miss on a fast response, and a failed refresh otherwise only leaves a
  // note below the grid.
  const retry = useCallback(() => {
    const toastId = toast(
      achievementCopy(locale, "achievements.ui.refreshPending"),
      {
        isLoading: true,
        timeout: 0,
      },
    );

    void refresh().then((outcome) => {
      if (outcome.status === "ok") {
        toast.update(
          toastId,
          achievementCopy(locale, "achievements.ui.refreshSuccess"),
          { isLoading: false, timeout: 3000, variant: "success" },
        );
      } else if (outcome.status === "error") {
        toast.update(
          toastId,
          `${achievementCopy(locale, "achievements.ui.loadError")}${
            outcome.message ? ` (${outcome.message})` : ""
          }`,
          { isLoading: false, timeout: 5000, variant: "danger" },
        );
      } else {
        // Unauthorized (redirecting) or no session yet: drop the toast.
        toast.close(toastId);
      }
    });
  }, [locale, refresh]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-end gap-3">
        <Tooltip delay={0}>
          <Button
            isIconOnly
            aria-busy={refreshing}
            aria-label={achievementCopy(locale, "achievements.ui.refresh")}
            isDisabled={refreshing}
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
