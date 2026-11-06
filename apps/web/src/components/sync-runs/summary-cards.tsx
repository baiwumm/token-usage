"use client";

// Summary row for /sync-runs (docs/cli-contract.md §2.12): today's run count and
// the last run timestamp. First load keeps the card shells and skeletons only
// the two text lines, matching /sessions.

import type { SyncRunsCopy } from "@/lib/copy/sync-runs";
import type { SyncRunsPayload } from "@/lib/dashboard/api";

import { Clock, ClockArrowRotateLeft } from "@gravity-ui/icons";

import {
  SummaryCards as SummaryCardRow,
  SummaryCardsSkeleton as SummaryCardRowSkeleton,
} from "@/components/summary-card";
import { formatMessage } from "@/lib/copy/message";
import { useLocale } from "@/lib/copy/locale";
import { useFormat } from "@/lib/format/format";

export function SummaryCards({
  todayRuns,
  lastRunAt,
  copy,
}: {
  todayRuns: SyncRunsPayload | null;
  lastRunAt: string | null;
  copy: SyncRunsCopy;
}) {
  const { formatDateTime, formatNumber, formatRelativeTime } = useFormat();
  const [locale] = useLocale();
  const emptyRuns = todayRuns?.totals.empty_runs ?? 0;
  const cards = [
    {
      key: "today",
      label: copy.cards.todayRuns,
      icon: ClockArrowRotateLeft,
      value: formatNumber(todayRuns?.totals.runs ?? 0),
      sub:
        todayRuns && emptyRuns > 0
          ? formatMessage(copy.cards.todayEmptyHint, locale, {
              count: emptyRuns,
            })
          : undefined,
    },
    {
      key: "last",
      label: copy.cards.lastRun,
      icon: Clock,
      value: lastRunAt ? formatDateTime(lastRunAt) : copy.cards.emptyValue,
      sub: lastRunAt ? formatRelativeTime(lastRunAt) : undefined,
    },
  ];

  return (
    <SummaryCardRow
      cards={cards}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      contentClassName="gap-1"
    />
  );
}

// First-load placeholder for the summary row: the card shells (label + icon)
// are real, only the two text lines inside are skeletons — the two cards must
// not flash as one grey block before the payload lands (same rule as
// /sessions). Both lines are placeholder-ed even though the real caption is
// conditional (empty-run hint / relative time), so the row keeps its height
// instead of growing once the payload arrives.
export function SummaryCardsSkeleton({ copy }: { copy: SyncRunsCopy }) {
  const cards = [
    {
      key: "today",
      label: copy.cards.todayRuns,
      icon: ClockArrowRotateLeft,
      valueWidth: "w-20",
      captionWidth: "w-20",
    },
    {
      key: "last",
      label: copy.cards.lastRun,
      icon: Clock,
      valueWidth: "w-40",
      captionWidth: "w-16",
    },
  ];

  return (
    <SummaryCardRowSkeleton
      cards={cards}
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
      contentClassName="gap-2"
    />
  );
}
