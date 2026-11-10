// Dotted-version comparison for the click-only CLI update check. The CLI
// reports bare semver (`0.5.4`); the npm registry returns the same shape. Only
// the numeric prefix matters here — pre-release tags are not used by the
// collector, and an unparsable side must never produce a false "latest".

/**
 * Version as displayed (`v0.5.4` → `0.5.4`). The CLI's `--version` output may
 * carry a `v` prefix while the npm registry does not; callers that add their
 * own `v` must strip it first or the result reads `vv0.5.4`.
 */
export function bareVersion(value: string): string {
  return value.trim().replace(/^v/i, "");
}

/** Numeric segments of a version string (`v0.5.4` → `[0, 5, 4]`), or null. */
export function parseVersion(value: string): number[] | null {
  const match = /^v?(\d+(?:\.\d+)*)/i.exec(value.trim());

  if (!match?.[1]) return null;

  return match[1].split(".").map(Number);
}

/**
 * Compare two dotted versions: `-1` when `a` is older, `0` when equal, `1`
 * when newer, `null` when either side is unparsable. Missing trailing
 * segments count as zero, so `0.5` equals `0.5.0`.
 */
export function compareVersions(a: string, b: string): number | null {
  const left = parseVersion(a);
  const right = parseVersion(b);

  if (left === null || right === null) return null;

  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0);

    if (diff !== 0) return diff > 0 ? 1 : -1;
  }

  return 0;
}
