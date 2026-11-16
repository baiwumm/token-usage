"use client";

// Password card: set or change the login password via auth updateUser —
// this is how magic-link-only accounts enable password sign-in. Auth traffic
// goes through the exempted browser Supabase client.

import {
  Card,
  ErrorMessage,
  Form,
  Input,
  Label,
  TextField,
  Typography,
  toast,
} from "@heroui/react";
import { useState, type FormEvent } from "react";

import { PendingButton } from "@/components/pending-button";
import { authBrowserClient } from "@/lib/auth/browser";
import { DEMO_COPY } from "@/lib/copy/demo";
import { useLocale } from "@/lib/copy/locale";
import { SETTINGS_COPY } from "@/lib/copy/settings";
import { isDemoUi } from "@/lib/demo";

export function PasswordCard() {
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  // Demo instances are read-only (docs/demo-instance-plan.md §5). Changing the
  // shared demo account's password would break /api/app/demo-login for every
  // visitor (it signs in with TOKEN_USAGE_DEMO_PASSWORD), so this card is
  // locked on the client too — auth traffic never reaches the proxy gate.
  const demo = isDemoUi();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || demo) return;
    if (password.length < 8) {
      setError(copy.passwordLengthError);

      return;
    }
    if (password !== confirm) {
      setError(copy.passwordMismatch);

      return;
    }
    setBusy(true);
    setError(null);

    const supabase = authBrowserClient();

    if (!supabase) {
      setBusy(false);
      setError(copy.profileSaveFailed);

      return;
    }
    const { error: authError } = await supabase.auth.updateUser({ password });

    setBusy(false);
    if (authError) {
      setError(authError.message);

      return;
    }
    setPassword("");
    setConfirm("");
    toast.success(copy.passwordSaved);
  }

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.passwordHeading}</Card.Title>
        <Card.Description>{copy.passwordHint}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form
          className="flex w-full flex-col gap-3"
          onSubmit={(event) => {
            void save(event);
          }}
        >
          <TextField
            isRequired
            className="flex flex-col gap-1.5"
            isDisabled={demo}
            minLength={8}
            name="password"
            type="password"
            value={password}
            onChange={setPassword}
          >
            <Label>{copy.passwordNewLabel}</Label>
            <Input
              autoComplete="new-password"
              placeholder={copy.passwordNewPlaceholder}
              variant="secondary"
            />
          </TextField>
          <TextField
            isRequired
            className="flex flex-col gap-1.5"
            isDisabled={demo}
            minLength={8}
            name="password_confirm"
            type="password"
            value={confirm}
            onChange={setConfirm}
          >
            <Label>{copy.passwordConfirmLabel}</Label>
            <Input
              autoComplete="new-password"
              placeholder={copy.passwordConfirmPlaceholder}
              variant="secondary"
            />
          </TextField>
          {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
          <div>
            <PendingButton isDisabled={demo} pending={busy} type="submit">
              {copy.passwordSave}
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
