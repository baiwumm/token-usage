"use client";

// Dashboard refresh preference (2026-10-27 operator call): both controls
// default to off — the dashboard has a manual refresh button, so auto traffic
// is opt-in. Per browser only, same zustand + persist pattern as the budget
// store.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const STORAGE_KEY = "token-usage.refresh";

export const REFRESH_INTERVAL_MAX = 60;
export const REFRESH_INTERVAL_STEP = 5;

interface PersistedRefreshState {
  refreshOnVisible: boolean;
  /** Minutes between refresh ticks; 0 disables the timer. */
  intervalMinutes: number;
}

interface RefreshState extends PersistedRefreshState {
  setRefreshOnVisible: (value: boolean) => void;
  setIntervalMinutes: (value: number) => void;
}

function sanitizeInterval(value: unknown): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) return 0;

  const clamped = Math.min(
    REFRESH_INTERVAL_MAX,
    Math.max(0, Math.round(parsed)),
  );

  // Only the slider's five-minute steps are valid — a hand-edited
  // localStorage value must not start a 3-minute timer.
  return Math.round(clamped / REFRESH_INTERVAL_STEP) * REFRESH_INTERVAL_STEP;
}

export const useRefreshPreferencesStore = create<RefreshState>()(
  persist(
    (set) => ({
      refreshOnVisible: false,
      intervalMinutes: 0,
      setRefreshOnVisible: (value) => set({ refreshOnVisible: value === true }),
      setIntervalMinutes: (value) =>
        set({ intervalMinutes: sanitizeInterval(value) }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => window.localStorage),
      version: 1,
      partialize: (state) => ({
        refreshOnVisible: state.refreshOnVisible,
        intervalMinutes: state.intervalMinutes,
      }),
      migrate: (persisted) => {
        const state = persisted as Partial<PersistedRefreshState> | undefined;

        return {
          refreshOnVisible: state?.refreshOnVisible === true,
          intervalMinutes: sanitizeInterval(state?.intervalMinutes),
        };
      },
    },
  ),
);
