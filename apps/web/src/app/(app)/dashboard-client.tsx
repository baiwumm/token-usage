"use client";

// Dashboard at / (docs/ui-spec.md 仪表盘, M5.5 official core). Data comes from
// the frozen Dashboard-face contract endpoints with the browser session JWT
// (dual principal, §1.4) — never a browser→Supabase table connection. Filters
// live in the URL; changing them refetches data in place: cards keep their
// previous content under a blurred spinner overlay instead of collapsing into
// a full-page skeleton.

import type { ShareCardInput } from "../dashboard/share-card";

import { ArrowsRotateRight, NodesRight } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Spinner,
  Tabs,
  TextField,
  Typography,
  Popover,
} from "@heroui/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type Key } from "react";

import { CostAnalysisModal } from "../dashboard/cost-modal";
import { DetailTable, type DetailRow } from "../dashboard/detail-table";
import { HeatmapCard } from "../dashboard/heatmap-card";
import { ShareModal } from "../dashboard/share-modal";
import {
  DevicePanel,
  KpiCards,
  SourcePanel,
  TopModels,
  TotalTokensHero,
} from "../dashboard/panels";
import {
  TrendChart,
  type TrendMetric,
  type TrendPoint,
} from "../dashboard/charts";

import { useProfile } from "@/lib/auth/profile";
import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useLocale } from "@/lib/copy/locale";
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

type LoadStatus = "loading" | "ready" | "error";
type Loadable<T> = { status: LoadStatus; data: T | null };
type TrendMode = "daily" | "monthly";
type DetailView = "daily" | "hourly" | "monthly";

interface Filters {
  range: RangeKey;
  from: string;
  to: string;
  tz: string;
  deviceId: string;
}

function loadable<T>(): Loadable<T> {
  return { status: "loading", data: null };
}

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

function parseFilters(params: URLSearchParams): Filters {
  const rawRange = params.get("range");
  const range: RangeKey =
    rawRange === "7d" ||
    rawRange === "30d" ||
    rawRange === "90d" ||
    rawRange === "all" ||
    rawRange === "custom"
      ? rawRange
      : "30d";

  return {
    range,
    from: params.get("from") ?? "",
    to: params.get("to") ?? "",
    tz: params.get("tz") ?? "",
    deviceId: params.get("device_id") ?? "",
  };
}

function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.range !== "30d") query.set("range", filters.range);
  if (filters.range === "custom") {
    if (filters.from) query.set("from", filters.from);
    if (filters.to) query.set("to", filters.to);
  }
  if (filters.tz) query.set("tz", filters.tz);
  if (filters.deviceId) query.set("device_id", filters.deviceId);

  return query.toString();
}

function SectionSkeleton({ className }: { className?: string }) {
  // Same radius as HeroUI cards (min(32px, --radius-3xl)) so loading blocks
  // match the layout they stand in for.
  return (
    <Skeleton
      className={`rounded-[min(32px,var(--radius-3xl))] ${className ?? "h-40 w-full"}`}
    />
  );
}

