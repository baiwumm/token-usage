// Filter contract for /projects. The page always reads the full window
// (range preset "all", clamped server-side to the 3-year series cap); the
// only user-facing narrowing is how many top projects to show, which is pure
// client-side slicing so changing it never refetches.
//
// The sort key and the visible-count round-trip in the URL so a shared link
// keeps the same view.

export type ProjectSort = "tokens" | "cost";
export type ProjectLimit = "all" | "3" | "5" | "10";

export const PROJECT_LIMITS: ProjectLimit[] = ["all", "3", "5", "10"];

export interface Filters {
  sort: ProjectSort;
  limit: ProjectLimit;
}

export function parseFilters(params: {
  get(name: string): string | null;
}): Filters {
  const sort = params.get("sort");
  const limit = params.get("limit");

  return {
    sort: sort === "cost" ? "cost" : "tokens",
    limit: limit === "3" || limit === "5" || limit === "10" ? limit : "all",
  };
}

export function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.sort !== "tokens") query.set("sort", filters.sort);
  if (filters.limit !== "all") query.set("limit", filters.limit);

  return query.toString();
}

/** Client-side Top-N narrowing; the server payload always carries the full
 *  list (limit 200), so switching never triggers a request. */
export function sliceProjects<T>(projects: T[], limit: ProjectLimit): T[] {
  return limit === "all" ? projects : projects.slice(0, Number(limit));
}
