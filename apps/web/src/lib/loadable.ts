// Shared three-state slot for async data surfaces (loading / ready / error):
// the client components render one Loadable per section so a failed refresh
// can keep previous data on screen instead of collapsing the layout.

export type LoadStatus = "loading" | "ready" | "error";

export interface Loadable<T> {
  status: LoadStatus;
  data: T | null;
}

export function loadable<T>(): Loadable<T> {
  return { status: "loading", data: null };
}
