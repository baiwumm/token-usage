"use client";

// Account section: the avatar card (crop + upload). Avatar/profile state lives
// in Supabase auth user_metadata; the sidebar reflects updates via the
// USER_UPDATED auth event.

import { Camera, TrashBin } from "@gravity-ui/icons";
import { Avatar, Button, Card, Spinner, toast } from "@heroui/react";
import { useRef, useState } from "react";

import { AvatarCropDialog } from "./avatar-crop-dialog";

import { useAvatarUpload, useProfile } from "@/lib/auth/profile";
import { useLocale } from "@/lib/copy/locale";
import { SETTINGS_COPY } from "@/lib/copy/settings";

export function AvatarCard() {
  const { profile } = useProfile();
  const { uploadAvatar, deleteAvatar } = useAvatarUpload();
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  const [uploading, setUploading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const initial = (profile?.displayName || profile?.email || "?")
    .charAt(0)
    .toUpperCase();

  function pickImage(file: File) {
    // Revoke the previous objectURL before replacing it.
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(URL.createObjectURL(file));
    setCropOpen(true);
  }

  function closeCrop() {
    setCropOpen(false);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
  }

  async function runUpload(file: File) {
    setUploading(true);

    const { error } = await uploadAvatar(file);

    setUploading(false);
    if (error) {
      toast(`${copy.profileSaveFailed} (${error})`);

      return { error };
    }
    toast.success(copy.profileSaved);

    return { error: null };
  }

  async function runDelete() {
    setDeleting(true);

    const { error } = await deleteAvatar();

    setDeleting(false);
    if (error) {
      toast(`${copy.profileSaveFailed} (${error})`);
    } else {
      toast.success(copy.profileSaved);
    }
  }

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.avatarHeading}</Card.Title>
        <Card.Description>{copy.avatarHint}</Card.Description>
      </Card.Header>
      <Card.Content>
        <div className="flex items-center gap-4">
          {/* key rebuilds the subtree after delete so the Fallback (initial)
              renders immediately instead of the removed image */}
          <Avatar key={profile?.avatarUrl ?? "fallback"} className="size-20">
            {profile?.avatarUrl ? (
              <Avatar.Image alt={initial} src={profile.avatarUrl} />
            ) : null}
            <Avatar.Fallback className="text-2xl">{initial}</Avatar.Fallback>
          </Avatar>
          <div className="flex flex-row gap-2">
            <input
              ref={fileInputRef}
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              type="file"
              onChange={(event) => {
                const file = event.target.files?.[0];

                // Clear the value so picking the same file twice re-fires.
                event.target.value = "";
                if (file) pickImage(file);
              }}
            />
            <Button
              isDisabled={uploading || deleting}
              size="sm"
              variant="outline"
              onPress={() => fileInputRef.current?.click()}
            >
              <Camera aria-hidden="true" className="size-4" />
              {copy.profileAvatarChange}
            </Button>
            {profile?.avatarUrl ? (
              <Button
                isDisabled={uploading || deleting}
                size="sm"
                variant="danger-soft"
                onPress={() => void runDelete()}
              >
                {deleting ? (
                  <Spinner color="current" size="sm" />
                ) : (
                  <TrashBin aria-hidden="true" className="size-4" />
                )}
                {copy.profileAvatarDelete}
              </Button>
            ) : null}
          </div>
        </div>
      </Card.Content>
      <AvatarCropDialog
        imageSrc={imageSrc}
        isOpen={cropOpen}
        upload={runUpload}
        onFailed={() => {
          /* toast already shown by runUpload */
        }}
        onOpenChange={(open) => {
          if (!open) closeCrop();
        }}
        onUploaded={closeCrop}
      />
    </Card>
  );
}
