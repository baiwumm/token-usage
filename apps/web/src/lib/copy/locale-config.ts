// Locale primitives shared by the server (root layout) and the client
// provider. This module deliberately has no "use client" directive so server
// components can resolve the request locale without importing client code.
//
// The stored preference is `system | zh | en` (docs/ui-spec.md 语言、主题与偏好
// 持久化). `system` resolves through Accept-Language, honoring q-values; an
// explicit zh/en always wins.

export type Locale = "zh" | "en";

export type LocalePreference = "system" | Locale;

export const LOCALES: Locale[] = ["zh", "en"];

export const LOCALE_PREFERENCES: LocalePreference[] = ["system", "zh", "en"];

/** UI preference cookie; read by the server for SSR, written by the client. */
export const LOCALE_COOKIE = "token-usage.locale";

export function isLocalePreference(value: unknown): value is LocalePreference {
  return value === "system" || value === "zh" || value === "en";
}

/** Coerce an unknown cookie value to a preference; anything else is system. */
export function normalizeLocalePreference(
  value: string | null | undefined,
): LocalePreference {
  return isLocalePreference(value) ? value : "system";
}

interface LanguageRange {
  tag: string;
  quality: number;
  index: number;
}

function parseAcceptLanguage(
  header: string | null | undefined,
): LanguageRange[] {
  if (!header) return [];

  const ranges: LanguageRange[] = [];

  header.split(",").forEach((raw, index) => {
    const [tagPart, ...params] = raw.split(";");
    const tag = tagPart?.trim().toLowerCase();

    if (!tag) return;

    let quality = 1;

    for (const param of params) {
      const [key, value] = param.split("=");

      if (key?.trim().toLowerCase() !== "q") continue;
      const parsed = Number(value);

      if (Number.isFinite(parsed)) quality = Math.min(Math.max(parsed, 0), 1);
    }
    if (quality <= 0) return;
    ranges.push({ tag, quality, index });
  });

  return ranges.sort((a, b) =>
    a.quality === b.quality ? a.index - b.index : b.quality - a.quality,
  );
}

/** First supported language from Accept-Language (q-values respected). */
export function localeFromAcceptLanguage(
  header: string | null | undefined,
): Locale {
  for (const range of parseAcceptLanguage(header)) {
    if (range.tag === "zh" || range.tag.startsWith("zh-")) return "zh";
    if (range.tag === "en" || range.tag.startsWith("en-")) return "en";
  }

  return "en";
}

/**
 * Resolve the effective UI locale: an explicit zh/en cookie wins; otherwise
 * (missing, `system`, or unknown) the Accept-Language header decides.
 */
export function resolveLocale(
  stored: string | null | undefined,
  acceptLanguage: string | null | undefined,
): Locale {
  if (stored === "zh" || stored === "en") return stored;

  return localeFromAcceptLanguage(acceptLanguage);
}

/** BCP 47 tag for the <html lang> attribute. */
export function htmlLangFor(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

/** Intl tag used for number/date formatting. */
export function intlLocaleFor(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en-US";
}
