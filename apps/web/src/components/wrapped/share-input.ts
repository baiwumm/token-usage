// Share card payload for /wrapped: pure projection of the year payload plus
// the year heatmap into the shared ShareCardData (components/share-card).

import type { Profile } from "@/lib/auth/profile";
import type { DashboardPayload, HeatmapPayload } from "@/lib/dashboard/api";
import type { useFormat } from "@/lib/format/format";

import { buildShareHook, type ShareCardData } from "@/components/share-card";

type Formatters = ReturnType<typeof useFormat>;

export function buildShareInput({
  formatCost,
  formatNumber,
  formatPercent,
  formatTokens,
  heatmap,
  locale,
  payload,
  profile,
  year,
}: {
  formatCost: Formatters["formatCost"];
  formatNumber: Formatters["formatNumber"];
  formatPercent: Formatters["formatPercent"];
  formatTokens: Formatters["formatTokens"];
  heatmap: HeatmapPayload | null;
  locale: "zh" | "en";
  payload: DashboardPayload | null;
  profile: Profile | null;
  year: number;
}): ShareCardData | null {
  const totals = payload?.totals;

  if (!totals) return null;
  const totalTokens = totals.total_tokens;
  const shareOf = (value: number) =>
    totalTokens > 0 ? formatPercent(value / totalTokens) : "0%";
  const models = [...(payload?.models ?? [])].sort(
    (first, second) => second.total_tokens - first.total_tokens,
  );
  const sources = [...(payload?.sources ?? [])].sort(
    (first, second) => second.total_tokens - first.total_tokens,
  );
  const daily = payload?.daily ?? [];
  const peakDay =
    daily.length > 0
      ? daily.reduce((best, day) =>
          day.total_tokens > best.total_tokens ? day : best,
        )
      : null;
  const topModel = models[0] ?? null;

  return {
    handle: profile?.displayName || profile?.email || "Token Usage",
    periodLabel: String(year),
    hook: buildShareHook({
      activeDays: totals.active_days,
      locale,
      modelCount: models.length,
      topModelName: topModel?.model ?? null,
      topModelPercent:
        topModel && totalTokens > 0
          ? (topModel.total_tokens / totalTokens) * 100
          : 0,
      year,
    }),
    heroTokens: formatTokens(totalTokens),
    heroTokensFull: formatNumber(totalTokens),
    costLabel: formatCost(totals.total_cost_usd),
    activeDaysLabel: formatNumber(totals.active_days),
    sessionsLabel:
      totals.conversations > 0 ? formatNumber(totals.conversations) : null,
    peakDay:
      peakDay && peakDay.total_tokens > 0
        ? {
            label: peakDay.date,
            tokens: formatTokens(peakDay.total_tokens),
          }
        : null,
    sources: sources.map((source) => ({
      name: source.source,
      tokens: formatTokens(source.total_tokens),
      tokensFull: formatNumber(source.total_tokens),
      share: shareOf(source.total_tokens),
    })),
    models: models.map((model) => ({
      name: model.model,
      tokens: formatTokens(model.total_tokens),
      tokensFull: formatNumber(model.total_tokens),
      share: shareOf(model.total_tokens),
    })),
    topModelName: topModel?.model ?? null,
    topSourceName: sources[0]?.source ?? null,
    heatmap: heatmap
      ? {
          weeks: heatmap.weeks.map((week) =>
            week.map((cell) => ({ day: cell.day, level: cell.level })),
          ),
          streakDays: heatmap.streak_days,
        }
      : null,
    tickLabel: null,
    locale,
  };
}
