"use client";

// Dashboard at / (docs/ui-spec.md 仪表盘, M5.5 official core). Data comes from
// the frozen Dashboard-face contract endpoints with the browser session JWT
// (dual principal, §1.4) — never a browser→Supabase table connection. Filters
// live in the URL; changing them refetches data in place: cards keep their
// previous content under a blurred spinner overlay instead of collapsing into
// a full-page skeleton.

import type { ShareCardInput } from "./share-card";

import { ArrowsRotateRight, NodesRight } from "@gravity-ui/icons";
import {
  Button,
  Card,
  DateField,
  DateRangePicker,
  Input,
  Label,
  ListBox,
  RangeCalendar,
  Select,
  Spinner,
  Tabs,
  TextField,
  Typography,
  Popover,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type Key,
  type SetStateAction,
} from "react";

import { CostAnalysisModal } from "./cost-modal";
import { DetailTable, type DetailRow } from "./detail-table";
import { HeatmapCard } from "./heatmap-card";
import { ShareModal } from "./share-modal";
import { DevicePanel, SourcePanel, TopModels, TotalTokensHero } from "./panels";
import { TrendChart, type TrendMetric, type TrendPoint } from "./charts";

import { RangePresetButtons } from "@/components/range-preset-buttons";
import { SectionError, SectionSkeleton } from "@/components/section-states";
import { useProfile } from "@/lib/auth/profile";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useLocale } from "@/lib/copy/locale";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import {
  DashboardApiError,
  fetchDaily,
  fetchDashboard,
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
  ALL_RANGE_START,
  browserTimezone,
  dayKeyInTz,
  isValidDayKey,
  rangeForSelection,
  RANGE_PRESETS,
  TIMEZONE_OPTIONS,
  tzLabel,
  type RangeKey,
} from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

type TrendMode = "daily" | "monthly";
type DetailView = "daily" | "hourly" | "monthly";

const AUTO_REFRESH_MS = 5 * 60_000;

interface Filters {
  range: RangeKey;
  from: string;
  to: string;
  tz: string;
  deviceId: string;
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

// Range filters never round-trip the URL (operator call 2026-10-26): a stale
// ?range=custom&from=… bookmark must not pin the dashboard to old dates, so
// only tz / device_id persist and every load starts at the default window.
function parseFilters(params: URLSearchParams): Filters {
  return {
    range: "30d",
    from: "",
    to: "",
    tz: params.get("tz") ?? "",
    deviceId: params.get("device_id") ?? "",
  };
}

function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.tz) query.set("tz", filters.tz);
  if (filters.deviceId) query.set("device_id", filters.deviceId);

  return query.toString();
}

/**
 * Blur overlay shown while a refresh refetches data in place — the previous
 * content stays visible underneath, so the layout never collapses.
 */
function PanelOverlay({ active }: { active: boolean }) {
  if (!active) return null;

  return (
    <div
      aria-hidden="true"
      className="bg-surface/60 absolute inset-0 z-10 flex items-center justify-center rounded-2xl backdrop-blur-[2px]"
    >
      <Spinner size="sm" />
    </div>
  );
}

