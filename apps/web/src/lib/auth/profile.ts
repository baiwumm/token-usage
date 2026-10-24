"use client";

// User profile state (display name + avatar) stored in Supabase auth
// user_metadata — editable from Settings, shown in the app shell sidebar.
// The updateUser call is auth traffic (exempted browser Supabase usage).

import { useCallback, useEffect, useState } from "react";

import { authBrowserClient } from "@/lib/auth/browser";

export interface Profile {
  email: string | null;
  displayName: string;
  avatarUrl: string | null;
}

interface ProfileMeta {
  display_name?: string;
  avatar_url?: string;
}

/**
 * Profile for the signed-in user, kept fresh via the USER_UPDATED auth event
 * (fires after updateUser succeeds).
 */
export function useProfile(): {
  profile: Profile | null;
  updateProfile: (data: {
    display_name?: string;
    avatar_url?: string;
  }) => Promise<{ error: string | null }>;
} {
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    const supabase = authBrowserClient();

    if (!supabase) return;

    const read = (
      user: {
        email?: string | null;
        user_metadata?: ProfileMeta;
      } | null,
    ) => {
      if (!user) {
        setProfile(null);

        return;
      }
      setProfile({
        email: user.email ?? null,
        displayName: String(user.user_metadata?.display_name || ""),
        avatarUrl: user.user_metadata?.avatar_url
          ? String(user.user_metadata.avatar_url)
          : null,
      });
    };

    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      read(user);
    })();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "USER_UPDATED" || event === "SIGNED_IN") {
        read(session?.user ?? null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const updateProfile = useCallback(
    async (data: { display_name?: string; avatar_url?: string }) => {
      const supabase = authBrowserClient();

      if (!supabase) return { error: "no client" };
      const { error } = await supabase.auth.updateUser({ data });

      return { error: error ? error.message : null };
    },
    [],
  );

  return { profile, updateProfile };
}
