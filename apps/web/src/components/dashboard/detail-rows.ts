// Detail table rows: pure projection from the loaded series into DetailRow[].
// Kept out of the client so the table contract is testable without React.

import type { DetailRow, DetailView } from "./detail-table";
import type {
  HourlyPoint,
  MonthlyPoint,
  SeriesPoint,
} from "@/lib/dashboard/api";
import type { useFormat } from "@/lib/format/format";

type Formatters = ReturnType<typeof useFormat>;

export function buildDetailRows({
  daily,
  detailView,
  formatDate,
  formatMonth,
  hourly,
  monthly,
}: {
  daily: SeriesPoint[];
  detailView: DetailView;
  formatDate: Formatters["formatDate"];
  formatMonth: Formatters["formatMonth"];
  hourly: HourlyPoint[] | null;
  monthly: MonthlyPoint[];
}): DetailRow[] {
  if (detailView === "hourly") {
    return (hourly ?? []).map((point) => ({
      id: point.hour ?? "",
      time: (point.hour ?? "").slice(11, 16),
      tokens: point.total_tokens,
      input: point.input_tokens,
      cached: point.cached_input_tokens + point.cache_creation_input_tokens,
      output: point.output_tokens,
      billable: point.billable_total_tokens,
      cost: point.total_cost_usd,
      conversations: point.conversation_count,
      credits: point.credits,
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
      credits: point.credits,
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
    credits: point.credits,
    models: Object.keys(point.models).length,
    modelTokens: point.models,
  }));
}