export function DashboardClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];
  const { formatDate, formatMonth, formatTokens, formatCost, formatPercent } =
    useFormat();
  const { profile } = useProfile();

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

  const [refreshing, setRefreshing] = useState(false);
  const [hourlyRefreshing, setHourlyRefreshing] = useState(false);
  const [trendMode, setTrendMode] = useState<TrendMode>("daily");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("tokens");
  const [detailView, setDetailView] = useState<DetailView>("daily");
  const [hourlyDay, setHourlyDay] = useState("");
  const [hourlyRefresh, setHourlyRefresh] = useState(0);
  const [costOpen, setCostOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [rangePickerOpen, setRangePickerOpen] = useState(false);

  const timezone = filters.tz || browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );
  // Range picker state: rangeForSelection resolves the URL day keys — valid
  // custom pairs pass through, presets resolve to their relative window
  // ending today — so the picker always shows a well-formed window.
  const rangePickerValue = useMemo(
    () => ({ start: parseDate(range.fromDay), end: parseDate(range.toDay) }),
    [range],
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

  const loadAll = useCallback(
    async (token: string) => {
      // Keep the previous payloads mounted: only show the initial-load
      // skeleton; refreshes overlay the existing cards instead. Each slot
      // settles into place as its own response arrives, so one slow request
      // (the heatmap's 52 weeks) no longer holds the other cards back.
      setRefreshing(true);
      const seq = ++loadSeq.current;
      let pending = 6;
      let redirected = false;

      const finishOne = () => {
        if (loadSeq.current === seq && --pending === 0) setRefreshing(false);
      };

      const slot = <T,>(
        request: Promise<T>,
        setState: Dispatch<SetStateAction<Loadable<T>>>,
        select: (value: T) => T = (value) => value,
      ) => {
        void request.then(
          (value) => {
            if (loadSeq.current !== seq) return;
            setState({ status: "ready", data: select(value) });
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
      );
      slot(
        fetchDashboard(token, {
          fromIso: range.fromIso,
          toIso: range.toIso,
          tz: timezone,
          rangeKey: filters.range,
        }),
        setDashboardState,
      );
      slot(
        fetchDaily(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }).then((point) => point.data),
        setDailyState,
      );
      slot(
        fetchMonthly(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          deviceId: filters.deviceId || null,
        }).then((point) => point.data),
        setMonthlyState,
      );
      slot(
        fetchHeatmap(token, {
          weeks: 52,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
        setHeatmapState,
      );
      slot(
        fetchModelBreakdown(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }).then((payload) => payload.sources),
        setBreakdownState,
      );
    },
    [
      filters.deviceId,
      filters.range,
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

  // Auto-refresh every five minutes while the tab is visible; switching back
  // to the tab refreshes immediately and restarts the interval. loadAll's
  // run-id makes a refresh racing the previous one safe, and the per-request
  // slot updates keep the cards mounted under the blur overlay.
  useEffect(() => {
    if (!accessToken) return;

    let timer: number | undefined;

    const startTimer = () => {
      window.clearInterval(timer);
      timer = window.setInterval(() => {
        if (document.visibilityState === "visible") {
          void loadAll(accessToken);
        }
      }, AUTO_REFRESH_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        void loadAll(accessToken);
        startTimer();
      }
    };

    startTimer();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [accessToken, loadAll]);

  const effectiveHourlyDay = hourlyDay || dayKeyInTz(new Date(), timezone);

  useEffect(() => {
    if (!accessToken || detailView !== "hourly") return;

    let cancelled = false;

    setHourlyRefreshing(true);
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
        if (!cancelled) setHourlyRefreshing(false);
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
  const heatmap = heatmapState.data;
  const activeDevices = useMemo(
    () => dashboard?.devices.filter((device) => device.active) ?? [],
    [dashboard],
  );
  const hasData = (summary?.totals.total_tokens ?? 0) > 0;
  const hasFilters =
    filters.deviceId !== "" ||
    filters.range !== "30d" ||
    filters.tz !== "" ||
    filters.from !== "" ||
    filters.to !== "";

  const trendData = useMemo<TrendPoint[]>(() => {
    if (trendMode === "monthly") {
      return monthly.map((point) => ({
        key: point.month,
        label: formatMonth(point.month),
        tokens: point.total_tokens,
        cost: point.total_cost_usd,
        conversations: point.conversation_count,
        input: point.input_tokens,
        cached: point.cached_input_tokens + point.cache_creation_input_tokens,
        output: point.output_tokens,
      }));
    }

    return daily.map((point) => ({
      key: point.day ?? "",
      label: (point.day ?? "").slice(5),
      tokens: point.total_tokens,
      cost: point.total_cost_usd,
      conversations: point.conversation_count,
      input: point.input_tokens,
      cached: point.cached_input_tokens + point.cache_creation_input_tokens,
      output: point.output_tokens,
    }));
  }, [daily, formatMonth, monthly, trendMode]);

  const detailRows = useMemo<DetailRow[]>(() => {
    if (detailView === "hourly") {
      return (hourlyState.data ?? []).map((point) => ({
        id: point.hour ?? "",
        time: (point.hour ?? "").slice(11, 16),
        tokens: point.total_tokens,
        input: point.input_tokens,
        cached: point.cached_input_tokens + point.cache_creation_input_tokens,
        output: point.output_tokens,
        billable: point.billable_total_tokens,
        cost: point.total_cost_usd,
        conversations: point.conversation_count,
        models: Object.keys(point.models).length,
        modelTokens: point.models,
      }));
    }
    if (detailView === "monthly") {
      return monthly.map((point) => ({
        id: point.month,
        time: formatMonth(point.month),
        tokens: point.total_tokens,
        input: point.input_tokens,
        cached: point.cached_input_tokens + point.cache_creation_input_tokens,
        output: point.output_tokens,
        billable: point.billable_total_tokens,
        cost: point.total_cost_usd,
        conversations: point.conversation_count,
        models: Object.keys(point.models).length,
        modelTokens: point.models,
      }));
    }

    return daily.map((point) => ({
      id: point.day ?? "",
      time: point.day
        ? formatDate(`${point.day}T12:00:00Z`, { dateStyle: "medium" })
        : "—",
      tokens: point.total_tokens,
      input: point.input_tokens,
      cached: point.cached_input_tokens,
      cacheCreation: point.cache_creation_input_tokens,
      output: point.output_tokens,
      billable: point.billable_total_tokens,
      cost: point.total_cost_usd,
      conversations: point.conversation_count,
      models: Object.keys(point.models).length,
      modelTokens: point.models,
    }));
  }, [daily, detailView, formatDate, formatMonth, hourlyState.data, monthly]);

  const retryAll = () => {
    if (accessToken) void loadAll(accessToken);
  };

  const openCostModal = useCallback(() => setCostOpen(true), []);

  // Heatmap cell → sessions for that exact day (D1). Sessions reads from/to
  // once as an initial window; its own filter edits never round-trip them.
  const openSessionsForDay = useCallback(
    (day: string) => {
      router.push(`/sessions?from=${day}&to=${day}`);
    },
    [router],
  );

  const detailState =
    detailView === "hourly"
      ? hourlyState
      : detailView === "monthly"
        ? monthlyState
        : dailyState;

  const shareInput = useMemo<ShareCardInput | null>(() => {
    if (!summary || !heatmap) return null;
    const totalTokens = summary.totals.total_tokens;
    const shareOf = (value: number) =>
      totalTokens > 0 ? formatPercent(value / totalTokens) : "0%";

    return {
      handle: profile?.displayName || profile?.email || "Token Usage",
      rangeLabel: `${formatDate(`${range.fromDay}T12:00:00Z`, { dateStyle: "medium" })} — ${formatDate(`${range.toDay}T12:00:00Z`, { dateStyle: "medium" })}`,
      totalTokens: formatTokens(totalTokens),
      totalTokensExact: String(totalTokens),
      costLabel: formatCost(summary.totals.total_cost_usd),
      activeDays: summary.days,
      sources: [...breakdown]
        .sort(
          (first, second) =>
            second.totals.total_tokens - first.totals.total_tokens,
        )
        .map((source) => ({
          name: source.source,
          tokens: formatTokens(source.totals.total_tokens),
          share: shareOf(source.totals.total_tokens),
        })),
      models: [...breakdown]
        .flatMap((source) => source.models)
        .sort(
          (first, second) =>
            second.totals.total_tokens - first.totals.total_tokens,
        )
        .map((model) => ({
          name: model.model,
          tokens: formatTokens(model.totals.total_tokens),
          share: shareOf(model.totals.total_tokens),
        })),
      heatmapLevels: heatmap.weeks.map((week) =>
        week.map((cell) => cell.level),
      ),
      tickLabel: tzLabel(timezone),
      locale,
    };
  }, [
    breakdown,
    formatCost,
    formatDate,
    formatPercent,
    formatTokens,
    heatmap,
    locale,
    profile?.displayName,
    profile?.email,
    range.fromDay,
    range.toDay,
    summary,
    timezone,
  ]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.rangeLabel}
          </Typography>
          <DateRangePicker
            aria-label={copy.rangeLabel}
            className="w-80"
            isOpen={rangePickerOpen}
            maxValue={rangePickerMax}
            minValue={parseDate(ALL_RANGE_START)}
            value={rangePickerValue}
            onChange={(value) => {
              if (!value) return;

              applyFilters({
                range: "custom",
                from: value.start.toString(),
                to: value.end.toString(),
              });
            }}
            onOpenChange={setRangePickerOpen}
          >
            <DateField.Group fullWidth>
              <DateField.Input slot="start">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateRangePicker.RangeSeparator />
              <DateField.Input slot="end">
                {(segment) => <DateField.Segment segment={segment} />}
              </DateField.Input>
              <DateField.Suffix>
                <DateRangePicker.Trigger>
                  <DateRangePicker.TriggerIndicator />
                </DateRangePicker.Trigger>
              </DateField.Suffix>
            </DateField.Group>
            <DateRangePicker.Popover>
              <RangePresetButtons
                ariaLabel={copy.rangeLabel}
                labels={copy.ranges}
                presets={RANGE_PRESETS}
                selected={filters.range}
                onSelect={(preset) => {
                  applyFilters({
                    range: preset as RangeKey,
                    from: "",
                    to: "",
                  });
                  setRangePickerOpen(false);
                }}
              />
              <RangeCalendar aria-label={copy.rangeLabel}>
                <RangeCalendar.Header>
                  <RangeCalendar.YearPickerTrigger>
                    <RangeCalendar.YearPickerTriggerHeading />
                    <RangeCalendar.YearPickerTriggerIndicator />
                  </RangeCalendar.YearPickerTrigger>
                  <RangeCalendar.NavButton slot="previous" />
                  <RangeCalendar.NavButton slot="next" />
                </RangeCalendar.Header>
                <RangeCalendar.Grid>
                  <RangeCalendar.GridHeader>
                    {(day) => (
                      <RangeCalendar.HeaderCell>{day}</RangeCalendar.HeaderCell>
                    )}
                  </RangeCalendar.GridHeader>
                  <RangeCalendar.GridBody>
                    {(date) => <RangeCalendar.Cell date={date} />}
                  </RangeCalendar.GridBody>
                </RangeCalendar.Grid>
                <RangeCalendar.YearPickerGrid>
                  <RangeCalendar.YearPickerGridBody>
                    {({ year }) => <RangeCalendar.YearPickerCell year={year} />}
                  </RangeCalendar.YearPickerGridBody>
                </RangeCalendar.YearPickerGrid>
              </RangeCalendar>
            </DateRangePicker.Popover>
          </DateRangePicker>
        </label>

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.tzLabel}
          </Typography>
          <Select
            aria-label={copy.tzLabel}
            className="w-48"
            value={filters.tz || "__browser"}
            onChange={(key) => {
              if (key == null) return;
              const value = String(key);

              applyFilters({ tz: value === "__browser" ? "" : value });
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item
                  key="__browser"
                  id="__browser"
                  textValue={copy.tzBrowser}
                >
                  {`${copy.tzBrowser} (${browserTimezone()})`}
                </ListBox.Item>
                {TIMEZONE_OPTIONS.map((zone) => (
                  <ListBox.Item key={zone} id={zone} textValue={zone}>
                    {zone}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.deviceLabel}
          </Typography>
          <Select
            aria-label={copy.deviceLabel}
            className="w-48"
            value={filters.deviceId || "__all"}
            onChange={(key) => {
              if (key == null) return;
              const value = String(key);

              applyFilters({ deviceId: value === "__all" ? "" : value });
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                <ListBox.Item id="__all" textValue={copy.allDevices}>
                  {copy.allDevices}
                </ListBox.Item>
                {activeDevices.map((device) => (
                  <ListBox.Item
                    key={device.device_id}
                    id={device.device_id}
                    textValue={device.device_name}
                  >
                    {device.device_name}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        {hasFilters ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() =>
              applyFilters({
                range: "30d",
                from: "",
                to: "",
                tz: "",
                deviceId: "",
              })
            }
          >
            {copy.clearFilters}
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1.5">
          <Button
            isIconOnly
            aria-label={copy.share}
            isDisabled={!shareInput}
            size="sm"
            variant="tertiary"
            onPress={() => setShareOpen(true)}
          >
            <NodesRight aria-hidden="true" className="size-4" />
          </Button>
          <Button
            isIconOnly
            aria-label={copy.refresh}
            size="sm"
            variant="tertiary"
            onPress={retryAll}
          >
            <ArrowsRotateRight
              aria-hidden="true"
              className={refreshing ? "size-4 animate-spin" : "size-4"}
            />
          </Button>
        </div>
      </div>

      {summaryState.status === "loading" ? (
        // Mirrors the loaded layout: KPI tiles, hero card, heatmap, trend.
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }, (_, index) => (
              <SectionSkeleton key={index} className="h-28 w-full" />
            ))}
          </div>
          <SectionSkeleton className="h-52 w-full" />
          <SectionSkeleton className="h-72 w-full" />
          <SectionSkeleton className="h-96 w-full" />
        </div>
      ) : null}

      {summaryState.status === "error" ? (
        <Card className="p-6">
          <Card.Content>
            <SectionError
              message={copy.states.loadError}
              retry={retryAll}
              retryLabel={copy.states.retry}
            />
          </Card.Content>
        </Card>
      ) : null}

      {summaryState.status === "ready" && summary ? (
        hasData ? (
          <>
            <div className="relative">
              <PanelOverlay active={refreshing} />
              <TotalTokensHero
                allTime={dashboard?.all_time ?? null}
                breakdown={breakdown}
                copy={copy}
                fromDay={range.fromDay}
                locale={locale}
                summary={summary}
                toDay={range.toDay}
              />
            </div>

            <div className="relative">
              <PanelOverlay active={refreshing} />
              {heatmap ? (
                <HeatmapCard
                  copy={copy}
                  locale={locale}
                  onDaySelect={openSessionsForDay}
                  payload={heatmap}
                  timezone={timezone}
                />
              ) : (
                <Card className="p-6">
                  <Card.Content>
                    {heatmapState.status === "loading" ? (
                      <SectionSkeleton className="h-56 w-full" />
                    ) : (
                      <SectionError
                        message={copy.states.loadError}
                        retry={retryAll}
                        retryLabel={copy.states.retry}
                      />
                    )}
                  </Card.Content>
                </Card>
              )}
            </div>

            <Card className="relative p-6">
              <PanelOverlay active={refreshing} />
              <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <Card.Title>{copy.charts.trendTitle}</Card.Title>
                <div className="flex flex-wrap items-center gap-2">
                  <Tabs
                    selectedKey={trendMode}
                    onSelectionChange={(key) =>
                      setTrendMode(String(key) as TrendMode)
                    }
                  >
                    <Tabs.ListContainer>
                      <Tabs.List
                        aria-label={copy.charts.trendTitle}
                        className="p-0.5"
                      >
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="daily"
                        >
                          {copy.charts.daily}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="monthly"
                        >
                          {copy.charts.monthly}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </Tabs.List>
                    </Tabs.ListContainer>
                  </Tabs>
                  <Tabs
                    selectedKey={trendMetric}
                    onSelectionChange={(key) =>
                      setTrendMetric(String(key) as TrendMetric)
                    }
                  >
                    <Tabs.ListContainer>
                      <Tabs.List
                        aria-label={copy.charts.trendTitle}
                        className="p-0.5"
                      >
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="tokens"
                        >
                          {copy.charts.tokens}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="cost"
                        >
                          {copy.charts.cost}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </Tabs.List>
                    </Tabs.ListContainer>
                  </Tabs>
                </div>
              </Card.Header>
              <Card.Content>
                {trendMode === "daily" &&
                dailyState.status === "error" &&
                daily.length === 0 ? (
                  <SectionError
                    message={copy.states.loadError}
                    retry={retryAll}
                    retryLabel={copy.states.retry}
                  />
                ) : trendMode === "monthly" &&
                  monthlyState.status === "error" &&
                  monthly.length === 0 ? (
                  <SectionError
                    message={copy.states.loadError}
                    retry={retryAll}
                    retryLabel={copy.states.retry}
                  />
                ) : (
                  <TrendChart
                    ariaLabel={copy.charts.ariaLabel
                      .replace("{title}", copy.charts.trendTitle)
                      .replace("{from}", range.fromDay)
                      .replace("{to}", range.toDay)}
                    data={trendData}
                    emptyLabel={copy.charts.noData}
                    labels={{
                      tokens: copy.charts.tokens,
                      cost: copy.charts.cost,
                      conversations: copy.cards.conversations,
                      input: copy.charts.inputTokens,
                      cached: copy.charts.cachedTokens,
                      output: copy.charts.outputTokens,
                    }}
                    metric={trendMetric}
                    selectedKey={
                      trendMode === "daily" && hourlyDay ? hourlyDay : undefined
                    }
                    onSelect={(key) => {
                      if (trendMode !== "daily" || !key) return;
                      setHourlyDay(key);
                      setDetailView("hourly");
                    }}
                  />
                )}
              </Card.Content>
            </Card>

            <div className="relative grid gap-4 lg:grid-cols-2">
              <PanelOverlay active={refreshing} />
              {breakdownState.status === "ready" ? (
                <TopModels
                  copy={copy}
                  sources={breakdown}
                  onViewAll={openCostModal}
                />
              ) : (
                <Card className="p-6">
                  <Card.Content>
                    {breakdownState.status === "loading" ? (
                      <SectionSkeleton className="h-56 w-full" />
                    ) : (
                      <SectionError
                        message={copy.states.loadError}
                        retry={retryAll}
                        retryLabel={copy.states.retry}
                      />
                    )}
                  </Card.Content>
                </Card>
              )}

              {breakdownState.status === "ready" ? (
                <SourcePanel copy={copy} sources={breakdown} />
              ) : (
                <Card className="p-6">
                  <Card.Content>
                    <SectionSkeleton className="h-44 w-full" />
                  </Card.Content>
                </Card>
              )}
            </div>

            <div className="relative">
              <PanelOverlay active={refreshing} />
              {dashboardState.status === "ready" && dashboard ? (
                <DevicePanel
                  copy={copy}
                  devices={dashboard.devices}
                  selectedDeviceId={filters.deviceId || null}
                  onSelectDevice={(deviceId) =>
                    applyFilters({ deviceId: deviceId ?? "" })
                  }
                />
              ) : (
                <Card className="p-6">
                  <Card.Content>
                    {dashboardState.status === "loading" ? (
                      <SectionSkeleton className="h-44 w-full" />
                    ) : (
                      <SectionError
                        message={copy.states.loadError}
                        retry={retryAll}
                        retryLabel={copy.states.retry}
                      />
                    )}
                  </Card.Content>
                </Card>
              )}
            </div>

            <Card className="relative p-6">
              <PanelOverlay
                active={detailView === "hourly" ? hourlyRefreshing : refreshing}
              />
              <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
                <Card.Title>{copy.detail.title}</Card.Title>
                <div className="flex flex-wrap items-end gap-2">
                  {detailView === "hourly" ? (
                    <>
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() => {
                          setHourlyDay("");
                          setDetailView("daily");
                        }}
                      >
                        {`${effectiveHourlyDay} · ${copy.detail.backToDaily}`}
                      </Button>
                      <TextField
                        className="w-40"
                        value={effectiveHourlyDay}
                        onChange={(value) => {
                          if (isValidDayKey(value)) setHourlyDay(value);
                        }}
                      >
                        <Label>{copy.detail.dayLabel}</Label>
                        <Input
                          aria-label={copy.detail.dayLabel}
                          type="date"
                          variant="secondary"
                        />
                      </TextField>
                    </>
                  ) : null}
                  <Tabs
                    selectedKey={detailView}
                    onSelectionChange={(key: Key) =>
                      setDetailView(String(key) as DetailView)
                    }
                  >
                    <Tabs.ListContainer>
                      <Tabs.List
                        aria-label={copy.detail.title}
                        className="p-0.5"
                      >
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="daily"
                        >
                          {copy.detail.daily}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="hourly"
                        >
                          {copy.detail.hourly}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab
                          className="h-7 min-w-12 px-2.5 text-xs"
                          id="monthly"
                        >
                          {copy.detail.monthly}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      </Tabs.List>
                    </Tabs.ListContainer>
                  </Tabs>
                </div>
              </Card.Header>
              <Card.Content>
                {detailState.status === "loading" ? (
                  <SectionSkeleton className="h-64 w-full" />
                ) : detailState.status === "error" ? (
                  <SectionError
                    message={copy.detail.loadError}
                    retry={
                      detailView === "hourly"
                        ? () => setHourlyRefresh((value) => value + 1)
                        : retryAll
                    }
                    retryLabel={copy.detail.retry}
                  />
                ) : (
                  <DetailTable copy={copy} locale={locale} rows={detailRows} />
                )}
              </Card.Content>
            </Card>
          </>
        ) : (
          <Card className="p-10">
            <Card.Header>
              <Card.Title>
                {hasFilters
                  ? copy.states.filterEmptyTitle
                  : copy.states.emptyTitle}
              </Card.Title>
              <Card.Description>
                {hasFilters
                  ? copy.states.filterEmptyBody
                  : copy.states.emptyBody}
              </Card.Description>
            </Card.Header>
            {hasFilters ? (
              <Card.Footer>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() =>
                    applyFilters({
                      range: "30d",
                      from: "",
                      to: "",
                      tz: "",
                      deviceId: "",
                    })
                  }
                >
                  {copy.clearFilters}
                </Button>
              </Card.Footer>
            ) : null}
          </Card>
        )
      ) : null}

      <CostAnalysisModal
        copy={copy}
        daily={daily}
        open={costOpen}
        sources={breakdown}
        totalCostUsd={Number(summary?.totals.total_cost_usd ?? 0)}
        onOpenChange={setCostOpen}
      />

      <ShareModal
        input={shareInput}
        open={shareOpen}
        onOpenChange={setShareOpen}
      />
    </main>
  );
}
