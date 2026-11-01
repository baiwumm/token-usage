"use client";

// Dashboard at / (docs/ui-spec.md 仪表盘, M5.5 official core). Data comes from
// the frozen Dashboard-face contract endpoints with the browser session JWT
// (dual principal, §1.4) — never a browser→Supabase table connection. Filters
// live in the URL; changing them refetches data in place: cards keep their
// previous content under a blurred spinner overlay instead of collapsing into
// a full-page skeleton.
//
// Composition: this file owns auth bootstrap, the seven load slots, URL filter
// state and every handler; filter-bar.tsx renders the controls, dashboard-body
// .tsx the card stack, and the section files own one slot each.

import type { DetailRow, DetailView } from "./detail-table";
import type { Filters } from "./filters";
import type { TrendMode } from "./trend-panel";
import type { AchievementsPayload } from "@/lib/achievements/types";

import { toast } from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";

import { CostAnalysisModal } from "./cost-modal";
import { DashboardBody } from "./dashboard-body";
import { DashboardFilterBar } from "./filter-bar";
import { buildDetailRows } from "./detail-rows";
import { peakDay } from "./aggregate";
import {
  dashboardFilterCacheKey,
  dashboardUserCacheKey,
  readDashboardCache,
  writeDashboardCache,
  type DashboardPayloads,
} from "./dashboard-data-cache";
import { parseFilters, serializeFilters } from "./filters";
import { buildShareInput } from "./share-input";

import { useProfile } from "@/lib/auth/profile";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import {
  fetchAchievementsShared,
  isUnauthorized as isAchievementsUnauthorized,
} from "@/lib/achievements/api";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import {
  DashboardApiError,
  fetchDaily,
  fetchDashboard,
  fetchDataVersion,
  fetchHeatmap,
  fetchHourly,
  fetchModelBreakdown,
  fetchMonthly,
  fetchSummary,
  type AccountSummary,
  type DashboardPayload,
  type HeatmapPayload,
  type HourlyPoint,
  type ModelBreakdownSource,
  type MonthlyPoint,
  type SeriesPoint,
} from "@/lib/dashboard/api";
import {
  browserTimezone,
  dayKeyInTz,
  rangeForSelection,
  tzLabel,
} from "@/lib/dashboard/ranges";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { useFormat } from "@/lib/format/format";
import { loadable, type Loadable } from "@/lib/loadable";
import { useBudgetStore } from "@/stores/budget-store";
import { useRefreshPreferencesStore } from "@/stores/refresh-preferences-store";

const AUTO_REFRESH_COOLDOWN_MS = 60_000;

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

