// Render-input types for the public badge (docs/badge.md §4.6). These flow
// server-side only: renderers and endpoints never see tokens, hashes or user
// ids — aggregates in, SVG out.

export type BadgeStyle = "panel" | "compact" | "sparkline";
export type BadgeTheme = "dark" | "light" | "auto";
export type BadgeRange = "all" | "30d";

export interface BadgeTotals {
  tokens: number;
  costUsd: number;
  activeDays: number;
}
export interface BadgeSource {
  key: string;
  label: string;
  tokens: number;
  share: number; // 0..1
}
export interface BadgeModel {
  key: string;
  label: string;
  tokens: number;
}

export interface BadgeData {
  scope: "user" | "repo";
  project: string | null; // repo 时为展示用 project_key（归一后、展示截断前原值）
  displayName: string; // 行内快照；空串由渲染器回退（§5.2）
  /**
   * Owner avatar as an inline `data:` URI (§5.2, 2026-11-02). The SVG is
   * served inside <img>, where external references are blocked, so the image
   * must travel in the bytes; absent → initials circle.
   */
  avatarDataUri?: string | null;
  range: BadgeRange;
  totals: BadgeTotals;
  sources: BadgeSource[]; // tokens 降序
  models: BadgeModel[]; // tokens 降序，≤5
  series: number[]; // 最近 30 个自然日日用量（所有者时区，升序）；可为空
}

export interface RenderOptions {
  style: BadgeStyle;
  theme: BadgeTheme;
}
