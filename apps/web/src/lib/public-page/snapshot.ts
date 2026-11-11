// Aggregate snapshot projection for GET /api/badge/data (docs/badge.md §2.4).
// Pure: the loader supplies the same PublicPageData the /u page renders, so the
// static marketing site can never drift from the public page. Only aggregates
// leave here — no avatar, no user id, no token (§2.4.4).

import type { PublicPageData } from "./types";

export const SNAPSHOT_SCHEMA_VERSION = 1;

/** [day, tokens, level 0-4], week-major like the public page grid. */
export type SnapshotCell = [day: string, tokens: number, level: number];

export interface PublicSnapshot {
  schemaVersion: number;
  /** Right edge of the heatmap window, i.e. "today" in the owner timezone. */
  fetchedAt: string;
  updatedAt: string | null;
  totals: { tokens: number; costUsd: number; activeDays: number };
  meta: {
    firstDay: string | null;
    lastDay: string | null;
    sourceCount: number;
    modelCount: number;
    longestStreakDays: number;
    peakDay: { day: string; tokens: number } | null;
  };
  heatmap: {
    from: string;
    to: string;
    activeDays: number;
    cells: SnapshotCell[];
  };
  sources: Array<{ label: string; tokens: number; share: number }>;
  models: Array<{ label: string; tokens: number }>;
  series: number[];
}

const TOP_ROWS = 5;

function round(value: number, digits: number): number {
  const factor = 10 ** digits;

  return Math.round(value * factor) / factor;
}

export function buildPublicSnapshot(data: PublicPageData): PublicSnapshot {
  const cells: SnapshotCell[] = [];

  for (const week of data.heatmap.weeks) {
    for (const cell of week) {
      cells.push([cell.day, cell.billable_total_tokens, cell.level]);
    }
  }

  return {
    schemaVersion: SNAPSHOT_SCHEMA_VERSION,
    fetchedAt: data.heatmap.to,
    updatedAt: data.meta.updatedAt,
    totals: {
      tokens: data.account.totals.tokens,
      costUsd: round(data.account.totals.costUsd, 2),
      activeDays: data.account.totals.activeDays,
    },
    meta: {
      firstDay: data.meta.firstDay,
      lastDay: data.meta.lastDay,
      sourceCount: data.meta.sourceCount,
      modelCount: data.meta.modelCount,
      longestStreakDays: data.meta.longestStreakDays,
      peakDay: data.meta.peakDay,
    },
    heatmap: {
      from: data.heatmap.from,
      to: data.heatmap.to,
      activeDays: data.heatmap.active_days,
      cells,
    },
    // BadgeData already caps both lists at five rows (§4.6); re-slicing keeps
    // this projection honest if that cap moves.
    sources: data.account.sources.slice(0, TOP_ROWS).map((source) => ({
      label: source.label,
      tokens: source.tokens,
      share: round(source.share, 4),
    })),
    models: data.account.models
      .slice(0, TOP_ROWS)
      .map((model) => ({ label: model.label, tokens: model.tokens })),
    series: [...data.account.series],
  };
}
