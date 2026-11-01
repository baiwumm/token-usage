import type { DashboardCopy } from "@/lib/copy/dashboard";
import type {
  AccountSummary,
  DashboardTotals,
  ModelBreakdownSource,
  SeriesPoint,
} from "@/lib/dashboard/api";

import { PanelOverlay } from "./panel-overlay";
import { TotalTokensHero } from "./hero-card";

/** Hero card slot: the range total, wrapped in the refresh overlay. */
export function HeroSection({
  allTime,
  breakdown,
  budgetExceeded,
  copy,
  fromDay,
  locale,
  peakDay,
  refreshing,
  summary,
  toDay,
}: {
  allTime: DashboardTotals | null;
  breakdown: ModelBreakdownSource[];
  budgetExceeded: boolean;
  copy: DashboardCopy;
  fromDay: string;
  locale: "zh" | "en";
  peakDay: SeriesPoint | null;
  refreshing: boolean;
  summary: AccountSummary;
  toDay: string;
}) {
  return (
    <div className="relative">
      <PanelOverlay active={refreshing} />
      <TotalTokensHero
        allTime={allTime}
        breakdown={breakdown}
        budgetExceeded={budgetExceeded}
        copy={copy}
        fromDay={fromDay}
        locale={locale}
        peakDay={peakDay}
        summary={summary}
        toDay={toDay}
      />
    </div>
  );
}
