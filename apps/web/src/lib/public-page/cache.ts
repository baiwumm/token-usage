// Short-lived single-flight for /u/<token> (docs/badge.md §4.7). Shared with
// the badge loader through an explicit invalidation call — this module has no
// imports of its own, so the two data layers cannot form a cycle.

const TTL_MS = 60_000;

type Entry = { expiresAt: number; promise: Promise<unknown> };
const cache = new Map<string, Entry>();

/** One payload per owner now that both sections are always on. */
export function publicPageCacheKey(userId: string): string {
  return `${userId}|public-page`;
}

export function getPublicPageCache<T>(key: string): Promise<T> | null {
  const hit = cache.get(key);

  if (!hit) return null;
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key);

    return null;
  }

  return hit.promise as Promise<T>;
}

export function setPublicPageCache<T>(key: string, promise: Promise<T>): void {
  cache.set(key, { expiresAt: Date.now() + TTL_MS, promise });
  // A failed load must not pin its rejection for the whole TTL.
  promise.catch(() => {
    const entry = cache.get(key);

    if (entry?.promise === promise) cache.delete(key);
  });
}

export function invalidatePublicPageData(userId?: string): void {
  if (userId == null) {
    cache.clear();

    return;
  }
  for (const key of [...cache.keys()]) {
    if (key.startsWith(`${userId}|public-page`)) cache.delete(key);
  }
}
