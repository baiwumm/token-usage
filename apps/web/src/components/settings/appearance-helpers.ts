// Appearance helpers: react-aria hands selection callbacks a Set<Key>, but every
// toggle group in the appearance tab is single-select, so the sections only ever
// need the first string key.

import type { Key } from "react";

export function firstKey(keys: Set<Key>): string | null {
  const key = [...keys][0];

  return typeof key === "string" ? key : null;
}
