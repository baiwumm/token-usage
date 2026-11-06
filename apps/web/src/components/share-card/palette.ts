// Canvas 2D share-card palette (docs/ui-spec.md Design Tokens exemption):
// fixed print inks, byte-for-byte the originals so exported PNGs do not shift.
// Broadsheet and vinyl share one editorial ink set; receipt is thermal paper
// and keeps its own paper / ink values.

/** Ivory editorial ink set, shared by broadsheet and vinyl. */
export const PAPER = "#f6f2e9";
export const INK = "#221e18";
export const INK_SOFT = "#6c6457";
export const VERMILLION = "#c2402a";

/** Broadsheet (ivory) heatmap ramp. */
export const BROADSHEET_HEATMAP_PALETTE = [
  "#eee7d8",
  "#e8c9a8",
  "#e0996e",
  "#d4694b",
  VERMILLION,
] as const;

/** Vinyl (indigo groove) heatmap ramp. */
export const VINYL_HEATMAP_PALETTE = [
  "rgba(255,255,255,0.06)",
  "#312e81",
  "#4338ca",
  "#6366f1",
  "#818cf8",
] as const;

/** Receipt (thermal paper) has its own paper / ink set. */
export const RECEIPT_PAPER = "#fffdf8";
export const RECEIPT_INK = "#1f1b16";
export const RECEIPT_INK_SOFT = "#8d867a";
export const RECEIPT_STAMP = "#c2402a";
