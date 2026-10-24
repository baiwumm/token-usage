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
    async (data: { display_name?: string; avatar_url?: string | null }) => {
      const supabase = authBrowserClient();

      if (!supabase) return { error: "no client" };
      const { error } = await supabase.auth.updateUser({ data });

      return { error: error ? error.message : null };
    },
    [],
  );

  return { profile, updateProfile };
}

const AVATAR_BUCKET = "avatars";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

/**
 * Upload a user-provided image to the avatars bucket under the user's own
 * prefix (storage policies scope writes to avatars/<uid>/) and persist the
 * public URL in user_metadata.avatar_url.
 */
export function useAvatarUpload(): {
  uploadAvatar: (file: File) => Promise<{ error: string | null }>;
  deleteAvatar: () => Promise<{ error: string | null }>;
} {
  const supabase = authBrowserClient();

  const uploadAvatar = useCallback(
    async (file: File) => {
      if (!supabase) return { error: "no client" };
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) return { error: "no session" };
      if (!file.type.startsWith("image/")) {
        return { error: "not an image" };
      }
      if (file.size > MAX_AVATAR_BYTES) {
        return { error: "file too large (max 2 MB)" };
      }

      const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) return { error: uploadError.message };

      const {
        data: { publicUrl },
      } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl },
      });

      if (updateError) return { error: updateError.message };

      return { error: null };
    },
    [supabase],
  );

  const deleteAvatar = useCallback(async () => {
    if (!supabase) return { error: "no client" };
    const url = (await supabase.auth.getUser()).data.user?.user_metadata
      ?.avatar_url as string | undefined;

    if (url) {
      // Strip the public URL prefix down to the bucket-relative path.
      const marker = "/object/public/avatars/";

      if (url.includes(marker)) {
        await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([url.split(marker)[1]]);
      }
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: null },
    });

    if (updateError) return { error: updateError.message };

    return { error: null };
  }, [supabase]);

  return { uploadAvatar, deleteAvatar };
}
