// Server-only FX snapshot resolution. The root layout injects the result into
// FormatProvider; invalid or partial TOKEN_USAGE_FX_RATES values fall back to
// the built-in snapshot (docs/rewrite-plan.md §9).

import { BUILT_IN_FX, parseFxSnapshot, type FxSnapshot } from "./core";

export function resolveFxSnapshot(
  raw: string | null | undefined = process.env.TOKEN_USAGE_FX_RATES,
): FxSnapshot {
  const parsed = parseFxSnapshot(raw);

  if (raw?.trim() && !parsed) {
    console.warn(
      "TOKEN_USAGE_FX_RATES is not valid JSON with a rates object; using the built-in FX snapshot.",
    );
  }

  return parsed ?? BUILT_IN_FX;
}
