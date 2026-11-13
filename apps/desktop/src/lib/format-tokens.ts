// Desktop display formatting. Every helper keeps its call signature so the
// 100+ call sites (charts, cards, dialogs, share cards, tray labels and
// notification bodies) need no changes — they read a module-level preference
// snapshot set by usePreferences. Tray/toast text lives outside the React tree,
// so a Context/Provider (the web's approach) would not reach it.
//
// The rules themselves live in lib/display-format.ts, ported from the web so
// both surfaces agree. Preferences are local-only (desktop-plan §9).

import type { Preferences } from "@/lib/preferences";

import {
  DEFAULT_DISPLAY_FORMAT,
  formatCostWith,
  formatNumberWith,
  formatTokensWith,
  type DisplayFormat,
} from "@/lib/display-format";

let activeFormat: DisplayFormat = { ...DEFAULT_DISPLAY_FORMAT };

/**
 * Sync the formatter with the saved preferences. Called from usePreferences on
 * first load and on every change, before the render that shows new numbers.
 */
export function setFormatPreferences(prefs: Preferences): void {
  activeFormat = {
    currency: prefs.currency,
    tokenDisplay: prefs.tokenDisplay,
    tokenUnit: prefs.tokenUnit,
    tokenGrouping: prefs.tokenGrouping,
  };
}

/** Read-only view for tests and derived helpers. */
export function getFormatPreferences(): DisplayFormat {
  return { ...activeFormat };
}

export function formatTokens(tokens: number): string {
  return formatTokensWith(tokens, activeFormat);
}

const percentFormatter = new Intl.NumberFormat("zh-CN", {
  style: "percent",
  maximumFractionDigits: 1,
});

/** Share 0–1 → "40%" (one fraction digit), for the heatmap tooltip rows. */
export function formatPercent(ratio: number): string {
  return percentFormatter.format(ratio);
}

/**
 * Read-time USD estimate → "$11.98" (stat cards, charts, dialogs). Two
 * decimals, sub-cent values read "<$0.01"; the currency and FX conversion
 * follow the active preference.
 */
export function formatCost(valueUsd: number): string {
  return formatCostWith(valueUsd, activeFormat);
}

/** Grouped count ("5,477") for conversation counts in chart tooltips. */
export function formatNumber(value: number): string {
  return formatNumberWith(value, activeFormat);
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