export function DashboardClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];
  const {
    formatDate,
    formatMonth,
    formatNumber,
    formatTokens,
    formatCost,
    formatPercent,
  } = useFormat();
  const { profile } = useProfile();

  const refreshOnVisible = useRefreshPreferencesStore(
    (state) => state.refreshOnVisible,
  );
  const refreshIntervalMinutes = useRefreshPreferencesStore(
    (state) => state.intervalMinutes,
  );

  const { accessToken, redirectToLogin } = useSessionBootstrap("/");

  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/",
    parse: parseFilters,
    serialize: serializeFilters,
  });

  const [summaryState, setSummaryState] =
    useState<Loadable<AccountSummary>>(loadable);
  const [dashboardState, setDashboardState] =
    useState<Loadable<DashboardPayload>>(loadable);
  const [dailyState, setDailyState] =
    useState<Loadable<SeriesPoint[]>>(loadable);
  const [monthlyState, setMonthlyState] =
    useState<Loadable<MonthlyPoint[]>>(loadable);
  const [heatmapState, setHeatmapState] =
    useState<Loadable<HeatmapPayload>>(loadable);
  const [breakdownState, setBreakdownState] =
    useState<Loadable<ModelBreakdownSource[]>>(loadable);
  const [hourlyState, setHourlyState] =
    useState<Loadable<HourlyPoint[]>>(loadable);
  const [achievementState, setAchievementState] =
    useState<Loadable<AchievementsPayload>>(loadable);

  const [refreshing, setRefreshing] = useState(false);
  const [hourlyRefreshing, setHourlyRefreshing] = useState(false);
  const [trendMode, setTrendMode] = useState<TrendMode>("daily");
  const [detailView, setDetailView] = useState<DetailView>("daily");
  const [hourlyDay, setHourlyDay] = useState("");
  const [hourlyRefresh, setHourlyRefresh] = useState(0);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const [costOpen, setCostOpen] = useState(false);

  const timezone = filters.tz || browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );
  const rangePickerMax = useMemo(
    () => parseDate(dayKeyInTz(new Date(), timezone)),
    [timezone],
  );

  useEffect(() => {
    setTrendMode(filters.range === "all" ? "monthly" : "daily");
  }, [filters.range]);

  useEffect(() => {
    setHourlyDay("");
  }, [timezone]);

  // Run id for loadAll: switching range/filters starts a new run while the
  // old one may still be in flight; late responses of a superseded run must
  // never overwrite the newer run's state.
  const loadSeq = useRef(0);
  // Start time of the latest run — the visibility-refresh cooldown baseline.
  const lastAttemptAt = useRef(0);
  // Consumed by the hourly fetch: auto refreshes skip its panel overlay.
  const hourlySilentRef = useRef(false);

  const loadAll = useCallback(
    async (token: string, options?: { silent?: boolean; force?: boolean }) => {
      // Keep the previous payloads mounted: only show the initial-load
      // skeleton; refreshes overlay the existing cards instead. Each slot
      // settles into place as its own response arrives, so one slow request
      // (the heatmap's 52 weeks) no longer holds the other cards back.
      // Silent runs (timer / visibility) update in place without the blur.
      const silent = options?.silent === true;

      if (!silent) setRefreshing(true);
      lastAttemptAt.current = Date.now();
      const seq = ++loadSeq.current;

      // Data-version gate (2026-11-01 operator plan): one cheap version read
      // replaces the seven heavy fetches whenever no non-empty sync run has
      // landed since the cached load. Manual refresh forces past the gate
      // (covers the reconcile/replay blind spot); every gate failure fails
      // open into the normal fetches.
      const userKey = dashboardUserCacheKey(token);
      const filterKey = dashboardFilterCacheKey(filters, timezone);
      const beforeVersion = await fetchDataVersion().catch(() => null);

      if (loadSeq.current !== seq) return;

      if (!options?.force && beforeVersion != null) {
        const cached = readDashboardCache(userKey, filterKey, beforeVersion);

        if (cached) {
          setSummaryState({ status: "ready", data: cached.summary });
          setDashboardState({ status: "ready", data: cached.dashboard });
          setDailyState({ status: "ready", data: cached.daily });
          setMonthlyState({ status: "ready", data: cached.monthly });
          setHeatmapState({ status: "ready", data: cached.heatmap });
          setBreakdownState({ status: "ready", data: cached.breakdown });
          setAchievementState({ status: "ready", data: cached.achievements });
          setRefreshing(false);
          setLastUpdatedAt(Date.now());

          return;
        }
      }

      let pending = 7;
      let succeeded = 0;
      let redirected = false;
      const collected = {} as Partial<DashboardPayloads>;

      const finishOne = () => {
        if (loadSeq.current !== seq) return;
        if (--pending > 0) return;
        // Always clear: a silent run may supersede an interrupted manual one.
        setRefreshing(false);
        if (succeeded > 0) setLastUpdatedAt(Date.now());
        // A fully successful load is cacheable — but only when the change
        // signal did not move while the fetches ran; otherwise the payloads
        // are a pre/post-sync mix and must not be labelled with either.
        if (succeeded < 7) return;
        void (async () => {
          const afterVersion = await fetchDataVersion().catch(() => null);

          if (
            loadSeq.current === seq &&
            afterVersion != null &&
            afterVersion === beforeVersion
          ) {
            writeDashboardCache(
              userKey,
              filterKey,
              afterVersion,
              collected as DashboardPayloads,
            );
          }
        })();
      };

      const slot = <T,>(
        request: Promise<T>,
        setState: Dispatch<SetStateAction<Loadable<T>>>,
        select: (value: T) => T = (value) => value,
        stash?: (value: T) => void,
      ) => {
        void request.then(
          (value) => {
            if (loadSeq.current !== seq) return;
            const selected = select(value);

            stash?.(selected);
            succeeded += 1;
            setState({ status: "ready", data: selected });
            finishOne();
          },
          (reason: unknown) => {
            if (loadSeq.current !== seq) return;
            if (isUnauthorized(reason)) {
              if (!redirected) {
                redirected = true;
                redirectToLogin();
              }
            } else {
              // A failed refresh keeps the previous data on screen; only an
              // empty slot (no data yet) falls through to the error state.
              setState((previous) =>
                previous.data != null
                  ? previous
                  : { status: "error", data: null },
              );
            }
            finishOne();
          },
        );
      };

      slot(
        fetchSummary(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
        setSummaryState,
        undefined,
        (value) => {
          collected.summary = value;
        },
      );
      slot(
        fetchDashboard(token, {
          fromIso: range.fromIso,
          toIso: range.toIso,
          tz: timezone,
          rangeKey: filters.range,
        }),
        setDashboardState,
        undefined,
        (value) => {
          collected.dashboard = value;
        },
      );
      slot(
        fetchDaily(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }).then((point) => point.data),
        setDailyState,
        undefined,
        (value) => {
          collected.daily = value;
        },
      );
      slot(
        fetchMonthly(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          deviceId: filters.deviceId || null,
        }).then((point) => point.data),
        setMonthlyState,
        undefined,
        (value) => {
          collected.monthly = value;
        },
      );
      slot(
        fetchHeatmap(token, {
          weeks: 52,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
        setHeatmapState,
        undefined,
        (value) => {
          collected.heatmap = value;
        },
      );
      slot(
        fetchModelBreakdown(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }).then((payload) => payload.sources),
        setBreakdownState,
        undefined,
        (value) => {
          collected.breakdown = value;
        },
      );
      // Cookie-authenticated like /achievements itself (no bearer header).
      // The shared fetch reuses the unlock watcher's in-flight request when
      // both ask for the same timezone.
      slot(
        fetchAchievementsShared({ tz: timezone }).catch((cause: unknown) => {
          throw isAchievementsUnauthorized(cause)
            ? new DashboardApiError("unauthorized", 401)
            : cause;
        }),
        setAchievementState,
        undefined,
        (value) => {
          collected.achievements = value;
        },
      );
    },
    [
      filters.deviceId,
      filters.from,
      filters.range,
      filters.to,
      range.fromDay,
      range.fromIso,
      range.toDay,
      range.toIso,
      redirectToLogin,
      timezone,
    ],
  );

  useEffect(() => {
    if (accessToken) void loadAll(accessToken);
  }, [accessToken, loadAll]);

  // Bumps the hourly fetch; `silent` keeps auto refreshes overlay-free.
  const refreshHourly = useCallback((silent: boolean) => {
    hourlySilentRef.current = silent;
    setHourlyRefresh((value) => value + 1);
  }, []);

  // Auto refresh is opt-in (settings → data refresh); the manual button is the
  // baseline. Both triggers share one cooldown so quick tab round-trips do not
  // refetch, and scheduled runs stay silent — no blur overlay.
  useEffect(() => {
    if (!accessToken) return;
    if (!refreshOnVisible && refreshIntervalMinutes <= 0) return;

    let timer: number | undefined;

    const autoRefresh = () => {
      if (Date.now() - lastAttemptAt.current < AUTO_REFRESH_COOLDOWN_MS) {
        return;
      }
      void loadAll(accessToken, { silent: true });
      if (detailView === "hourly") refreshHourly(true);
    };

    const startTimer = () => {
      window.clearInterval(timer);
      if (refreshIntervalMinutes <= 0) return;
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") autoRefresh();
      }, refreshIntervalMinutes * 60_000);
    };
    const onVisibility = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshOnVisible) autoRefresh();
      startTimer();
    };

    startTimer();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [
    accessToken,
    detailView,
    loadAll,
    refreshHourly,
    refreshIntervalMinutes,
    refreshOnVisible,
  ]);

  const effectiveHourlyDay = hourlyDay || dayKeyInTz(new Date(), timezone);

  useEffect(() => {
    if (!accessToken || detailView !== "hourly") return;

    let cancelled = false;
    // Consume the one-shot flag: dependency-driven runs (day switch, timezone)
    // still show the panel spinner.
    const silent = hourlySilentRef.current;

    hourlySilentRef.current = false;
    if (!silent) setHourlyRefreshing(true);
    void fetchHourly(accessToken, {
      day: effectiveHourlyDay,
      tz: timezone,
      deviceId: filters.deviceId || null,
    })
      .then((result) => {
        if (!cancelled) {
          setHourlyState({ status: "ready", data: result.data });
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (isUnauthorized(error)) {
          redirectToLogin();

          return;
        }
        setHourlyState((previous) =>
          previous.data != null ? previous : { status: "error", data: null },
        );
      })
      .finally(() => {
        if (!cancelled && !silent) setHourlyRefreshing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    accessToken,
    detailView,
    effectiveHourlyDay,
    filters.deviceId,
    hourlyRefresh,
    redirectToLogin,
    timezone,
  ]);

  const summary = summaryState.data;
  const dashboard = dashboardState.data;
  // Stable fallback arrays: memoized children (TopModels, CostAnalysisModal,
  // charts) keep their memo hits across refresh renders instead of seeing a
  // fresh [] identity each time.
  const daily = useMemo(() => dailyState.data ?? [], [dailyState.data]);
  const monthly = useMemo(() => monthlyState.data ?? [], [monthlyState.data]);
  const breakdown = useMemo(
    () => breakdownState.data ?? [],
    [breakdownState.data],
  );
  // Hero KPI: the highest-usage day of the window (all-time peak under the
  // default 总计 range). Read from the already-fetched daily series.
  const peak = useMemo(() => peakDay(daily), [daily]);
  const heatmap = heatmapState.data;
  const activeDevices = useMemo(
    () => dashboard?.devices.filter((device) => device.active) ?? [],
    [dashboard],
  );

  // Monthly budget (D5): compare the current UTC month's cost (monthly
  // buckets are UTC-fixed, §2.7) against the preference from settings; the
  // hero cost line turns danger and a toast fires once per crossing.
  const monthlyBudgetUsd = useBudgetStore((state) => state.monthlyBudgetUsd);
  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const monthCostUsd = useMemo(
    () =>
      monthly.find((point) => point.month === currentMonthKey)
        ?.total_cost_usd ?? 0,
    [currentMonthKey, monthly],
  );
  const budgetExceeded =
    monthlyBudgetUsd > 0 && monthCostUsd > monthlyBudgetUsd;
  const budgetWarnedRef = useRef(false);

  useEffect(() => {
    if (!budgetExceeded) {
      budgetWarnedRef.current = false;

      return;
    }
    if (budgetWarnedRef.current) return;
    budgetWarnedRef.current = true;
    toast(
      formatMessage(copy.budget.exceeded, locale, {
        budget: formatCost(monthlyBudgetUsd),
        spent: formatCost(monthCostUsd),
      }),
    );
  }, [
    budgetExceeded,
    copy,
    formatCost,
    locale,
    monthCostUsd,
    monthlyBudgetUsd,
  ]);

  const hasData = (summary?.totals.total_tokens ?? 0) > 0;
  const hasFilters =
    filters.deviceId !== "" ||
    filters.range !== "all" ||
    filters.tz !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  const detailRows = useMemo<DetailRow[]>(
    () =>
      buildDetailRows({
        daily,
        detailView,
        formatDate,
        formatMonth,
        hourly: hourlyState.data,
        monthly,
      }),
    [daily, detailView, formatDate, formatMonth, hourlyState.data, monthly],
  );

  const retryAll = () => {
    if (!accessToken) return;

    // Manual refresh forces past the data-version gate: it is also the
    // escape hatch for changes the run table cannot see (reconcile, replays).
    void loadAll(accessToken, { force: true });
    // loadAll never touches the hourly slot; the visible hourly tab must not
    // look stale after a manual refresh.
    if (detailView === "hourly") refreshHourly(false);
  };

  // The detail card retries only the slot it shows: hourly has its own fetch,
  // daily/monthly ride along with loadAll.
  const retryDetail = useCallback(() => {
    if (detailView === "hourly") {
      refreshHourly(false);

      return;
    }
    if (accessToken) void loadAll(accessToken);
  }, [accessToken, detailView, loadAll, refreshHourly]);

  const openCostModal = useCallback(() => setCostOpen(true), []);

  // Heatmap cell → sessions for that exact day (D1). Sessions reads from/to
  // once as an initial window; its own filter edits never round-trip them.
  const openSessionsForDay = useCallback(
    (day: string) => {
      router.push(`/sessions?from=${day}&to=${day}`);
    },
    [router],
  );

  // Trend click pins the hourly table to the clicked day.
  const openHourlyForDay = useCallback((day: string) => {
    setHourlyDay(day);
    setDetailView("hourly");
  }, []);

  const detailState =
    detailView === "hourly"
      ? hourlyState
      : detailView === "monthly"
        ? monthlyState
        : dailyState;

  const shareInput = useMemo(
    () =>
      buildShareInput({
        breakdown,
        formatCost,
        formatDate,
        formatNumber,
        formatPercent,
        formatTokens,
        heatmap,
        locale,
        profile,
        range,
        summary: summary ?? null,
        timezone,
        tzLabel,
      }),
    [
      breakdown,
      formatCost,
      formatDate,
      formatNumber,
      formatPercent,
      formatTokens,
      heatmap,
      locale,
      profile,
      range,
      summary,
      timezone,
    ],
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <DashboardFilterBar
        activeDevices={activeDevices}
        copy={copy}
        devicesLoading={dashboardState.status === "loading"}
        filters={filters}
        hasFilters={hasFilters}
        lastUpdatedAt={lastUpdatedAt}
        locale={locale}
        range={range}
        rangePickerMax={rangePickerMax}
        refreshing={refreshing}
        shareInput={shareInput}
        onApply={applyFilters}
        onRefresh={retryAll}
      />

      <DashboardBody
        achievements={achievementState.data}
        achievementsStatus={achievementState.status}
        breakdown={breakdown}
        breakdownStatus={breakdownState.status}
        budgetExceeded={budgetExceeded}
        copy={copy}
        daily={daily}
        dailyStatus={dailyState.status}
        dashboard={dashboard}
        dashboardStatus={dashboardState.status}
        detailDay={effectiveHourlyDay}
        detailRows={detailRows}
        detailStatus={detailState.status}
        detailView={detailView}
        hasData={hasData}
        hasFilters={hasFilters}
        heatmap={heatmap}
        heatmapStatus={heatmapState.status}
        hourlyRefreshing={hourlyRefreshing}
        locale={locale}
        monthly={monthly}
        monthlyStatus={monthlyState.status}
        peakDay={peak}
        range={range}
        rangePickerMax={rangePickerMax}
        refreshing={refreshing}
        selectedDeviceId={filters.deviceId}
        summary={summary}
        summaryStatus={summaryState.status}
        timezone={timezone}
        trendMode={trendMode}
        trendSelectedDay={hourlyDay}
        onClearFilters={() =>
          applyFilters({
            range: "all",
            from: "",
            to: "",
            tz: "",
            deviceId: "",
          })
        }
        onDaySelect={openSessionsForDay}
        onDetailRetry={retryDetail}
        onDetailViewChange={setDetailView}
        onDeviceSelect={(deviceId) =>
          applyFilters({ deviceId: deviceId ?? "" })
        }
        onHourlyDayChange={setHourlyDay}
        onRetry={retryAll}
        onTrendDaySelect={openHourlyForDay}
        onTrendModeChange={setTrendMode}
        onViewAll={openCostModal}
      />

      <CostAnalysisModal
        copy={copy}
        daily={daily}
        open={costOpen}
        sources={breakdown}
        totalCostUsd={Number(summary?.totals.total_cost_usd ?? 0)}
        onOpenChange={setCostOpen}
      />
    </main>
  );
}
