// Filter contract for /projects (docs/projects-page-plan.md 批次 1). The sort
// key round-trips in the URL so a shared link keeps the ordering; the range
// preset stays session-only (operator call 2026-10-26: presets always resolve
// relative to today, so a stale link must not pin the list to old dates).

export type ProjectRange = "7d" | "30d";
export type ProjectSort = "tokens" | "cost";

export interface Filters {
  range: ProjectRange;
  sort: ProjectSort;
}

export function parseFilters(params: {
  get(name: string): string | null;
}): Filters {
  const sort = params.get("sort");

  return {
    range: "7d",
    sort: sort === "cost" ? "cost" : "tokens",
  };
}

export function serializeFilters(filters: Filters): string {
  const query = new URLSearchParams();

  if (filters.sort !== "tokens") query.set("sort", filters.sort);

  return query.toString();
}
