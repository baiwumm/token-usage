// Data contract for the canvas share cards. Both the dashboard share modal and
// the /wrapped panel project their payloads into this shape; the variants draw
// from it and nothing else. Privacy: aggregated numbers only, no row-level
// data (docs/ui-spec.md 分享卡片).

export type ShareCardVariant = "broadsheet" | "receipt" | "neon" | "vinyl";

export interface ShareCardListRow {
  name: string;
  /** Preference-formatted count (compact by default) for the compact variants. */
  tokens: string;
  /** Full grouped count with separators — the broadsheet roster prints these. */
  tokensFull: string;
  /** Pre-formatted share, e.g. "44.2%". */
  share: string;
}

export interface ShareHeatmapCell {
  /** Day key YYYY-MM-DD (UTC month prefix drives the month grids). */
  day: string;
  /** 0-4 intensity; negative = no data / future. */
  level: number;
}

export interface ShareCardData {
  handle: string;
  /** Period shown next to the masthead: "2026" or a formatted date range. */
  periodLabel: string;
  /** Quotable one-liner derived from the data; null hides the hook. */
  hook: string | null;
  heroTokens: string;
  /** Full grouped count with separators — the broadsheet hero prints this. */
  heroTokensFull: string;
  costLabel: string;
  activeDaysLabel: string;
  sessionsLabel: string | null;
  peakDay: { label: string; tokens: string } | null;
  sources: ShareCardListRow[];
  models: ShareCardListRow[];
  topModelName: string | null;
  topSourceName: string | null;
  heatmap: {
    /** Monday-start weeks of cells (levels 0-4). */
    weeks: ShareHeatmapCell[][];
    streakDays: number;
  } | null;
  /** Small caption near the byline — the dashboard passes its timezone. */
  tickLabel: string | null;
  locale: "zh" | "en";
}
