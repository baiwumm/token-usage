// Spec-first loading for docs/badge.md: the badge modules land with P2, but
// the golden tests are committed together with the spec (AGENTS.md constraint 1
// flow). Modules are imported through a runtime specifier so tsc stays clean
// while they do not exist yet; a null result lets the importing suite skip
// itself and keeps `pnpm verify` green until implementation lands.

export async function loadSpecModule<T>(specifier: string): Promise<T | null> {
  try {
    return (await import(specifier)) as T;
  } catch {
    return null;
  }
}

// Unwrap inside `it` bodies (describe.skip factories still run during
// collection, so unwrapping at suite top would turn the skip into an error).
export function unwrapSpecModule<T>(mod: T | null, label: string): T {
  if (!mod) {
    throw new Error(
      `${label} is not implemented yet (docs/badge.md P2) — this suite must be skipped`,
    );
  }
  return mod;
}
