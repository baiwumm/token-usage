"use client";

// Format preference store (zustand + persist, 2026-10-25 second-round deps).
// Owns the localStorage round-trip that used to live inline in format.tsx.
// The pre-zustand flat keys (token-usage.currency, …) are migrated once on
// first read and removed afterwards; new writes go to a single JSON key.

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import {
  DEFAULT_FORMAT_PREFERENCES,
  FORMAT_STORAGE_KEYS,
  sanitizePreferences,
  type FormatPreferences,
} from "@/lib/format/core";

const STORAGE_KEY = "token-usage.format-preferences";

interface PersistedFormatState {
  preferences: FormatPreferences;
}

interface FormatPreferenceState {
  preferences: FormatPreferences;
  setPreference: <K extends keyof FormatPreferences>(
    key: K,
    value: FormatPreferences[K],
  ) => void;
  resetPreferences: () => void;
}

type LegacyKey = (typeof FORMAT_STORAGE_KEYS)[keyof typeof FORMAT_STORAGE_KEYS];

function readLegacyFlatKeys(): FormatPreferences | null {
  try {
    const currency = window.localStorage.getItem(
      FORMAT_STORAGE_KEYS.currency as LegacyKey,
    );
    const grouping = window.localStorage.getItem(
      FORMAT_STORAGE_KEYS.tokenGrouping as LegacyKey,
    );

    if (
      currency == null &&
      window.localStorage.getItem(
        FORMAT_STORAGE_KEYS.tokenDisplay as LegacyKey,
      ) == null
    ) {
      return null;
    }

    return sanitizePreferences({
      currency,
      tokenDisplay: window.localStorage.getItem(
        FORMAT_STORAGE_KEYS.tokenDisplay as LegacyKey,
      ),
      tokenUnit: window.localStorage.getItem(
        FORMAT_STORAGE_KEYS.tokenUnit as LegacyKey,
      ),
      tokenGrouping: grouping === "4" ? 4 : grouping === "3" ? 3 : undefined,
    });
  } catch {
    return null;
  }
}

function clearLegacyFlatKeys(): void {
  try {
    for (const key of Object.values(FORMAT_STORAGE_KEYS)) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // best effort
  }
}

// Raw string storage per zustand's StateStorage contract; JSON encoding is
// handled here so the legacy migration can synthesize a payload.
const legacyMigratingStorage = {
  getItem: (name: string): string | null => {
    const raw = window.localStorage.getItem(name);

    if (raw != null) return raw;

    const legacy = readLegacyFlatKeys();

    if (legacy) {
      clearLegacyFlatKeys();

      return JSON.stringify({
        preferences: legacy,
      } satisfies PersistedFormatState);
    }

    return null;
  },
  setItem: (name: string, value: string): void => {
    window.localStorage.setItem(name, value);
  },
  removeItem: (name: string): void => {
    window.localStorage.removeItem(name);
    clearLegacyFlatKeys();
  },
};

export const useFormatPreferenceStore = create<FormatPreferenceState>()(
  persist(
    (set) => ({
      preferences: DEFAULT_FORMAT_PREFERENCES,
      setPreference: (key, value) =>
        set((state) => ({
          preferences: sanitizePreferences({
            ...state.preferences,
            [key]: value,
          }),
        })),
      resetPreferences: () => set({ preferences: DEFAULT_FORMAT_PREFERENCES }),
    }),
    {
      name: STORAGE_KEY,
      storage: createJSONStorage(() => legacyMigratingStorage),
      version: 3,
      partialize: (state) => ({ preferences: state.preferences }),
      // v2 adds preferences.font; v3 adds preferences.dateFormat. Re-sanitize
      // so payloads persisted by older versions (without those fields) fall
      // back to the defaults instead of undefined.
      migrate: (persisted) => {
        const state = persisted as Partial<PersistedFormatState> | undefined;

        return {
          preferences: sanitizePreferences(state?.preferences ?? {}),
        } satisfies PersistedFormatState;
      },
    },
  ),
);
