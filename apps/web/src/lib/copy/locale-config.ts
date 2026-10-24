// Locale primitives shared by the server (root layout) and the client
// provider. This module deliberately has no "use client" directive so server
// components can resolve the request locale without importing client code.

export type Locale = "zh" | "en";

export const LOCALES: Locale[] = ["zh", "en"];

/** UI preference cookie; read by the server for SSR, written by the client. */
export const LOCALE_COOKIE = "token-usage.locale";

/**
 * Cookie wins; otherwise the first Accept-Language entry decides; English is
 * the fallback for browsers that are neither Chinese nor English.
 */
export function resolveLocale(
  stored: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (stored === "zh" || stored === "en") return stored;

  const first = acceptLanguage?.split(",")[0]?.trim().toLowerCase() ?? "";

  return first.startsWith("zh") ? "zh" : "en";
}

/** BCP 47 tag for the <html lang> attribute. */
export function htmlLangFor(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}
