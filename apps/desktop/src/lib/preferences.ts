// Desktop preferences (desktop-plan D4). Kept in localStorage only: nothing
// leaves the machine, the CLI's config.json is never written (§3 boundary 1),
// and the web's per-user settings deliberately do not sync here (§9).
//
// Normalization is defensive: a hand-edited or half-written value must never
// wedge the panel, so every field falls back to its default and numbers are
// clamped to the ranges the UI offers.

export type ThemeMode = "system" | "light" | "dark";

/** Window used by the mix cards (source / model / project). */
export type UsagePeriod = "today" | "7d";

export interface Preferences {
  theme: ThemeMode;
  /** Mix-card period; the summary tiles stay today / 7 days regardless. */
  period: UsagePeriod;
  /** Daily summary notification (today's local tokens). */
  dailySummary: boolean;
  /** Local hour 0–23 at which the daily summary fires. */
  dailySummaryHour: number;
  /** Alert after N consecutive failed syncs. */
  failureAlerts: boolean;
  failureThreshold: number;
  /** Alert when the un-uploaded queue grows past `backlogBytes`. */
  backlogAlerts: boolean;
  backlogBytes: number;
  /** Suppress every notification inside [start, end) local hours. */
  quietHours: boolean;
  quietStartHour: number;
  quietEndHour: number;
  /** Mirrors the OS autostart registration (plugin is the source of truth). */
  autostart: boolean;
}

export const STORAGE_KEY = "tokenusage.desktop.preferences";
export const MIB = 1024 * 1024;

export const FAILURE_THRESHOLD_OPTIONS = [2, 3, 5] as const;
/** One day of a healthy hourly queue is well under this. */
export const BACKLOG_BYTES_OPTIONS = [10 * MIB, 20 * MIB, 50 * MIB, 100 * MIB];

export const DEFAULT_PREFERENCES: Preferences = {
  theme: "system",
  period: "7d",
  dailySummary: true,
  dailySummaryHour: 21,
  failureAlerts: true,
  failureThreshold: 3,
  backlogAlerts: true,
  backlogBytes: 20 * MIB,
  quietHours: false,
  quietStartHour: 22,
  quietEndHour: 8,
  autostart: false,
};

const THEMES: readonly ThemeMode[] = ["system", "light", "dark"];
const PERIODS: readonly UsagePeriod[] = ["today", "7d"];

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function asHour(value: unknown, fallback: number): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 23
    ? value
    : fallback;
}

function asFailureThreshold(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 2 &&
    value <= 10
    ? value
    : DEFAULT_PREFERENCES.failureThreshold;
}

function asBacklogBytes(value: unknown): number {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= MIB &&
    value <= 1024 * MIB
    ? value
    : DEFAULT_PREFERENCES.backlogBytes;
}

export function normalizePreferences(raw: unknown): Preferences {
  const source = (
    raw !== null && typeof raw === "object" && !Array.isArray(raw) ? raw : {}
  ) as Partial<Record<keyof Preferences, unknown>>;
  const theme = THEMES.includes(source.theme as ThemeMode)
    ? (source.theme as ThemeMode)
    : DEFAULT_PREFERENCES.theme;
  const period = PERIODS.includes(source.period as UsagePeriod)
    ? (source.period as UsagePeriod)
    : DEFAULT_PREFERENCES.period;

  return {
    theme,
    period,
    dailySummary: asBoolean(
      source.dailySummary,
      DEFAULT_PREFERENCES.dailySummary,
    ),
    dailySummaryHour: asHour(
      source.dailySummaryHour,
      DEFAULT_PREFERENCES.dailySummaryHour,
    ),
    failureAlerts: asBoolean(
      source.failureAlerts,
      DEFAULT_PREFERENCES.failureAlerts,
    ),
    failureThreshold: asFailureThreshold(source.failureThreshold),
    backlogAlerts: asBoolean(
      source.backlogAlerts,
      DEFAULT_PREFERENCES.backlogAlerts,
    ),
    backlogBytes: asBacklogBytes(source.backlogBytes),
    quietHours: asBoolean(source.quietHours, DEFAULT_PREFERENCES.quietHours),
    quietStartHour: asHour(
      source.quietStartHour,
      DEFAULT_PREFERENCES.quietStartHour,
    ),
    quietEndHour: asHour(source.quietEndHour, DEFAULT_PREFERENCES.quietEndHour),
    autostart: asBoolean(source.autostart, DEFAULT_PREFERENCES.autostart),
  };
}

/** Mix-card period label shared by the filter and the card descriptions. */
export function periodLabel(period: UsagePeriod): string {
  return period === "today" ? "今日" : "近 7 天";
}

/** `21` → `21:00` for the hour selects and notification copy. */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** 跟随系统 → 浅色 → 深色 → 跟随系统（web 与桌面同一循环）。 */
export function nextTheme(mode: ThemeMode): ThemeMode {
  const index = THEMES.indexOf(mode);

  return THEMES[(index + 1) % THEMES.length] ?? "system";
}

export function loadPreferences(storage?: Storage): Preferences {
  const target = storage ?? safeStorage();

  if (!target) {
    return { ...DEFAULT_PREFERENCES };
  }
  try {
    const raw = target.getItem(STORAGE_KEY);

    return raw === null
      ? { ...DEFAULT_PREFERENCES }
      : normalizePreferences(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_PREFERENCES };
  }
}

export function savePreferences(prefs: Preferences, storage?: Storage): void {
  const target = storage ?? safeStorage();

  try {
    target?.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Quota or disabled storage — the in-memory value still drives this run.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}
