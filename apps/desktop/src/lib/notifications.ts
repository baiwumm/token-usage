// Notification decisions (desktop-plan D4). Pure: given the monitor snapshot,
// the user's preferences and the previous decision state, it says which
// notifications are due and how the state moves on. The hook only sends and
// persists — so every rule (quiet hours, once-per-day, once-per-streak,
// once-until-recovered) is testable without a webview.
//
// Quiet hours suppress *sending*, never mark anything as sent: a summary
// that came due inside the window fires as soon as the window ends (and, for
// a window spanning midnight, at the next day's chosen hour — the day it
// would have summarized is gone), while a failure/backlog alert raised
// during the window appears the moment it ends.

import type { MonitorSnapshot } from "@/lib/monitor";
import type { Preferences } from "@/lib/preferences";

import { formatBytes, formatTokens } from "@/lib/format-tokens";

export interface NotificationState {
  /** Local date key (`YYYY-MM-DD`) of the last daily summary. */
  lastDailyDate: string | null;
  /** Failure streak already announced; 0 = nothing announced. */
  failureNotifiedStreak: number;
  /** Backlog announced and not yet back under the threshold. */
  backlogNotified: boolean;
}

export const INITIAL_NOTIFICATION_STATE: NotificationState = {
  lastDailyDate: null,
  failureNotifiedStreak: 0,
  backlogNotified: false,
};

export const NOTIFICATION_STATE_KEY = "tokenusage.desktop.notifications";

export function loadNotificationState(storage?: Storage): NotificationState {
  const target = storage ?? safeStorage();

  try {
    const raw = target?.getItem(NOTIFICATION_STATE_KEY);

    if (!raw) return { ...INITIAL_NOTIFICATION_STATE };
    const parsed: unknown = JSON.parse(raw);

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      Array.isArray(parsed)
    ) {
      return { ...INITIAL_NOTIFICATION_STATE };
    }
    const source = parsed as Partial<Record<keyof NotificationState, unknown>>;

    return {
      lastDailyDate:
        typeof source.lastDailyDate === "string" ? source.lastDailyDate : null,
      failureNotifiedStreak:
        typeof source.failureNotifiedStreak === "number" &&
        Number.isFinite(source.failureNotifiedStreak) &&
        source.failureNotifiedStreak >= 0
          ? source.failureNotifiedStreak
          : 0,
      backlogNotified: source.backlogNotified === true,
    };
  } catch {
    return { ...INITIAL_NOTIFICATION_STATE };
  }
}

export function saveNotificationState(
  state: NotificationState,
  storage?: Storage,
): void {
  try {
    (storage ?? safeStorage())?.setItem(
      NOTIFICATION_STATE_KEY,
      JSON.stringify(state),
    );
  } catch {
    // Storage unavailable — dedupe only lasts this session.
  }
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export type NotificationKey = "daily" | "failure" | "backlog";

export interface DesktopNotification {
  key: NotificationKey;
  title: string;
  body: string;
}

export function localDateKey(nowMs: number): string {
  const date = new Date(nowMs);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Is `nowMs` inside the quiet window [start, end) in local hours? Windows
 * wrap midnight (22 → 8); equal ends mean "no window" rather than all day.
 */
export function isQuietHour(
  nowMs: number,
  startHour: number,
  endHour: number,
): boolean {
  if (startHour === endHour) return false;
  const hour = new Date(nowMs).getHours();

  return startHour < endHour
    ? hour >= startHour && hour < endHour
    : hour >= startHour || hour < endHour;
}

function dailyDue(
  prefs: Preferences,
  nowMs: number,
  state: NotificationState,
): boolean {
  return (
    prefs.dailySummary &&
    new Date(nowMs).getHours() >= prefs.dailySummaryHour &&
    state.lastDailyDate !== localDateKey(nowMs)
  );
}

export function decideNotifications({
  prefs,
  snapshot,
  nowMs,
  state,
}: {
  prefs: Preferences;
  snapshot: MonitorSnapshot;
  nowMs: number;
  state: NotificationState;
}): { notifications: DesktopNotification[]; state: NotificationState } {
  const next: NotificationState = { ...state };
  const notifications: DesktopNotification[] = [];
  const quiet =
    prefs.quietHours &&
    isQuietHour(nowMs, prefs.quietStartHour, prefs.quietEndHour);

  if (!quiet && dailyDue(prefs, nowMs, state)) {
    const { totalTokens, conversations } = snapshot.today;

    notifications.push({
      key: "daily",
      title: "今日用量汇总",
      body: `今日 ${formatTokens(totalTokens)} tokens · ${conversations} 个会话`,
    });
    next.lastDailyDate = localDateKey(nowMs);
  }

  if (prefs.failureAlerts) {
    const { failureStreak, failureMessage } = snapshot;

    if (failureStreak < prefs.failureThreshold) {
      // Recovered (or not yet a streak) — the next streak alerts again.
      next.failureNotifiedStreak = 0;
    } else if (!quiet && next.failureNotifiedStreak !== failureStreak) {
      notifications.push({
        key: "failure",
        title: `连续 ${failureStreak} 次同步失败`,
        body: failureMessage ?? "本地采集可能已中断，检查 CLI 输出与网络后重试",
      });
      next.failureNotifiedStreak = failureStreak;
    }
  } else {
    next.failureNotifiedStreak = 0;
  }

  if (!prefs.backlogAlerts || snapshot.pendingBytes < prefs.backlogBytes) {
    next.backlogNotified = false;
  } else if (!quiet && !next.backlogNotified) {
    notifications.push({
      key: "backlog",
      title: "上传队列积压",
      body: `待上传 ${formatBytes(snapshot.pendingBytes)}（阈值 ${formatBytes(prefs.backlogBytes)}），云端数据可能偏旧`,
    });
    next.backlogNotified = true;
  }

  return { notifications, state: next };
}
