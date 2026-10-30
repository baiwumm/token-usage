"use client";

// Wrapped (annual review) at /wrapped — year totals, monthly trend and the
// sources/models breakdown. The share card is the dashboard's dialog, opened
// from the header button. Data comes from the frozen Dashboard-face endpoints
// (dashboard payload + account-monthly + account-heatmap for the card's
// strips).
//
// The page is split by concern: wrapped-header.tsx (year select + share
// button), share-input.ts (the card payload projection),
// stat-cards.tsx, monthly-card.tsx, sources-card.tsx and models-table.tsx
// render the blocks; wrapped-skeleton.tsx is the first load.

import type { TrendPoint } from "@/components/charts";

import { Button, Card, Typography } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ModelsTable } from "./models-table";
import { MonthlyCard } from "./monthly-card";
import { buildShareInput } from "./share-input";
import { SourcesCard } from "./sources-card";
import { StatCards } from "./stat-cards";
import { WrappedHeader } from "./wrapped-header";
import { WrappedSkeleton } from "./wrapped-skeleton";

import { useProfile } from "@/lib/auth/profile";
import {
  ALL_RANGE_START,
  browserTimezone,
  dayKeyInTz,
  yearRange,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";
import {
  DashboardApiError,
  fetchDashboard,
  fetchHeatmap,
  fetchMonthly,
  type DashboardPayload,
  type HeatmapPayload,
  type MonthlyPoint,
} from "@/lib/dashboard/api";
import { useLocale } from "@/lib/copy/locale";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { WRAPPED_COPY } from "@/lib/copy/wrapped";

type LoadStatus = "loading" | "ready" | "error";

// The dashboard's default timezone view: the browser zone, not UTC — the
// year boundary must match the tz the rest of the app buckets by.
function currentYear(): number {
  return Number(dayKeyInTz(new Date(), browserTimezone()).slice(0, 4));
}

const MONTHS_PER_YEAR = 12;

// One entry per month of the review: a closed year shows all twelve, the
// running year stops at the current month so the axis carries no future void.
function monthsOfYear(year: number, timeZone: string): string[] {
  const currentMonth = dayKeyInTz(new Date(), timeZone).slice(0, 7);

  return Array.from(
    { length: MONTHS_PER_YEAR },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  ).filter((month) => month <= currentMonth);
}

export function WrappedClient() {
  const [locale] = useLocale();
  const copy = WRAPPED_COPY[locale];
  const { formatTokens, formatCost, formatNumber, formatMonth, formatPercent } =
    useFormat();
  const { profile } = useProfile();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [heatmap, setHeatmap] = useState<HeatmapPayload | null>(null);
  const [year, setYear] = useState(currentYear);
  // Years that actually carry usage, newest first — the select only offers
  // these (operator call 2026-10-28).
  const [historyYears, setHistoryYears] = useState<number[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Run id: switching years starts a new load while the old one may still be
  // in flight; a superseded response must never overwrite the newer year.
  const loadSeq = useRef(0);
  // Whether any payload has landed — a failed refresh keeps the previous
  // year's content on screen; only an empty slot falls to the error state.
  const hasPayload = useRef(false);
  // Set once the operator picks a year, so the auto-jump to the newest year
  // with data never overrides a deliberate choice.
  const yearChosen = useRef(false);

  const { accessToken, redirectToLogin } = useSessionBootstrap("/wrapped");
  const timezone = browserTimezone();

  const loadAll = useCallback(
    async (token: string) => {
      const seq = ++loadSeq.current;

      setLoadError(null);
      setRefreshing(true);

      try {
        const tzRange = yearRange(year, timezone);
        // The card's heatmap covers the review year: a past year ends Dec 31,
        // the running year ends today in the page timezone.
        const heatmapToDay =
          year === currentYear()
            ? dayKeyInTz(new Date(), timezone)
            : `${year}-12-31`;
        // A heatmap failure must not sink the whole review — the share panel
        // degrades to the heatmap-less variants instead.
        const [nextPayload, nextHistory, nextHeatmap] = await Promise.all([
          fetchDashboard(token, {
            fromIso: tzRange.fromIso,
            toIso: tzRange.toIso,
            rangeKey: "custom",
            // Same zone the year window is cut in — the payload's daily rows
            // (peak day) bucket by the requested tz too.
            tz: timezone,
          }),
          // All-history months: drives both the year selector (months come
          // back only when they carry rows) and the selected year's series.
          fetchMonthly(token, {
            fromDay: ALL_RANGE_START,
            toDay: dayKeyInTz(new Date(), timezone),
          }),
          fetchHeatmap(token, {
            weeks: 52,
            toDay: heatmapToDay,
            tz: timezone,
          }).catch(() => null),
        ]);

        if (loadSeq.current !== seq) return;
        setPayload(nextPayload);
        setHeatmap(nextHeatmap);
        setHistoryYears(
          Array.from(
            new Set(
              nextHistory.data.map((point) => Number(point.month.slice(0, 4))),
            ),
          )
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a),
        );
        setMonthly(
          nextHistory.data.filter((point) =>
            point.month.startsWith(`${year}-`),
          ),
        );
        hasPayload.current = true;
        setStatus("ready");
      } catch (error) {
        if (loadSeq.current !== seq) return;
        if (error instanceof DashboardApiError && error.status === 401) {
          redirectToLogin();

          return;
        }
        setLoadError(error instanceof Error ? error.message : "error");
        setStatus(hasPayload.current ? "ready" : "error");
      } finally {
        if (loadSeq.current === seq) setRefreshing(false);
      }
    },
    [timezone, year, redirectToLogin],
  );

  useEffect(() => {
    if (accessToken) void loadAll(accessToken);
  }, [accessToken, loadAll]);

  // While the first load runs the current year keeps the select populated.
  const yearOptions = useMemo(
    () => (historyYears.length > 0 ? historyYears : [year]),
    [historyYears, year],
  );

  // A running year without usage (January before the first sync) would land
  // on the empty card; jump to the newest year that has data once the list
  // arrives, unless the operator already picked a year.
  useEffect(() => {
    if (yearChosen.current || historyYears.length === 0) return;
    if (historyYears.includes(year)) return;
    setYear(historyYears[0]);
  }, [historyYears, year]);

  const totals = payload?.totals;
  const hasData = (totals?.total_tokens ?? 0) > 0;
  const models = payload?.models ?? [];
  const sources = payload?.sources ?? [];

  // Month buckets are UTC-fixed (docs/cli-contract.md §2.7) while the totals
  // above ride the browser tz; only rows near a year boundary can differ.
  const trendData = useMemo<TrendPoint[]>(() => {
    const byMonth = new Map(monthly.map((point) => [point.month, point]));

    return monthsOfYear(year, timezone).map((month) => {
      const point = byMonth.get(month);

      return {
        key: month,
        label: formatMonth(month),
        tokens: point?.total_tokens ?? 0,
        cost: point?.total_cost_usd ?? 0,
        conversations: point?.conversation_count ?? 0,
        input: point?.input_tokens ?? 0,
        // Same merge as the dashboard: cache read + cache write stack
        // together so the composition sums to the token total.
        cached:
          (point?.cached_input_tokens ?? 0) +
          (point?.cache_creation_input_tokens ?? 0),
        output: point?.output_tokens ?? 0,
      };
    });
  }, [formatMonth, monthly, timezone, year]);

  const totalTokens = totals?.total_tokens ?? 0;

  const shareInput = useMemo(
    () =>
      buildShareInput({
        formatCost,
        formatNumber,
        formatPercent,
        formatTokens,
        heatmap,
        locale,
        payload,
        profile,
        year,
      }),
    [
      formatCost,
      formatNumber,
      formatPercent,
      formatTokens,
      heatmap,
      locale,
      payload,
      profile,
      year,
    ],
  );

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <WrappedHeader
        copy={copy}
        refreshing={refreshing}
        shareInput={hasData ? shareInput : null}
        year={year}
        yearOptions={yearOptions}
        onYearChange={(next) => {
          yearChosen.current = true;
          setYear(next);
        }}
      />

      {status === "loading" ? <WrappedSkeleton /> : null}

      {status === "error" ? (
        <Card className="flex-col gap-3 p-6">
          <Typography className="text-danger" type="body-sm">
            {copy.loadError}
            {loadError ? ` (${loadError})` : ""}
          </Typography>
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              if (accessToken) void loadAll(accessToken);
            }}
          >
            {copy.retry}
          </Button>
        </Card>
      ) : null}

      {status === "ready" && !hasData ? (
        <Card className="p-10">
          <Card.Header>
            <Card.Title>{`${year} · ${copy.emptyTitle}`}</Card.Title>
            <Card.Description>{copy.emptyBody}</Card.Description>
          </Card.Header>
        </Card>
      ) : null}

      {status === "ready" && hasData && totals ? (
        <>
          <StatCards copy={copy} totals={totals} />

          <MonthlyCard copy={copy} data={trendData} year={year} />

          {sources.length > 0 ? (
            <SourcesCard
              copy={copy}
              sources={sources}
              totalTokens={totalTokens}
            />
          ) : null}

          <ModelsTable
            copy={copy}
            models={models}
            refreshing={refreshing}
            totalTokens={totalTokens}
          />
        </>
      ) : null}
    </main>
  );
}
