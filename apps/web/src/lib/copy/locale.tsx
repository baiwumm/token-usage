"use client";

// Lightweight zh/en copy pipeline (docs/rewrite-plan.md decision 11): typed
// dictionaries per page plus one React context. The root layout seeds the
// locale from the `token-usage.locale` cookie (or Accept-Language), so SSR and
// the first client render agree and <html lang> is correct; switching writes
// the cookie and updates <html lang> immediately. No i18n framework.
//
// The cookie stores the PREFERENCE (`system | zh | en`); `system` resolves to
// a concrete locale from the browser languages at switch time and from
// Accept-Language on the server.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import {
  LOCALE_COOKIE,
  htmlLangFor,
  localeFromAcceptLanguage,
  normalizeLocalePreference,
  type Locale,
  type LocalePreference,
} from "./locale-config";

export type { Locale, LocalePreference } from "./locale-config";

type LocaleContextValue = {
  locale: Locale;
  preference: LocalePreference;
  setPreference: (preference: LocalePreference) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persistPreference(preference: LocalePreference): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";

  document.cookie = `${LOCALE_COOKIE}=${preference}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
}

function navigatorLocale(): Locale {
  if (typeof navigator === "undefined") return "en";

  const languages =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];

  return localeFromAcceptLanguage(languages.filter(Boolean).join(","));
}

export function LocaleProvider({
  children,
  initialLocale,
  initialPreference,
}: {
  children: ReactNode;
  initialLocale: Locale;
  initialPreference: LocalePreference;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [preference, setPreferenceState] = useState<LocalePreference>(
    normalizeLocalePreference(initialPreference),
  );

  const setPreference = useCallback((next: LocalePreference) => {
    const normalized = normalizeLocalePreference(next);
    const resolved = normalized === "system" ? navigatorLocale() : normalized;

    setPreferenceState(normalized);
    setLocale(resolved);
    persistPreference(normalized);
    document.documentElement.lang = htmlLangFor(resolved);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => ({ locale, preference, setPreference }),
    [locale, preference, setPreference],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/**
 * Shared locale state. Every consumer reads the same provider value, so one
 * switch re-renders the whole app; persistence lives in the cookie so the next
 * request renders the right language server-side.
 *
 * The tuple form is kept for existing call sites: `[locale, setPreference]`.
 */
export function useLocale(): readonly [
  Locale,
  (preference: LocalePreference) => void,
] {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return [value.locale, value.setPreference] as const;
}

/** Full preference state for the appearance settings / language menu. */
export function useLocalePreference(): LocaleContextValue {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error("useLocalePreference must be used within LocaleProvider");
  }

  return value;
}
