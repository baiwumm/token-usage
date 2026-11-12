// Data contract for the canvas share cards (web 同款移植, desktop-plan
// §12.13). The dialog projects the local monitor snapshot into this shape;
// the variants draw from it and nothing else. Privacy: aggregated numbers
// only, no row-level data.

export type ShareCardVariant = "broadsheet" | "receipt" | "neon" | "vinyl";

export interface ShareCardListRow {
  name: string;
  /** Compact-formatted count for the compact variants. */
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
  /** Period shown next to the masthead: a formatted range or "2026". */
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
  /** Small caption near the byline — the desktop passes its UTC offset. */
  tickLabel: string | null;
  /** Kept for shape parity with the web input; the desktop is zh-only. */
  locale: "zh" | "en";
}
