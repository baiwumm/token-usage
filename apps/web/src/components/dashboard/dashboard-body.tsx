import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { CalendarDate } from "@internationalized/date";
import type { LoadStatus } from "@/lib/loadable";
import type {
  AccountSummary,
  DashboardPayload,
  HeatmapPayload,
  ModelBreakdownSource,
  MonthlyPoint,
  SeriesPoint,
} from "@/lib/dashboard/api";
import type { DashboardRange } from "@/lib/dashboard/ranges";
import type { DetailRow, DetailView } from "./detail-table";
import type { TrendMode } from "./trend-panel";

import { BreakdownPanels } from "./breakdown-panels";
import { DashboardSkeleton } from "./dashboard-skeleton";
import { DashboardEmptyCard, DashboardErrorCard } from "./dashboard-states";
import { DetailTable } from "./detail-table";
import { DeviceSection } from "./device-section";
import { HeatmapSection } from "./heatmap-section";
import { HeroSection } from "./hero-section";
import { TrendPanel } from "./trend-panel";

/**
 * Everything below the filter bar: the summary-state gate (loading skeleton /
 * error card / ready-empty / ready-data) and the card stack. The composable
 * pieces live in the sibling section files; this file only wires them.
 */
export function DashboardBody({
  breakdown,
  breakdownStatus,
  budgetExceeded,
  copy,
  daily,
  dailyStatus,
  dashboard,
  dashboardStatus,
  detailDay,
  detailRows,
  detailStatus,
  detailView,
  hasData,
  hasFilters,
  heatmap,
  heatmapStatus,
  hourlyRefreshing,
  locale,
  monthly,
  monthlyStatus,
  range,
  rangePickerMax,
  refreshing,
  selectedDeviceId,
  summary,
  summaryStatus,
  timezone,
  trendMode,
  trendSelectedDay,
  onClearFilters,
  onDaySelect,
  onDetailRetry,
  onDetailViewChange,
  onDeviceSelect,
  onHourlyDayChange,
  onRetry,
  onTrendDaySelect,
  onTrendModeChange,
  onViewAll,
}: {
  breakdown: ModelBreakdownSource[];
  breakdownStatus: LoadStatus;
  budgetExceeded: boolean;
  copy: DashboardCopy;
  daily: SeriesPoint[];
  dailyStatus: LoadStatus;
  dashboard: DashboardPayload | null;
  dashboardStatus: LoadStatus;
  /** Day the hourly view is pinned to (defaults to the latest data day). */
  detailDay: string;
  detailRows: DetailRow[];
  detailStatus: LoadStatus;
  detailView: DetailView;
  hasData: boolean;
  hasFilters: boolean;
  heatmap: HeatmapPayload | null;
  heatmapStatus: LoadStatus;
  hourlyRefreshing: boolean;
  locale: "zh" | "en";
  monthly: MonthlyPoint[];
  monthlyStatus: LoadStatus;
  range: DashboardRange;
  rangePickerMax: CalendarDate;
  refreshing: boolean;
  selectedDeviceId: string;
  summary: AccountSummary | null;
  summaryStatus: LoadStatus;
  timezone: string;
  trendMode: TrendMode;
  /** Day the trend chart highlights — only when one was clicked (raw state). */
  trendSelectedDay: string;
  onClearFilters: () => void;
  onDaySelect: (day: string) => void;
  onDetailRetry: () => void;
  onDetailViewChange: (view: DetailView) => void;
  onDeviceSelect: (deviceId: string | null) => void;
  onHourlyDayChange: (day: string) => void;
  onRetry: () => void;
  /** Trend point click: pins the hourly table to that day. */
  onTrendDaySelect: (day: string) => void;
  onTrendModeChange: (mode: TrendMode) => void;
  onViewAll: () => void;
}) {
  return (
    <>
      {summaryStatus === "loading" ? (
        // Mirrors the loaded card stack: hero, heatmap, trend, breakdown,
        // devices and the detail table.
        <DashboardSkeleton />
      ) : null}

      {summaryStatus === "error" ? (
        <DashboardErrorCard copy={copy} onRetry={onRetry} />
      ) : null}

      {summaryStatus === "ready" && summary ? (
        hasData ? (
          <>
            <HeroSection
              allTime={dashboard?.all_time ?? null}
              breakdown={breakdown}
              budgetExceeded={budgetExceeded}
              copy={copy}
              fromDay={range.fromDay}
              locale={locale}
              refreshing={refreshing}
              summary={summary}
              toDay={range.toDay}
            />

            <HeatmapSection
              copy={copy}
              locale={locale}
              payload={heatmap}
              refreshing={refreshing}
              status={heatmapStatus}
              timezone={timezone}
              onDaySelect={onDaySelect}
              onRetry={onRetry}
            />

            <TrendPanel
              copy={copy}
              daily={daily}
              dailyStatus={dailyStatus}
              monthly={monthly}
              monthlyStatus={monthlyStatus}
              range={range}
              refreshing={refreshing}
              selectedDay={trendSelectedDay}
              trendMode={trendMode}
              onRetry={onRetry}
              onSelectDay={onTrendDaySelect}
              onTrendModeChange={onTrendModeChange}
            />

            <BreakdownPanels
              copy={copy}
              refreshing={refreshing}
              sources={breakdown}
              status={breakdownStatus}
              onRetry={onRetry}
              onViewAll={onViewAll}
            />

            <DeviceSection
              copy={copy}
              data={dashboard}
              refreshing={refreshing}
              selectedDeviceId={selectedDeviceId || null}
              status={dashboardStatus}
              onRetry={onRetry}
              onSelectDevice={onDeviceSelect}
            />

            <DetailTable
              copy={copy}
              detailView={detailView}
              hourlyDay={detailDay}
              locale={locale}
              rangePickerMax={rangePickerMax}
              refreshing={
                detailView === "hourly" ? hourlyRefreshing : refreshing
              }
              rows={detailRows}
              status={detailStatus}
              onDetailViewChange={onDetailViewChange}
              onHourlyDayChange={onHourlyDayChange}
              onRetry={onDetailRetry}
            />
          </>
        ) : (
          <DashboardEmptyCard
            copy={copy}
            hasFilters={hasFilters}
            onClearFilters={onClearFilters}
          />
        )
      ) : null}
    </>
  );
}
