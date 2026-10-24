"use client";

// Lightweight zh/en copy pipeline (docs/rewrite-plan.md decision 11): typed
// dictionaries per page plus one React context. The root layout seeds the
// locale from the `token-usage.locale` cookie (or Accept-Language), so SSR and
// the first client render agree and <html lang> is correct; switching writes
// the cookie and updates <html lang> immediately. No i18n framework.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { LOCALE_COOKIE, htmlLangFor, type Locale } from "./locale-config";

export type { Locale } from "./locale-config";

type LocaleContextValue = readonly [Locale, (locale: Locale) => void];

const LocaleContext = createContext<LocaleContextValue | null>(null);

const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

function persistLocale(locale: Locale): void {
  const secure = window.location.protocol === "https:" ? "; secure" : "";

  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax${secure}`;
  document.documentElement.lang = htmlLangFor(locale);
}

export function LocaleProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale: Locale;
}) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  const update = useCallback((next: Locale) => {
    setLocale(next);
    persistLocale(next);
  }, []);

  const value = useMemo<LocaleContextValue>(
    () => [locale, update],
    [locale, update],
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

/**
 * Shared zh/en state. Every consumer reads the same provider value, so one
 * switch re-renders the whole app; persistence lives in the cookie so the next
 * request renders the right language server-side.
 */
export function useLocale(): LocaleContextValue {
  const value = useContext(LocaleContext);

  if (!value) {
    throw new Error("useLocale must be used within LocaleProvider");
  }

  return value;
}
