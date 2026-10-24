"use client";

// Lightweight zh/en copy pipeline (docs/rewrite-plan.md 决策 11): typed
// dictionaries per page + a localStorage-backed locale hook. No i18n
// framework; new pages add a dictionary module and read both languages.

import { useCallback, useEffect, useState } from "react";

export type Locale = "zh" | "en";

export const LOCALES: Locale[] = ["zh", "en"];

const STORAGE_KEY = "token-usage.locale";

export function resolveLocale(
  stored: unknown,
  navigatorLanguage: string | undefined,
): Locale {
  if (stored === "zh" || stored === "en") return stored;
  if (
    typeof navigatorLanguage === "string" &&
    /^zh\b/i.test(navigatorLanguage)
  ) {
    return "zh";
  }

  return "en";
}

/** zh/en toggle state, persisted; defaults follow the browser language. */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const [locale, setLocale] = useState<Locale>("zh");

  useEffect(() => {
    let stored: string | null = null;

    try {
      stored = window.localStorage.getItem(STORAGE_KEY);
    } catch {
      // storage unavailable (private mode) — fall through to navigator
    }
    setLocale(resolveLocale(stored, window.navigator.language));
  }, []);

  const update = useCallback((next: Locale) => {
    setLocale(next);

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best effort only
    }
  }, []);

  return [locale, update];
}

export type Dictionary = Record<Locale, Record<string, string>>;

/** Pick a dictionary entry; the zh/en keys must stay in sync. */
export function copyFor<T extends Record<string, string>>(
  dictionary: Record<Locale, T>,
  locale: Locale,
): T {
  return dictionary[locale];
}
