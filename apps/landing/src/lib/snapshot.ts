// 快照数据（生成物，勿手改）：部署构建时由 scripts/sync-snapshot.mjs 从
// GET /api/badge/data?token=… 拉取改写（README 已公开链接）。纯聚合数字 +
// 52 周日桶等级，无行级数据；fetchedAt 为数据窗口右端，Hero 的「截至」日期
// 即取自它，标签不会与数字漂移。展示格式化走 badge 的固定口径（KMB 两位
// 小数），不接用户偏好系统。

import snapshotJson from "@/data/snapshot.json";

export interface SnapshotTotals {
  tokens: number;
  costUsd: number;
  activeDays: number;
}

export interface SnapshotMeta {
  firstDay: string;
  lastDay: string;
  sourceCount: number;
  modelCount: number;
  longestStreakDays: number;
  peakDay: { day: string; tokens: number };
}

export interface SnapshotSource {
  label: string;
  tokens: number;
  share: number;
}

export interface SnapshotModel {
  label: string;
  tokens: number;
}

export interface Snapshot {
  fetchedAt: string;
  totals: SnapshotTotals;
  meta: SnapshotMeta;
  heatmap: {
    from: string;
    to: string;
    activeDays: number;
    /** [day, tokens, level 0-4] triples, week-major (u-page grid order). */
    cells: Array<[string, number, number]>;
  };
  sources: SnapshotSource[];
  models: SnapshotModel[];
  /** Last 30 daily totals (owner timezone). */
  series: number[];
}

export const SNAPSHOT = snapshotJson as Snapshot;

/** Badge 口径的紧凑 token 计数：23.82B / 882.14M / 696.2K（两位小数 KMB）。 */
export function formatCompactTokens(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;

  return String(n);
}

/** 成本按 en-US 货币格式（badge 口径：< $10k 保留分位）。 */
export function formatCost(usd: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(usd);
}

/** 整数千分位（882,141,104）。 */
export function formatGrouped(n: number): string {
  return new Intl.NumberFormat("en-US").format(n);
}
