"use client";

// Dashboard achievements slot: the section card around the strip, with the
// shared loading / error states. An account with no measurable usage hides the
// whole card instead of rendering an empty shell.

import type { AchievementsPayload } from "@/lib/achievements/types";
import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { Locale } from "@/lib/copy/locale-config";
import type { LoadStatus } from "@/lib/loadable";

import { Button, Card } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { PanelOverlay } from "./panel-overlay";
import { AchievementStrip } from "./achievement-strip";

import { AchievementDetail } from "@/components/achievements/achievement-detail";
import { SectionError, SectionSkeleton } from "@/components/section-states";
import { nearestUnlocks, recentUnlocks } from "@/lib/achievements/highlights";
import { useProfile } from "@/lib/auth/profile";

const GROUP_LIMIT = 5;

export function AchievementStripSection({
  copy,
  locale,
  payload,
  refreshing,
  status,
  onRetry,
}: {
  copy: DashboardCopy;
  locale: Locale;
  payload: AchievementsPayload | null;
  refreshing: boolean;
  status: LoadStatus;
  onRetry: () => void;
}) {
  const router = useRouter();
  const { profile } = useProfile();
  const [selected, setSelected] = useState<
    AchievementsPayload["achievements"][number] | null
  >(null);
  const [open, setOpen] = useState(false);
  const recent = useMemo(
    () => (payload ? recentUnlocks(payload.achievements, GROUP_LIMIT) : []),
    [payload],
  );
  const nearest = useMemo(
    () => (payload ? nearestUnlocks(payload.achievements, GROUP_LIMIT) : []),
    [payload],
  );
  const hasAny = useMemo(
    () => payload?.achievements.some((row) => row.value > 0) ?? false,
    [payload],
  );

  if (payload && (!hasAny || (!recent.length && !nearest.length))) {
    return null;
  }

  return (
    <Card className="relative p-6">
      <PanelOverlay active={refreshing} />
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Card.Title>{copy.achievements.title}</Card.Title>
          <Card.Description>{copy.achievements.hint}</Card.Description>
        </div>
        <Button
          size="sm"
          variant="tertiary"
          onPress={() => router.push("/achievements")}
        >
          {copy.achievements.viewAll}
        </Button>
      </Card.Header>
      <Card.Content>
        {payload ? (
          <AchievementStrip
            locale={locale}
            nearest={nearest}
            nearestTitle={copy.achievements.nearest}
            recent={recent}
            recentTitle={copy.achievements.recent}
            onOpen={(id) => {
              const entry = payload.achievements.find((item) => item.id === id);

              if (!entry) return;
              setSelected(entry);
              setOpen(true);
            }}
          />
        ) : status === "loading" ? (
          <SectionSkeleton className="h-28 w-full" />
        ) : (
          <SectionError
            message={copy.states.loadError}
            retry={onRetry}
            retryLabel={copy.states.retry}
          />
        )}
      </Card.Content>
      <AchievementDetail
        handle={profile?.displayName || profile?.email || "Token Usage"}
        locale={locale}
        open={open}
        progress={selected}
        onOpenChange={setOpen}
      />
    </Card>
  );
}
