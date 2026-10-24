// ICU formatting for the few dictionary entries that carry counts or plurals
// (2026-10-25, "lightweight copy pipeline" decision 11). Plain copy stays as
// typed strings; only templates with {placeholders} go through here. The
// intl-messageformat dependency was already part of the workspace before this
// module existed — this is what finally uses it.

import type { Locale } from "./locale-config";

import IntlMessageFormat from "intl-messageformat";

export type MessageValues = Record<
  string,
  string | number | boolean | Date | null | undefined
>;

const formatters = new Map<string, IntlMessageFormat>();

function formatterFor(template: string, locale: Locale): IntlMessageFormat {
  const key = `${locale}:${template}`;
  const cached = formatters.get(key);

  if (cached) return cached;

  const formatter = new IntlMessageFormat(
    template,
    locale === "zh" ? "zh-CN" : "en",
  );

  formatters.set(key, formatter);

  return formatter;
}

/** Format an ICU template for the active locale. */
export function formatMessage(
  template: string,
  locale: Locale,
  values?: MessageValues,
): string {
  return formatterFor(template, locale).format(values) as string;
}
