// Shared read-time cost for session rows' per-model entries
// (docs/cli-contract.md §2.7 sessions 口径): every model entry is priced
// through the shared engine with its session's source context, then summed
// per row. account-series-handlers (per-model wire costs), projects and
// projects-detail (row totals) previously carried three verbatim copies of
// this fold — the engine call and its token-column keying must never drift
// between the sessions series and the projects faces.

import { numberOr0 } from "@/lib/account/series";
import { computeRowCost } from "@/lib/pricing";

const SESSION_COST_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
] as const;

/** Read-time cost of one model entry under its session's source. */
export function sessionModelCostUsd(
  source: string,
  model: Record<string, unknown> | null | undefined,
): number {
  if (!model || typeof model !== "object") return 0;
  const row: Record<string, unknown> = { source, model: model.model };

  for (const key of SESSION_COST_KEYS) row[key] = numberOr0(model[key]);

  return computeRowCost(row);
}

/** Sum of the per-model read-time costs of one session row. */
export function sessionCostUsd(source: string, rawModels: unknown): number {
  if (!Array.isArray(rawModels)) return 0;
  let sum = 0;

  for (const raw of rawModels) {
    sum += sessionModelCostUsd(
      source,
      raw as Record<string, unknown> | null | undefined,
    );
  }

  return sum;
}
