// On-demand drill-down for the project detail dialog: folds the deduped
// queue rows of one repository's member keys into the KPI / daily / source
// series the dialog shows. Runs per open (dialog-local), not in the snapshot
// — the list row and this fold read the same rows, so numbers can never
// disagree (hourly caliber, same as the card: 「会话条目」 semantics).

import type { QueueBucketRow } from "@/lib/queue-lines";

import { canonicalSource, sourceDisplayLabel } from "@/lib/source-logos";
import { localDayKey, rowCostUsd } from "@/lib/queue-lines";

export interface ProjectDetailSource {
  /** Canonical source id. */
  id: string;
  /** Display label (规范名) for the row. */
  label: string;
  tokens: number;
  conversations: number;
  costUsd: number;
  share: number;
}

export interface ProjectDetailDay {
  day: string;
  tokens: number;
  costUsd: number;
  conversations: number;
}

export interface ProjectDetail {
  totalTokens: number;
  totalCostUsd: number;
  /** Bucket conversation counts summed (「会话条目」 hourly caliber). */
  conversations: number;
  inputTokens: number;
  cachedTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  credits: number;
  /** Local days with any usage inside the window. */
  daysActive: number;
  /** Average tokens per active day (0 when none). */
  avgPerActiveDay: number;
  /** Busiest local day of the window (web 其他字段「日峰值」). */
  peakDay: { day: string; tokens: number } | null;
  daily: ProjectDetailDay[];
  sources: ProjectDetailSource[];
  lastActiveMs: number | null;
}

const DETAIL_DAYS_CAP = 60;

/**
 * Fold the member keys' rows inside `[windowStartMs, nowMs]`. The daily
 * series keeps the newest `DETAIL_DAYS_CAP` days (windows longer than two
 * months would render an unreadable bar chart; the KPI totals stay whole-
 * window regardless of the cap).
 */
export function buildProjectDetail(
  rows: QueueBucketRow[],
  memberKeys: readonly string[],
  windowStartMs: number,
  nowMs: number,
): ProjectDetail {
  const keys = new Set(memberKeys);
  const byDay = new Map<
    string,
    { day: string; tokens: number; costUsd: number; conversations: number }
  >();
  const bySource = new Map<
    string,
    {
      id: string;
      label: string;
      tokens: number;
      conversations: number;
      costUsd: number;
    }
  >();
  const detail: ProjectDetail = {
    totalTokens: 0,
    totalCostUsd: 0,
    conversations: 0,
    inputTokens: 0,
    cachedTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
    credits: 0,
    daysActive: 0,
    avgPerActiveDay: 0,
    peakDay: null,
    daily: [],
    sources: [],
    lastActiveMs: null,
  };

  for (const row of rows) {
    if (!keys.has(row.projectKey)) continue;
    const startMs = Date.parse(row.hourStart);

    if (
      !Number.isFinite(startMs) ||
      startMs < windowStartMs ||
      startMs > nowMs
    ) {
      continue;
    }
    detail.totalTokens += row.totalTokens;
    detail.totalCostUsd += rowCostUsd(row);
    detail.conversations += row.conversationCount;
    detail.inputTokens += row.inputTokens;
    detail.cachedTokens += row.cachedInputTokens + row.cacheCreationInputTokens;
    detail.outputTokens += row.outputTokens;
    detail.reasoningTokens += row.reasoningOutputTokens;
    detail.credits += row.credits;
    if (
      detail.lastActiveMs === null ||
      (Number.isFinite(startMs) && startMs > detail.lastActiveMs)
    ) {
      detail.lastActiveMs = startMs;
    }

    const day = localDayKey(startMs);
    const dayEntry = byDay.get(day) ?? {
      day,
      tokens: 0,
      costUsd: 0,
      conversations: 0,
    };

    dayEntry.tokens += row.totalTokens;
    dayEntry.costUsd += rowCostUsd(row);
    dayEntry.conversations += row.conversationCount;
    byDay.set(day, dayEntry);

    const id = canonicalSource(row.source);
    const sourceEntry = bySource.get(id) ?? {
      id,
      label: sourceDisplayLabel(row.source),
      tokens: 0,
      conversations: 0,
      costUsd: 0,
    };

    sourceEntry.tokens += row.totalTokens;
    sourceEntry.conversations += row.conversationCount;
    sourceEntry.costUsd += rowCostUsd(row);
    bySource.set(id, sourceEntry);
  }

  detail.daysActive = byDay.size;
  detail.avgPerActiveDay =
    detail.daysActive > 0 ? detail.totalTokens / detail.daysActive : 0;
  const peak = [...byDay.values()].reduce<ProjectDetailDay | null>(
    (best, day) => (best == null || day.tokens > best.tokens ? day : best),
    null,
  );

  detail.peakDay = peak ? { day: peak.day, tokens: peak.tokens } : null;
  detail.daily = [...byDay.values()]
    .sort((first, second) => first.day.localeCompare(second.day))
    .slice(-DETAIL_DAYS_CAP);
  detail.sources = [...bySource.values()]
    .map((entry) => ({
      ...entry,
      share: detail.totalTokens > 0 ? entry.tokens / detail.totalTokens : 0,
    }))
    .sort((first, second) => second.tokens - first.tokens);

  return detail;
}
