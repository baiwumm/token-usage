// Token number formatting for the desktop monitor. Fixed zh-CN compact style
// (万 / 亿 via Intl compact notation) — the web's per-user format preferences
// deliberately do not sync across apps (docs/desktop-plan.md §9).

const formatter = new Intl.NumberFormat("zh-CN", {
  notation: "compact",
  maximumFractionDigits: 2,
});

export function formatTokens(tokens: number): string {
  return formatter.format(tokens);
}

const percentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Share 0–1 → "40%" (one fraction digit), for the heatmap tooltip rows. */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

const costFormatter = new Intl.NumberFormat("zh-CN", {
  style: "currency",
  currency: "USD",
  // zh-CN's default symbol is "US$"; the narrow symbol keeps every cost
  // column to "$11.98" like the web's formatCost.
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Read-time USD estimate → "$11.98" (stat cards, charts, dialogs). Same rules
 * as the web's formatCost: two decimals, sub-cent values read "<$0.01" rather
 * than rounding to $0.00.
 */
export function formatCost(valueUsd: number): string {
  const abs = Math.abs(valueUsd);

  if (abs === 0) return costFormatter.format(0);
  if (abs < 0.01) {
    const tiny = costFormatter.format(0.01);

    return valueUsd < 0 ? `-${tiny}` : `<${tiny}`;
  }

  return costFormatter.format(valueUsd);
}

const numberFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 0,
});

/** Grouped count ("5,477") for conversation counts in chart tooltips. */
export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

const creditsFormatter = new Intl.NumberFormat("zh-CN", {
  maximumFractionDigits: 2,
});

/** Vendor credits (e.g. Qoder) — display-only, ≤2 decimals, grouped. */
export function formatCredits(value: number): string {
  return creditsFormatter.format(value);
}

const dateTimeFormatter = new Intl.DateTimeFormat("zh-CN", {
  dateStyle: "medium",
  timeStyle: "short",
});

/** "2026/11/12 09:20" — the sessions list / detail stamps (web formatDateTime). */
export function formatDateTime(iso: string): string {
  const ms = Date.parse(iso);

  return Number.isFinite(ms) ? dateTimeFormatter.format(ms) : "—";
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes;
  let unit = -1;

  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);

  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[unit]}`;
}

/** Relative "3 小时前" stamp for the recent-sessions rows. */
export function formatRelativeTime(
  iso: string,
  nowMs: number = Date.now(),
): string {
  const ms = Date.parse(iso);

  if (!Number.isFinite(ms)) return "";
  const minutes = Math.floor(Math.max(0, nowMs - ms) / 60_000);

  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);

  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);

  if (days < 30) return `${days} 天前`;

  return new Date(ms).toLocaleDateString("zh-CN");
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;

  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);

  return `${minutes}m ${rest}s`;
}
