"use client";

// Account section: the profile card (display name + read-only email).
// Avatar/profile state lives in Supabase auth user_metadata; the sidebar
// reflects updates via the USER_UPDATED auth event.

import {
  Card,
  Form,
  Input,
  Label,
  TextField,
  toast,
  Typography,
} from "@heroui/react";
import { useEffect, useRef, useState } from "react";

import { PendingButton } from "@/components/pending-button";
import { useProfile } from "@/lib/auth/profile";
import { DEMO_COPY } from "@/lib/copy/demo";
import { useLocale } from "@/lib/copy/locale";
import { SETTINGS_COPY } from "@/lib/copy/settings";
import { isDemoUi } from "@/lib/demo";

export function ProfileCard() {
  const { profile, updateProfile } = useProfile();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || loadedFor.current === profile.email) return;
    loadedFor.current = profile.email;
    setName(profile.displayName);
  }, [profile]);

  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  // Demo instances are read-only (docs/demo-instance-plan.md §5). This card
  // writes auth user_metadata straight to Supabase from the browser, so the
  // proxy gate never sees it — the lock has to live here.
  const demo = isDemoUi();

  async function save() {
    if (saving || demo) return;
    setSaving(true);

    const { error } = await updateProfile({
      display_name: name.trim(),
    });

    setSaving(false);
    if (error) {
      toast(`${copy.profileSaveFailed} (${error})`);
    } else {
      toast.success(copy.profileSaved);
    }
  }

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.profileHeading}</Card.Title>
        <Card.Description>{copy.profileHint}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form
          className="flex w-full flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <TextField
            isRequired
            isDisabled={demo}
            name="display_name"
            value={name}
            onChange={setName}
          >
            <Label>{copy.profileNameLabel}</Label>
            <Input
              placeholder={copy.profileNamePlaceholder}
              variant="secondary"
            />
          </TextField>
          <TextField isDisabled name="email" value={profile?.email ?? ""}>
            <Label>{copy.profileEmailLabel}</Label>
            <Input variant="secondary" />
          </TextField>
          <div>
            <PendingButton
              isDisabled={demo}
              pending={saving}
              onPress={() => void save()}
            >
              {copy.profileSave}
            </PendingButton>
          </div>
          {demo ? (
            <Typography className="text-accent" type="body-xs">
              {DEMO_COPY[locale].readOnly}
            </Typography>
          ) : null}
        </Form>
      </Card.Content>
    </Card>
  );
}
