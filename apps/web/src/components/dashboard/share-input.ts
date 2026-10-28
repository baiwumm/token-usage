// Share card payload: pure projection of the loaded dashboard data into the
// shared ShareCardData input (components/share-card). Kept out of the client
// so the orchestrator only has to memoize it.

import type { Profile } from "@/lib/auth/profile";
import type {
  AccountSummary,
  HeatmapPayload,
  ModelBreakdownSource,
} from "@/lib/dashboard/api";
import type { DashboardRange } from "@/lib/dashboard/ranges";
import type { useFormat } from "@/lib/format/format";

import { buildShareHook, type ShareCardData } from "@/components/share-card";

type Formatters = ReturnType<typeof useFormat>;

export function buildShareInput({
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
  tzLabel,
}: {
  breakdown: ModelBreakdownSource[];
  formatCost: Formatters["formatCost"];
  formatDate: Formatters["formatDate"];
  formatNumber: Formatters["formatNumber"];
  formatPercent: Formatters["formatPercent"];
  formatTokens: Formatters["formatTokens"];
  heatmap: HeatmapPayload | null;
  locale: "zh" | "en";
  profile: Profile | null;
  range: DashboardRange;
  summary: AccountSummary | null;
  timezone: string;
  tzLabel: (timezone: string) => string;
}): ShareCardData | null {
  if (!summary || !heatmap) return null;
  const totalTokens = summary.totals.total_tokens;
  const shareOf = (value: number) =>
    totalTokens > 0 ? formatPercent(value / totalTokens) : "0%";
  const sortedSources = [...breakdown].sort(
    (first, second) => second.totals.total_tokens - first.totals.total_tokens,
  );
  const sortedModels = [...breakdown]
    .flatMap((source) => source.models)
    .sort(
      (first, second) => second.totals.total_tokens - first.totals.total_tokens,
    );
  const topModel = sortedModels[0] ?? null;
  const year = Number(range.toDay.slice(0, 4));

  return {
    handle: profile?.displayName || profile?.email || "Token Usage",
    periodLabel: `${formatDate(`${range.fromDay}T12:00:00Z`, { dateStyle: "medium" })} — ${formatDate(`${range.toDay}T12:00:00Z`, { dateStyle: "medium" })}`,
    hook: buildShareHook({
      activeDays: summary.days,
      locale,
      modelCount: sortedModels.length,
      topModelName: topModel?.model ?? null,
      topModelPercent:
        topModel && totalTokens > 0
          ? (topModel.totals.total_tokens / totalTokens) * 100
          : 0,
      year: Number.isFinite(year) ? year : null,
    }),
    heroTokens: formatTokens(totalTokens),
    costLabel: formatCost(summary.totals.total_cost_usd),
    activeDaysLabel: formatNumber(summary.days),
    sessionsLabel:
      summary.totals.conversation_count > 0
        ? formatNumber(summary.totals.conversation_count)
        : null,
    peakDay: null,
    sources: sortedSources.map((source) => ({
      name: source.source,
      tokens: formatTokens(source.totals.total_tokens),
      share: shareOf(source.totals.total_tokens),
    })),
    models: sortedModels.map((model) => ({
      name: model.model,
      tokens: formatTokens(model.totals.total_tokens),
      share: shareOf(model.totals.total_tokens),
    })),
    topModelName: topModel?.model ?? null,
    topSourceName: sortedSources[0]?.source ?? null,
    heatmap: {
      weeks: heatmap.weeks.map((week) =>
        week.map((cell) => ({ day: cell.day, level: cell.level })),
      ),
      streakDays: heatmap.streak_days,
    },
    tickLabel: tzLabel(timezone),
    locale,
  };
}
