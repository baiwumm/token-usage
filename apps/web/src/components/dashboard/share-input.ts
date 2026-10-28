// Share card payload: pure projection of the loaded dashboard data into the
// PNG/OG card input. Kept out of the client so the orchestrator only has to
// memoize it.

import type { Profile } from "@/lib/auth/profile";
import type { ShareCardInput } from "./share-card";
import type {
  AccountSummary,
  HeatmapPayload,
  ModelBreakdownSource,
} from "@/lib/dashboard/api";
import type { DashboardRange } from "@/lib/dashboard/ranges";
import type { useFormat } from "@/lib/format/format";

type Formatters = ReturnType<typeof useFormat>;

export function buildShareInput({
  breakdown,
  formatCost,
  formatDate,
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
  formatPercent: Formatters["formatPercent"];
  formatTokens: Formatters["formatTokens"];
  heatmap: HeatmapPayload | null;
  locale: "zh" | "en";
  profile: Profile | null;
  range: DashboardRange;
  summary: AccountSummary | null;
  timezone: string;
  tzLabel: (timezone: string) => string;
}): ShareCardInput | null {
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
    heatmapLevels: heatmap.weeks.map((week) => week.map((cell) => cell.level)),
    tickLabel: tzLabel(timezone),
    locale,
  };
}
