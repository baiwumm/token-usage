"use client";

// Animated numeric text (docs/ui-spec.md): wraps @number-flow/react so the
// preference-aware formatted strings from useFormat (45.6M / 1.2万 / $1,038.01)
// still render exactly the same, but the digits transition when the value
// changes. Falls back to a plain span when the text has no parseable number
// ("—") or uses a non-Intl grouping convention (the 4-digit 万 grouping).

import NumberFlow from "@number-flow/react";
import { useMemo } from "react";

/** Leading non-numeric prefix, numeric core (separators included), suffix. */
const NUMERIC_TEXT_RE = /^([^\d]*?)(-?[\d,]+(?:\.\d+)?)([\s\S]*)$/;

export function FlowNumber({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const parsed = useMemo(() => {
    const match = NUMERIC_TEXT_RE.exec(text);

    if (!match) return null;
    const [, prefix, core, suffix] = match;

    // The 万 grouping preference (4-digit groups) is not an Intl convention;
    // NumberFlow would re-render it as 3-digit groups, so opt out there.
    if (/,\d{4}(,|$)/.test(core)) return null;

    const numeric = Number(core.replace(/,/g, ""));

    if (!Number.isFinite(numeric)) return null;
    const decimals = core.includes(".") ? core.split(".")[1].length : 0;

    return {
      prefix,
      suffix,
      numeric,
      format: {
        useGrouping: core.includes(","),
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      },
    };
  }, [text]);

  if (!parsed) {
    return <span className={className}>{text}</span>;
  }

  return (
    <NumberFlow
      className={className}
      format={parsed.format}
      prefix={parsed.prefix}
      suffix={parsed.suffix}
      value={parsed.numeric}
    />
  );
}
