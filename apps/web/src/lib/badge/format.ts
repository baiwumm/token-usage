// Fixed-default number formatting for the public badge and the /u page
// (docs/badge.md §4.5): one server-side style that never follows a viewer's
// local preferences, so the SVG and the public page always agree. Compact
// KMB with up to two decimals (golden-pinned "18.48B"; lib/format's
// preference-aware formatter is full-digits + 1-decimal) and en-US dollars:
// cents under $10k, whole dollars from $10k. Pure functions.

const costFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const wholeFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

// Largest first; a rounding overflow promotes to the previous entry.
const UNITS: Array<[size: number, suffix: string]> = [
  [1e12, "T"],
  [1e9, "B"],
  [1e6, "M"],
  [1e3, "K"],
];

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function compact(value: number, size: number, suffix: string): string {
  const scaled = Math.round((value / size) * 100) / 100;

  return `${scaled.toFixed(2).replace(/\.?0+$/, "")}${suffix}`;
}

export function formatBadgeTokens(value: number): string {
  const safe = finite(value);
  const abs = Math.abs(safe);

  for (let index = 0; index < UNITS.length; index += 1) {
    const [size, suffix] = UNITS[index];

    if (abs < size) continue;
    // 999,999 would read "1000K" — promote to the next unit up ("1M").
    if (Math.round((abs / size) * 100) / 100 >= 1000 && index > 0) {
      const [biggerSize, biggerSuffix] = UNITS[index - 1];

      return compact(safe, biggerSize, biggerSuffix);
    }

    return compact(safe, size, suffix);
  }

  return String(Math.round(safe));
}

export function formatBadgeCost(value: number): string {
  const safe = finite(value);

  return `$${(Math.abs(safe) >= 10_000 ? wholeFormatter : costFormatter).format(
    safe,
  )}`;
}

export function formatBadgeShare(share: number): string {
  return `${Math.round(Math.min(1, Math.max(0, finite(share))) * 100)}%`;
}

export function formatBadgeCount(value: number): string {
  return String(Math.max(0, Math.round(finite(value))));
}
