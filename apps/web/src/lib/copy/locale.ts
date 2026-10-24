"use client";

// Lightweight zh/en copy pipeline (docs/rewrite-plan.md 决策 11): typed
// dictionaries per page + a localStorage-backed locale hook. All useLocale()
// instances share one module-level state so a switch in the app shell
// re-renders every mounted page (no i18n framework).

import { useCallback, useEffect, useState } from "react";

export type Locale = "zh" | "en";

export const LOCALES: Locale[] = ["zh", "en"];

const STORAGE_KEY = "token-usage.locale";

let current: Locale | null = null;
let resolved = false;
const listeners = new Set<() => void>();

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

function ensureResolved(): void {
  if (resolved) return;
  resolved = true;
  let stored: string | null = null;

  try {
    stored = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    // storage unavailable (private mode) — fall through to navigator
  }
  current = resolveLocale(stored, window.navigator.language);
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** Pick a dictionary entry; the zh/en keys must stay in sync. */
export function copyFor<T extends Record<string, string>>(
  dictionary: Record<Locale, T>,
  locale: Locale,
): T {
  return dictionary[locale];
}

/**
 * Shared zh/en toggle state, persisted; defaults follow the browser language.
 * Every mount subscribes to the same module state, so one switch updates the
 * whole app. First paint stays "zh" for SSR/CSR consistency; the resolved
 * value is adopted right after mount (same flash-for-en-users as before).
 */
export function useLocale(): [Locale, (locale: Locale) => void] {
  const [locale, setLocale] = useState<Locale>("zh");

  useEffect(() => {
    ensureResolved();
    setLocale(current ?? "zh");
    const listener = () => setLocale(current ?? "zh");

    listeners.add(listener);

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const update = useCallback((next: Locale) => {
    current = next;
    resolved = true;

    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // best effort only
    }
    emit();
  }, []);

  return [locale, update];
}

export type Dictionary = Record<Locale, Record<string, string>>;
