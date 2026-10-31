"use client";

// Client-side format preferences (docs/ui-spec.md 语言、主题与偏好持久化):
// currency / token display / unit / grouping / date order persist through the
// zustand store (stores/format-preferences-store.ts); the locale comes from LocaleProvider and the
// FX snapshot from the server layout. Components consume the bound helpers so
// no formatter details leak into UI.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  BUILT_IN_FX,
  formatCost,
  formatCredits,
  formatDate,
  formatDateTime,
  formatDuration,
  formatFxRate,
  formatMonth,
  formatNumber,
  formatPercent,
  formatRelativeTime,
  formatTokens,
  type FormatPreferences,
  type FxSnapshot,
} from "./core";

import { useLocale } from "@/lib/copy/locale";
import { useFormatPreferenceStore } from "@/stores/format-preferences-store";

interface FormatContextValue {
  preferences: FormatPreferences;
  fx: FxSnapshot;
  mounted: boolean;
  setPreference: <K extends keyof FormatPreferences>(
    key: K,
    value: FormatPreferences[K],
  ) => void;
  resetPreferences: () => void;
  formatTokens: (value: unknown) => string;
  formatNumber: (value: unknown) => string;
  formatCredits: (value: unknown) => string;
  formatPercent: (ratio: unknown) => string;
  formatCost: (valueUsd: unknown) => string;
  formatDuration: (valueMs: unknown) => string;
  formatDate: (
    value: string | Date | null | undefined,
    options?: Intl.DateTimeFormatOptions,
  ) => string;
  formatDateTime: (value: string | Date | null | undefined) => string;
  formatRelativeTime: (value: string | Date | null | undefined) => string;
  formatMonth: (monthKey: string) => string;
  formatFxRate: (currency?: string) => string;
}

const FormatContext = createContext<FormatContextValue | null>(null);

export function FormatProvider({
  children,
  fx = BUILT_IN_FX,
}: {
  children: ReactNode;
  fx?: FxSnapshot;
}) {
  const [locale] = useLocale();
  const storePreferences = useFormatPreferenceStore(
    (state) => state.preferences,
  );
  const setStorePreference = useFormatPreferenceStore(
    (state) => state.setPreference,
  );
  const resetStorePreferences = useFormatPreferenceStore(
    (state) => state.resetPreferences,
  );
  const [mounted, setMounted] = useState(false);

  // SSR renders the defaults; re-render with the persisted values after
  // hydration so server and first client markup agree.
  useEffect(() => setMounted(true), []);

  const preferences = mounted
    ? storePreferences
    : useFormatPreferenceStore.getInitialState().preferences;

  const setPreference = useCallback(
    <K extends keyof FormatPreferences>(key: K, value: FormatPreferences[K]) =>
      setStorePreference(key, value),
    [setStorePreference],
  );
  const resetPreferences = useCallback(
    () => resetStorePreferences(),
    [resetStorePreferences],
  );

  const value = useMemo<FormatContextValue>(
    () => ({
      preferences,
      fx,
      mounted,
      setPreference,
      resetPreferences,
      formatTokens: (value) => formatTokens(value, preferences, locale),
      formatNumber: (value) =>
        formatNumber(value, locale, preferences.tokenGrouping),
      formatCredits: (value) => formatCredits(value, locale),
      formatPercent: (ratio) => formatPercent(ratio, locale),
      formatCost: (valueUsd) => formatCost(valueUsd, preferences, locale, fx),
      formatDuration: (valueMs) => formatDuration(valueMs, locale),
      formatDate: (value, options) =>
        formatDate(value, locale, options, preferences.dateFormat),
      formatDateTime: (value) =>
        formatDateTime(value, locale, preferences.dateFormat),
      formatRelativeTime: (value) => formatRelativeTime(value, locale),
      formatMonth: (monthKey) => formatMonth(monthKey, locale),
      formatFxRate: (currency) =>
        formatFxRate(currency ?? preferences.currency, fx, locale),
    }),
    [preferences, fx, mounted, locale, resetPreferences, setPreference],
  );

  return (
    <FormatContext.Provider value={value}>{children}</FormatContext.Provider>
  );
}

export function useFormat(): FormatContextValue {
  const value = useContext(FormatContext);

  if (!value) {
    throw new Error("useFormat must be used within FormatProvider");
  }

  return value;
}
