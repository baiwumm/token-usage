// Delivery for D4 notifications: decide (pure, lib/notifications.ts) → send
// through the notification plugin → persist the dedupe state. Checks run on
// every snapshot refresh plus a 30 s tick, so a due summary or a streak that
// started while the window was hidden still surfaces promptly.
//
// The window keeps running when closed to tray, which is what makes this a
// sufficient scheduler for D4; Rust-side scheduling stays out of scope.

import type { MonitorSnapshot } from "@/lib/monitor";
import type { Preferences } from "@/lib/preferences";
import type {
  DesktopNotification,
  NotificationState,
} from "@/lib/notifications";

import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { useEffect, useRef } from "react";

import {
  decideNotifications,
  loadNotificationState,
  saveNotificationState,
} from "@/lib/notifications";

const CHECK_MS = 30_000;

async function deliver(notification: DesktopNotification): Promise<void> {
  let granted = await isPermissionGranted();

  if (!granted) {
    granted = (await requestPermission()) === "granted";
  }
  if (!granted) return;
  sendNotification({
    title: notification.title,
    body: notification.body,
  });
}

export function useDesktopNotifications({
  prefs,
  snapshot,
}: {
  prefs: Preferences;
  /** Null until the first local read lands. */
  snapshot: MonitorSnapshot | null;
}): void {
  const stateRef = useRef<NotificationState>(loadNotificationState());
  const inFlight = useRef(false);
  const enabled =
    prefs.dailySummary || prefs.failureAlerts || prefs.backlogAlerts;

  useEffect(() => {
    if (!enabled || snapshot === null) return;
    let cancelled = false;

    const tick = async () => {
      if (cancelled || inFlight.current) return;
      inFlight.current = true;
      try {
        const { notifications, state } = decideNotifications({
          prefs,
          snapshot,
          nowMs: Date.now(),
          state: stateRef.current,
        });

        // Persist before sending: a crash between the two must not re-fire the
        // same alert on the next launch.
        stateRef.current = state;
        saveNotificationState(state);
        for (const notification of notifications) {
          await deliver(notification).catch(() => undefined);
        }
      } catch {
        // A failed check is not worth surfacing — the next tick retries.
      } finally {
        inFlight.current = false;
      }
    };

    void tick();
    const timer = window.setInterval(() => void tick(), CHECK_MS);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [enabled, prefs, snapshot]);
}
