// Read-side aggregation over the model-breakdown payload, shared by the hero
// card, source panel, cost modal, Top models and the heatmap legend. The wire
// keeps raw collector source strings; display grouping happens here via
// canonicalSource (Pi aliases merge, dsh → label).

import type { ModelBreakdownSource, SeriesPoint } from "@/lib/dashboard/api";

import { ModelDisplayName, modelGroupKey } from "@/lib/model-names";
import { canonicalSource, sourceDisplayLabel } from "@/lib/sources";

export interface CanonicalSourceRow {
  id: string;
  label: string;
  totalTokens: number;
  totalCost: number;
  /** Vendor credits summed across the canonical group (display-only). */
  totalCredits: number;
  models: ModelBreakdownSource["models"];
}

/** Group raw sources by canonical identity, sorted by tokens descending. */
export function canonicalSourceRows(
  sources: ModelBreakdownSource[],
): CanonicalSourceRow[] {
  const byId = new Map<string, CanonicalSourceRow>();

  for (const entry of sources) {
    const id = canonicalSource(entry.source);
    const agg = byId.get(id) ?? {
      id,
      label: sourceDisplayLabel(entry.source),
      totalTokens: 0,
      totalCost: 0,
      totalCredits: 0,
      models: [],
    };

    agg.totalTokens += entry.totals.total_tokens;
    agg.totalCost += Number(entry.totals.total_cost_usd) || 0;
    agg.totalCredits += entry.totals.credits || 0;
    agg.models.push(...entry.models);
    byId.set(id, agg);
  }

  return [...byId.values()].sort((a, b) => b.totalTokens - a.totalTokens);
}

export interface MergedModelRow {
  model: string;
  /** Raw source names the model was reported under. */
  sources: string[];
  totals: {
    total_tokens: number;
    billable_total_tokens: number;
    total_cost_usd: number;
  };
  /** Any source listed the model with tokens but no pricing match. */
  unpriced: boolean;
}

/**
 * Merge same-name model rows across sources (e.g. one model reported by both
 * zcode and opencode) so rankings and their React keys stay unique. Grouping
 * uses the folded key (docs/ui-spec.md 仪表盘 · Top 模型, lib/model-names.ts), so
 * casing drift across collectors never splits one model into two rows. The
 * displayed spelling is the variant carrying the most tokens, matching the
 * server-side ModelDisplayName resolution.
 */
export function mergeModelsAcrossSources(
  sources: ModelBreakdownSource[],
): MergedModelRow[] {
  const byModel = new Map<string, MergedModelRow>();
  const displayNames = new Map<string, ModelDisplayName>();

  for (const source of sources) {
    for (const entry of source.models) {
      const key = modelGroupKey(entry.model);
      const agg = byModel.get(key) ?? {
        model: entry.model,
        sources: [],
        totals: {
          total_tokens: 0,
          billable_total_tokens: 0,
          total_cost_usd: 0,
        },
        unpriced: false,
      };

      agg.totals.total_tokens += entry.totals.total_tokens;
      agg.totals.billable_total_tokens += entry.totals.billable_total_tokens;
      agg.totals.total_cost_usd += Number(entry.totals.total_cost_usd) || 0;
      agg.unpriced =
        agg.unpriced ||
        (entry.pricing.status === "unpriced" && entry.totals.total_tokens > 0);
      if (!agg.sources.includes(source.source)) {
        agg.sources.push(source.source);
      }
      // Token-weighted display name, identical to the server-side resolver:
      // the variant with the largest token sum wins, ties keep the first one.
      const resolver = displayNames.get(key) ?? new ModelDisplayName();

      resolver.add(entry.model, entry.totals.total_tokens);
      displayNames.set(key, resolver);
      agg.model = resolver.resolve();
      byModel.set(key, agg);
    }
  }

  return [...byModel.values()];
}

/** Canonical-id token totals from (source, tokens) pairs, sorted descending. */
export function canonicalTokenTotals(
  entries: Iterable<readonly [source: string, tokens: number]>,
): Array<[id: string, tokens: number]> {
  const totals = new Map<string, number>();

  for (const [source, tokens] of entries) {
    const id = canonicalSource(source);

    totals.set(id, (totals.get(id) ?? 0) + tokens);
  }

  return [...totals.entries()].sort((first, second) => second[1] - first[1]);
}

/**
 * The single day with the most total tokens in a daily series (ties keep the
 * earliest day, so the result is deterministic). Rows without a day key
 * (monthly/hourly rows share the SeriesPoint shape) are ignored; null when
 * the window has no daily rows. Pure client-side read — the daily series is
 * already fetched for the trend/detail cards, so the peak costs no request.
 */
export function peakDay(points: SeriesPoint[]): SeriesPoint | null {
  let best: SeriesPoint | null = null;

  for (const point of points) {
    if (!point.day) continue;
    if (best == null || point.total_tokens > best.total_tokens) {
      best = point;
    }
  }

  return best;
}
