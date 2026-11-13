"use client";

// Signed-in user profile (display name + avatar) as a singleton store.
//
// AppShell is composed inside every protected page.tsx, so a menu switch
// unmounts and remounts the whole shell. A hook-local profile would restart
// from null and replay the avatar/label placeholder on every navigation;
// keeping the last profile here makes the sidebar stable while one shared
// auth subscription updates it (USER_UPDATED / SIGNED_IN / SIGNED_OUT).

import { create } from "zustand";

import { authBrowserClient } from "@/lib/auth/browser";

export interface Profile {
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

export interface ProfileMeta {
  display_name?: string;
  avatar_url?: string;
  // Custom avatar reference written by useAvatarUpload. avatar_url is a
  // provider-owned key — every GitHub/Google OAuth login overwrites it with
  // the provider's picture (Supabase syncs provider metadata at each login),
  // so the uploaded avatar must live under a key no provider touches.
  custom_avatar_url?: string;
}

// Single source of truth for avatar display across the app (sidebar,
// settings, wrapped): the upload-written custom key wins; the legacy
// provider-owned key only serves accounts that never logged in with OAuth
// (its value may be a provider URL, which the badge/public-page pipeline
// rejects via its own-bucket allowlist).
function profileAvatarUrl(meta: ProfileMeta | undefined): string | null {
  if (meta?.custom_avatar_url) return String(meta.custom_avatar_url);
  if (meta?.avatar_url) return String(meta.avatar_url);

  return null;
}

function toProfile(
  user: { email?: string | null; user_metadata?: ProfileMeta } | null,
): Profile | null {
  if (!user) return null;

  return {
    email: user.email ?? null,
    displayName: String(user.user_metadata?.display_name || ""),
    avatarUrl: profileAvatarUrl(user.user_metadata),
  };
}

interface ProfileState {
  profile: Profile | null;
  ensureLoaded: () => void;
}

let subscribed = false;
let inFlight: Promise<void> | null = null;

export const useProfileStore = create<ProfileState>((set, get) => ({
  profile: null,
  ensureLoaded: () => {
    const supabase = authBrowserClient();

    if (!supabase) return;

    if (!subscribed) {
      subscribed = true;
      supabase.auth.onAuthStateChange((event, session) => {
        if (
          event === "USER_UPDATED" ||
          event === "SIGNED_IN" ||
          event === "SIGNED_OUT"
        ) {
          set({ profile: toProfile(session?.user ?? null) });
        }
      });
    }

    // Several consumers (shell, dashboard, settings) mount together; the first
    // one loads, the rest read the cached profile or join the in-flight read.
    if (inFlight || get().profile) return;

    inFlight = supabase.auth
      .getUser()
      .then(({ data, error }) => {
        // A transient failure leaves the cache empty so the next mount retries
        // instead of pinning the placeholder for the rest of the session.
        if (!error) set({ profile: toProfile(data.user) });
      })
      .finally(() => {
        inFlight = null;
      });
  },
}));