function SectionError({
  message,
  retry,
  retryLabel,
}: {
  message: string;
  retry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Typography className="text-danger" type="body-sm">
        {message}
      </Typography>
      <Button size="sm" variant="outline" onPress={retry}>
        {retryLabel}
      </Button>
    </div>
  );
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
  const searchParams = useSearchParams();
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];
  const { formatDate, formatMonth, formatTokens, formatCost, formatPercent } =
    useFormat();
  const { profile } = useProfile();

  const [filters, setFilters] = useState<Filters>(() =>
    parseFilters(searchParams),
  );
  const [accessToken, setAccessToken] = useState<string | null>(null);
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

  const timezone = filters.tz || browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/")}`);
  }, [router]);

  const applyFilters = useCallback((patch: Partial<Filters>) => {
    setFilters((previous) => {
      const next = { ...previous, ...patch };
      const query = serializeFilters(next);

      window.history.replaceState(null, "", query ? `/?${query}` : "/");

      return next;
    });
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setFilters(parseFilters(new URLSearchParams(window.location.search)));
    };

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    setTrendMode(filters.range === "all" ? "monthly" : "daily");
  }, [filters.range]);

  useEffect(() => {
    setHourlyDay("");
  }, [timezone]);

  useEffect(() => {
    const supabase = authBrowserClient();

    void (async () => {
      const {
        data: { session },
      } = (await supabase?.auth.getSession()) ?? { data: { session: null } };

      if (!session?.access_token) {
        redirectToLogin();

        return;
      }
      setAccessToken(session.access_token);
    })();
  }, [redirectToLogin]);

  const loadAll = useCallback(
    async (token: string) => {
      // Keep the previous payloads mounted: only show the initial-load
      // skeleton; refreshes overlay the existing cards instead.
      setRefreshing(true);

      const results = await Promise.allSettled([
        fetchSummary(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
        fetchDashboard(token, {
          fromIso: range.fromIso,
          toIso: range.toIso,
          tz: timezone,
          rangeKey: filters.range,
        }),
        fetchDaily(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
        fetchMonthly(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          deviceId: filters.deviceId || null,
        }),
        fetchHeatmap(token, {
          weeks: 52,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
        fetchModelBreakdown(token, {
          fromDay: range.fromDay,
          toDay: range.toDay,
          tz: timezone,
          deviceId: filters.deviceId || null,
        }),
      ]);

      if (
        results.some(
          (result) =>
            result.status === "rejected" && isUnauthorized(result.reason),
        )
      ) {
        setRefreshing(false);
        redirectToLogin();

        return;
      }

      // A failed refresh keeps the previous data on screen; only an empty
      // slot (no data yet) falls through to the error state.
      const settledKeep = <T,>(
        previous: Loadable<T>,
        result: PromiseSettledResult<T>,
      ): Loadable<T> =>
        result.status === "fulfilled"
          ? { status: "ready", data: result.value }
          : previous.data != null
            ? previous
            : { status: "error", data: null };

      setSummaryState((previous) =>
        settledKeep(
          previous,
          results[0] as PromiseSettledResult<AccountSummary>,
        ),
      );
      setDashboardState((previous) =>
        settledKeep(
          previous,
          results[1] as PromiseSettledResult<DashboardPayload>,
        ),
      );

      const dailyResult = results[2] as PromiseSettledResult<{
        data: SeriesPoint[];
      }>;

      setDailyState((previous) =>
        settledKeep(
          previous,
          dailyResult.status === "fulfilled"
            ? { status: "fulfilled", value: dailyResult.value.data }
            : { status: "rejected", reason: dailyResult.reason },
        ),
      );

      const monthlyResult = results[3] as PromiseSettledResult<{
        data: MonthlyPoint[];
      }>;

      setMonthlyState((previous) =>
        settledKeep(
          previous,
          monthlyResult.status === "fulfilled"
            ? { status: "fulfilled", value: monthlyResult.value.data }
            : { status: "rejected", reason: monthlyResult.reason },
        ),
      );
      setHeatmapState((previous) =>
        settledKeep(
          previous,
          results[4] as PromiseSettledResult<HeatmapPayload>,
        ),
      );

      const breakdownResult = results[5] as PromiseSettledResult<{
        sources: ModelBreakdownSource[];
      }>;

      setBreakdownState((previous) =>
        settledKeep(
          previous,
          breakdownResult.status === "fulfilled"
            ? {
                status: "fulfilled",
                value: breakdownResult.value.sources,
              }
            : { status: "rejected", reason: breakdownResult.reason },
        ),
      );
      setRefreshing(false);
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
  const daily = dailyState.data ?? [];
  const monthly = monthlyState.data ?? [];
  const breakdown = breakdownState.data ?? [];
  const heatmap = heatmapState.data;
  const activeDevices =
    dashboard?.devices.filter((device) => device.active) ?? [];
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
      }));
    }

    return daily.map((point) => ({
      key: point.day ?? "",
      label: (point.day ?? "").slice(5),
      tokens: point.total_tokens,
      cost: point.total_cost_usd,
      conversations: point.conversation_count,
    }));
  }, [daily, formatMonth, monthly, trendMode]);

  const costByDay = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};

    for (const point of daily) {
      if (point.day) map[point.day] = point.total_cost_usd;
    }

    return map;
  }, [daily]);

  const detailRows = useMemo<DetailRow[]>(() => {
    if (detailView === "hourly") {
      return (hourlyState.data ?? []).map((point) => ({
        id: point.hour ?? "",
        time: (point.hour ?? "").slice(11, 16),
        tokens: point.total_tokens,
        billable: point.billable_total_tokens,
        cost: point.total_cost_usd,
        conversations: point.conversation_count,
        models: Object.keys(point.models).length,
      }));
    }
    if (detailView === "monthly") {
      return monthly.map((point) => ({
        id: point.month,
        time: formatMonth(point.month),
        tokens: point.total_tokens,
        billable: point.billable_total_tokens,
        cost: point.total_cost_usd,
        conversations: point.conversation_count,
        models: Object.keys(point.models).length,
      }));
    }

    return daily.map((point) => ({
      id: point.day ?? "",
      time: point.day
        ? formatDate(`${point.day}T12:00:00Z`, { dateStyle: "medium" })
        : "—",
      tokens: point.total_tokens,
      billable: point.billable_total_tokens,
      cost: point.total_cost_usd,
      conversations: point.conversation_count,
      models: Object.keys(point.models).length,
    }));
  }, [daily, detailView, formatDate, formatMonth, hourlyState.data, monthly]);

  const retryAll = () => {
    if (accessToken) void loadAll(accessToken);
  };

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
          <Select
            aria-label={copy.rangeLabel}
            className="w-40"
            value={filters.range}
            onChange={(key) => {
              if (key == null) return;
              const next = String(key) as RangeKey;

              applyFilters({
                range: next,
                from: next === "custom" ? range.fromDay : "",
                to: next === "custom" ? range.toDay : "",
              });
            }}
          >
            <Select.Trigger>
              <Select.Value />
              <Select.Indicator />
            </Select.Trigger>
            <Select.Popover>
              <Popover.Arrow />
              <ListBox>
                {[...RANGE_PRESETS, "custom" as const].map((key) => (
                  <ListBox.Item key={key} id={key} textValue={copy.ranges[key]}>
                    {copy.ranges[key]}
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </label>

        {filters.range === "custom" ? (
          <>
            <TextField
              className="w-40"
              value={filters.from || range.fromDay}
              onChange={(value) => {
                if (isValidDayKey(value)) applyFilters({ from: value });
              }}
            >
              <Label>{copy.customFrom}</Label>
              <Input
                aria-label={copy.customFrom}
                type="date"
                variant="secondary"
              />
            </TextField>
            <TextField
              className="w-40"
              value={filters.to || range.toDay}
              onChange={(value) => {
                if (isValidDayKey(value)) applyFilters({ to: value });
              }}
            >
              <Label>{copy.customTo}</Label>
              <Input
                aria-label={copy.customTo}
                type="date"
                variant="secondary"
              />
            </TextField>
          </>
        ) : null}

        <label className="flex flex-col gap-1">
          <Typography color="muted" type="body-xs">
            {copy.tzLabel}
          </Typography>
          <Select
            aria-label={copy.tzLabel}
            className="w-72"
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
              <KpiCards
                allTime={dashboard?.all_time ?? null}
                copy={copy}
                daily={dashboard?.daily ?? []}
                summary={summary}
                onOpenCost={() => setCostOpen(true)}
              />
            </div>

            <div className="relative">
              <PanelOverlay active={refreshing} />
              <TotalTokensHero
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
                      <Tabs.List aria-label={copy.charts.trendTitle}>
                        <Tabs.Tab id="daily">
                          {copy.charts.daily}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="monthly">
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
                      <Tabs.List aria-label={copy.charts.trendTitle}>
                        <Tabs.Tab id="tokens">
                          {copy.charts.tokens}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="cost">
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
                    }}
                    metric={trendMetric}
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
                  models={breakdown.flatMap((source) => source.models)}
                  onViewAll={() => setCostOpen(true)}
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
                  ) : null}
                  <Tabs
                    selectedKey={detailView}
                    onSelectionChange={(key: Key) =>
                      setDetailView(String(key) as DetailView)
                    }
                  >
                    <Tabs.ListContainer>
                      <Tabs.List aria-label={copy.detail.title}>
                        <Tabs.Tab id="daily">
                          {copy.detail.daily}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="hourly">
                          {copy.detail.hourly}
                          <Tabs.Indicator />
                        </Tabs.Tab>
                        <Tabs.Tab id="monthly">
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
