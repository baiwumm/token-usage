// Deterministic date labels for /u/<token> (docs/badge.md §6.1). Day keys are
// owner-timezone calendar days, so they must be rendered in UTC to avoid a
// one-day shift on the visitor's machine; SSR and hydration stay identical.

import type { Locale } from "@/lib/copy/locale-config";

import { formatMessage } from "@/lib/copy/message";

function intl(locale: Locale, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    timeZone: "UTC",
    ...options,
  });
}

export function formatPublicDay(day: string | null, locale: Locale): string {
  if (!day) return "—";
  const date = new Date(`${day}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) return day;

  return intl(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Text for the scope Tooltip. Kept pure so the (client-only portal) tooltip
 * payload stays testable without a DOM: SSR markup contains just the trigger.
 */
export function formatPublicPeriodRange(
  template: string,
  locale: Locale,
  first: string | null,
  last: string | null,
): string | null {
  if (!first || !last) return null;

  return formatMessage(template, locale, {
    first: formatPublicDay(first, locale),
    last: formatPublicDay(last, locale),
  });
}

export function formatPublicUpdatedAt(
  iso: string | null,
  locale: Locale,
): string | null {
  if (!iso) return null;
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return null;

  return `${intl(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date)} UTC`;
}
