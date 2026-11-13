"use client";

// User profile state (display name + avatar) stored in Supabase auth
// user_metadata — editable from Settings, shown in the app shell sidebar.
// The updateUser call is auth traffic (exempted browser Supabase usage).
// The profile itself lives in a singleton store so the app shell does not
// replay its placeholder on every menu switch (see stores/profile-store.ts).

import { useCallback, useEffect } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import {
  useProfileStore,
  type Profile,
  type ProfileMeta,
} from "@/stores/profile-store";

export type { Profile } from "@/stores/profile-store";

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
  const profile = useProfileStore((state) => state.profile);
  const ensureLoaded = useProfileStore((state) => state.ensureLoaded);

  useEffect(() => {
    ensureLoaded();
  }, [ensureLoaded]);

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

// SVG is refused at the entrance: the avatars bucket is public-read, and an
// uploaded SVG would be a stored-XSS vector (the crop→WebP pipeline is a
// mitigation, not a guarantee — this closes the door itself).
const REFUSED_IMAGE_TYPES = new Set(["image/svg+xml"]);
const ACCEPTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

function avatarTypeAllowed(file: File): boolean {
  return ACCEPTED_IMAGE_TYPES.has(file.type);
}

function avatarRejection(file: File): string | null {
  if (REFUSED_IMAGE_TYPES.has(file.type)) return "SVG images are not allowed";
  if (!avatarTypeAllowed(file)) return "not a PNG, JPEG, or WebP image";

  return null;
}

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
      const typeRejection = avatarRejection(file);

      if (typeRejection) return { error: typeRejection };
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

      // avatar_url stays written for legacy readers; custom_avatar_url is the
      // OAuth-proof reference every reader prefers (see ProfileMeta).
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_url: publicUrl, custom_avatar_url: publicUrl },
      });

      if (updateError) return { error: updateError.message };

      return { error: null };
    },
    [supabase],
  );

  const deleteAvatar = useCallback(async () => {
    if (!supabase) return { error: "no client" };
    const meta = (await supabase.auth.getUser()).data.user?.user_metadata as
      ProfileMeta | undefined;

    // Both references may exist (OAuth may have rewritten avatar_url since the
    // upload); each own-bucket URL is removed, stale objects are left alone.
    const paths = [meta?.custom_avatar_url, meta?.avatar_url]
      .filter((url): url is string => typeof url === "string" && !!url)
      .map((url) => url.split("/object/public/avatars/")[1])
      .filter((path): path is string => !!path);
    const uniquePaths = [...new Set(paths)];

    if (uniquePaths.length > 0) {
      await supabase.storage.from(AVATAR_BUCKET).remove(uniquePaths);
    }

    const { error: updateError } = await supabase.auth.updateUser({
      data: { avatar_url: null, custom_avatar_url: null },
    });

    if (updateError) return { error: updateError.message };

    return { error: null };
  }, [supabase]);

  return { uploadAvatar, deleteAvatar };
}
