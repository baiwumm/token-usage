"use client";

// URL-backed filter state for the filter-bar pages (dashboard, sessions):
// parse from the address bar once, rewrite it via replaceState on every
// change, and re-parse on back/forward. Pass module-level parse/serialize/
// merge functions so their identities stay stable across renders.

import { useCallback, useEffect, useState } from "react";

function mergeReplace<F>(previous: F, patch: Partial<F>): F {
  return { ...previous, ...patch };
}

export function useUrlFilters<F>(config: {
  basePath: string;
  parse: (params: URLSearchParams) => F;
  serialize: (filters: F) => string;
  /** Extra merge rules, e.g. sessions resetting paging on any other change. */
  merge?: (previous: F, patch: Partial<F>) => F;
  /**
   * Seeds the initial state. Pass the router's search params on pages that can
   * be entered from a cross-page deep link: a client navigation renders the
   * new page before Next.js updates the address bar, so reading
   * `window.location` there still sees the previous page's query.
   */
  initialParams?: URLSearchParams;
}): readonly [F, (patch: Partial<F>) => void] {
  const { basePath, parse, serialize, initialParams } = config;
  const merge = config.merge ?? mergeReplace;
  const [filters, setFilters] = useState<F>(() =>
    parse(
      initialParams ??
        new URLSearchParams(
          typeof window === "undefined" ? "" : window.location.search,
        ),
    ),
  );

  // The address bar wins on back/forward navigation.
  useEffect(() => {
    const onPopState = () => {
      setFilters(parse(new URLSearchParams(window.location.search)));
    };

    window.addEventListener("popstate", onPopState);

    return () => window.removeEventListener("popstate", onPopState);
  }, [parse]);

  // Mirror the filters back to the URL. This replaces the one-off legacy
  // scrub too: a page whose serialize() omits range/from/to rewrites stale
  // bookmarks away on the first run. Running in an effect (never inside a
  // setState updater) keeps StrictMode double-invocation safe.
  useEffect(() => {
    const query = serialize(filters);

    window.history.replaceState(
      null,
      "",
      query ? `${basePath}?${query}` : basePath,
    );
  }, [basePath, filters, serialize]);

  const applyFilters = useCallback(
    (patch: Partial<F>) => {
      setFilters((previous) => merge(previous, patch));
    },
    [merge],
  );

  return [filters, applyFilters] as const;
}
