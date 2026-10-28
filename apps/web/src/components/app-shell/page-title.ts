// Page title helpers for the app shell: who is signed in, and which nav label
// the current path maps to (the dashboard itself shows a time-based greeting).

import type { Profile } from "@/lib/auth/profile";
import type { NavCopy } from "@/lib/copy/nav";

export function firstNameOf(profile: Profile | null): string | null {
  if (!profile) return null;
  const name = profile.displayName.trim();

  if (name) return name.split(/\s+/)[0];
  const local = profile.email?.split("@")[0]?.trim();

  return local || null;
}

export function titleForPath(pathname: string, copy: NavCopy): string {
  if (pathname.startsWith("/sessions")) return copy.sessions;
  if (pathname.startsWith("/sync-runs")) return copy.syncRuns;
  if (pathname.startsWith("/wrapped")) return copy.wrapped;
  if (pathname.startsWith("/service-status")) return copy.status;
  if (pathname.startsWith("/settings")) return copy.settings;
  if (pathname.startsWith("/device")) return copy.device;

  return copy.dashboard;
}
