"use client";

// Sidebar collapse preference backed by localStorage and read through
// useSyncExternalStore. AppShell remounts on every menu switch, so the old
// useState + useEffect read rendered the expanded rail for a frame before
// collapsing; an external snapshot is already correct on the first render.

const COLLAPSE_KEY = "token-usage.sidebar-collapsed";

const listeners = new Set<() => void>();
let snapshot: boolean | null = null;

function readStoredValue(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}

export function getCollapsedSnapshot(): boolean {
  if (snapshot === null) snapshot = readStoredValue();

  return snapshot;
}

export function getCollapsedServerSnapshot(): boolean {
  return false;
}

export function subscribeCollapsed(listener: () => void): () => void {
  if (snapshot === null) snapshot = readStoredValue();

  listeners.add(listener);

  // Keep other tabs in sync; the storage event never fires in the tab that
  // wrote the value, hence the local listener set above.
  const onStorage = (event: StorageEvent) => {
    if (event.key !== COLLAPSE_KEY) return;
    snapshot = readStoredValue();
    listener();
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function setCollapsedPreference(next: boolean): void {
  snapshot = next;

  try {
    window.localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  } catch {
    // best effort: the in-memory snapshot still drives this tab
  }

  for (const listener of listeners) listener();
}
