"use client";

// Settings page: account panel + device table. Device data and mutations go
// through the contract endpoints (token-usage-account-devices / device-rename
// / device-revoke, docs/cli-contract.md §2.7–2.9) with the browser session's
// Supabase JWT — the dual-principal path, never a browser→table connection.

import type { LoadStatus } from "@/lib/loadable";

import { Camera, Display, Palette, Person, TrashBin } from "@gravity-ui/icons";
import {
  Avatar,
  Button,
  Card,
  Chip,
  ErrorMessage,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  Table,
  Tabs,
  TextField,
  Typography,
  toast,
} from "@heroui/react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { AppearancePanel } from "./appearance-panel";
import { AvatarCropDialog } from "./avatar-crop-dialog";

import { authBrowserClient } from "@/lib/auth/browser";
import { useAvatarUpload, useProfile } from "@/lib/auth/profile";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { SETTINGS_COPY, type SettingsCopy } from "@/lib/copy/settings";
import { useFormat } from "@/lib/format/format";
import { PendingButton } from "@/components/pending-button";
import {
  DashboardApiError,
  fetchAccountDevices,
  isUnauthorized,
  renameDevice,
  revokeDevice,
  type AccountDeviceRow,
} from "@/lib/dashboard/api";

const USAGE_WINDOW_DAYS = 364;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function usageWindow(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);

  from.setUTCDate(from.getUTCDate() - USAGE_WINDOW_DAYS);

  return { from: dayKey(from), to: dayKey(to) };
}

function friendlyDeviceError(code: string, copy: SettingsCopy): string {
  if (code === "device_name_taken") return copy.errorDeviceNameTaken;

  return copy.errorGeneric;
}

export function SettingsClient() {
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  const { formatDate, formatTokens } = useFormat();

  // Tab state is component-local; the ?section= URL param was dropped —
  // nothing deep-links to a non-default section anymore.
  const [section, setSection] = useState<"account" | "appearance" | "devices">(
    "account",
  );

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [devices, setDevices] = useState<AccountDeviceRow[]>([]);
  const [renaming, setRenaming] = useState<AccountDeviceRow | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [revoking, setRevoking] = useState<AccountDeviceRow | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const { from, to } = useMemo(() => usageWindow(), []);

  // The proxy guard normally guarantees a session; if the cookie state is
  // missing anyway (expired between hops), bounce to /login.
  const handleNoClient = useCallback(() => setStatus("error"), []);
  const { accessToken, redirectToLogin } = useSessionBootstrap(
    "/settings",
    handleNoClient,
  );

  const loadDevices = useCallback(
    async (token: string) => {
      setStatus("loading");

      try {
        const payload = await fetchAccountDevices(token, { from, to });

        setDevices(Array.isArray(payload.devices) ? payload.devices : []);
        setStatus("ready");
      } catch (error) {
        if (isUnauthorized(error)) {
          redirectToLogin();

          return;
        }
        // Network-level failure must land in the retryable error state, not
        // hang on the loading skeleton forever.
        setStatus("error");
      }
    },
    [from, to, redirectToLogin],
  );

  useEffect(() => {
    if (accessToken) void loadDevices(accessToken);
  }, [accessToken, loadDevices]);

  async function submitRename() {
    const target = renaming;
    const token = accessToken;

    if (!target || !token || renameBusy) return;

    const name = renameDraft.replace(/\s+/g, " ").trim();

    if (name.length < 1 || name.length > 60) {
      setRenameError(copy.renameLengthError);

      return;
    }
    setRenameBusy(true);
    setRenameError(null);

    try {
      await renameDevice(token, { deviceId: target.id, name });
      setDevices((rows) =>
        rows.map((row) =>
          row.id === target.id ? { ...row, device_name: name } : row,
        ),
      );
      setRenaming(null);
      toast.success(copy.renameSuccess);
    } catch (error) {
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      setRenameError(
        friendlyDeviceError(
          error instanceof DashboardApiError ? error.message : "",
          copy,
        ),
      );
    } finally {
      // A network-level throw must not leave the dialog permanently busy.
      setRenameBusy(false);
    }
  }

  async function submitRevoke() {
    const target = revoking;
    const token = accessToken;

    if (!target || !token || revokeBusy) return;
    setRevokeBusy(true);

    try {
      const payload = await revokeDevice(token, { deviceId: target.id });

      setDevices((rows) => rows.filter((row) => row.id !== target.id));
      setRevoking(null);
      toast.success(
        `${copy.revokeSuccess} · ${formatMessage(
          copy.revokedTokensSummary,
          locale,
          {
            count: payload.revoked_tokens ?? 0,
          },
        )}`,
      );
    } catch (error) {
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      toast(
        friendlyDeviceError(
          error instanceof DashboardApiError ? error.message : "",
          copy,
        ),
      );
      setRevoking(null);
    } finally {
      // A network-level throw must not leave the confirm button disabled.
      setRevokeBusy(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <Tabs
        selectedKey={section}
        onSelectionChange={(key) => setSection(String(key) as typeof section)}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label={copy.pageTitle}>
            <Tabs.Tab id="account">
              <span className="flex items-center gap-1.5">
                <Person aria-hidden="true" className="size-4" />
                {copy.sectionAccount}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="appearance">
              <span className="flex items-center gap-1.5">
                <Palette aria-hidden="true" className="size-4" />
                {copy.sectionAppearance}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="devices">
              <span className="flex items-center gap-1.5">
                <Display aria-hidden="true" className="size-4" />
                {copy.sectionDevices}
              </span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {section === "account" ? (
        <div className="flex flex-col gap-4">
          <ProfileCard />
          <AvatarCard />
          <PasswordCard />
        </div>
      ) : null}
      {section === "appearance" ? <AppearancePanel /> : null}

      {section === "devices" ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <Typography type="h4" weight="medium">
              {copy.devicesHeading}
            </Typography>
            <Typography color="muted" type="body-sm">
              {copy.devicesHint}
            </Typography>
          </div>

          {status === "loading" ? (
            <Card className="p-10">
              <Card.Content className="flex items-center justify-center gap-2">
                <Spinner />
                <Typography color="muted" type="body-sm">
                  {copy.loading}
                </Typography>
              </Card.Content>
            </Card>
          ) : null}

          {status === "error" ? (
            <Card className="p-6">
              <Card.Content>
                <ErrorMessage>{copy.loadError}</ErrorMessage>
              </Card.Content>
              <Card.Footer>
                <Button
                  size="sm"
                  variant="outline"
                  onPress={() => {
                    if (accessToken) void loadDevices(accessToken);
                  }}
                >
                  {copy.retry}
                </Button>
              </Card.Footer>
            </Card>
          ) : null}

          {status === "ready" && devices.length === 0 ? (
            <Card className="p-10">
              <Card.Header>
                <Card.Title>{copy.emptyTitle}</Card.Title>
                <Card.Description>{copy.emptyBody}</Card.Description>
              </Card.Header>
            </Card>
          ) : null}

          {status === "ready" && devices.length > 0 ? (
            <Table>
              <Table.ScrollContainer>
                <Table.Content aria-label={copy.devicesHeading}>
                  <Table.Header>
                    <Table.Column isRowHeader>{copy.columnDevice}</Table.Column>
                    <Table.Column>{copy.columnPlatform}</Table.Column>
                    <Table.Column>{copy.columnJoined}</Table.Column>
                    <Table.Column>
                      {copy.columnUsage}（{copy.usageWindowLabel}）
                    </Table.Column>
                    <Table.Column>{copy.columnActions}</Table.Column>
                  </Table.Header>
                  <Table.Body>
                    {devices.map((device) => (
                      <Table.Row key={device.id}>
                        <Table.Cell className="font-medium">
                          {device.device_name}
                        </Table.Cell>
                        <Table.Cell>
                          <Chip size="sm" variant="secondary">
                            {device.platform}
                          </Chip>
                        </Table.Cell>
                        <Table.Cell>{formatDate(device.created_at)}</Table.Cell>
                        <Table.Cell className="tabular-nums">
                          {formatTokens(device.total_tokens ?? 0)}
                        </Table.Cell>
                        <Table.Cell>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              onPress={() => {
                                setRenaming(device);
                                setRenameDraft(device.device_name);
                                setRenameError(null);
                              }}
                            >
                              {copy.renameAction}
                            </Button>
                            <Button
                              size="sm"
                              variant="danger-soft"
                              onPress={() => {
                                setRevoking(device);
                              }}
                            >
                              {copy.revokeAction}
                            </Button>
                          </div>
                        </Table.Cell>
                      </Table.Row>
                    ))}
                  </Table.Body>
                </Table.Content>
              </Table.ScrollContainer>
            </Table>
          ) : null}
        </section>
      ) : null}

      {/* Rename dialog */}
      <Modal.Backdrop
        isOpen={renaming !== null}
        onOpenChange={(open) => {
          if (!open) setRenaming(null);
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.CloseTrigger isDisabled={renameBusy} />
              <Modal.Heading>{copy.renameTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  void submitRename();
                }}
              >
                <TextField
                  isRequired
                  isInvalid={renameError !== null}
                  name="device_name"
                  value={renameDraft}
                  onChange={setRenameDraft}
                >
                  <Label>{copy.renameLabel}</Label>
                  <Input
                    placeholder={renaming?.device_name ?? ""}
                    variant="secondary"
                  />
                  {renameError ? <FieldError>{renameError}</FieldError> : null}
                </TextField>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button
                slot="close"
                variant="secondary"
                onPress={() => setRenaming(null)}
              >
                {copy.renameCancel}
              </Button>
              <PendingButton
                pending={renameBusy}
                onPress={() => {
                  void submitRename();
                }}
              >
                {copy.renameSave}
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Revoke confirm dialog */}
      <Modal.Backdrop
        isOpen={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.CloseTrigger isDisabled={revokeBusy} />
              <Modal.Heading>{copy.revokeTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p>
                {revoking?.device_name} · {copy.revokeBody}
              </p>
            </Modal.Body>
            <Modal.Footer>
              <Button
                slot="close"
                variant="secondary"
                onPress={() => setRevoking(null)}
              >
                {copy.revokeCancel}
              </Button>
              <PendingButton
                pending={revokeBusy}
                variant="danger"
                onPress={submitRevoke}
              >
                {copy.revokeConfirm}
              </PendingButton>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </main>
  );
}

// Account section: the avatar card (crop + upload) and the profile card
// (display name + read-only email) are separate cards. Avatar/profile state
// lives in Supabase auth user_metadata; the sidebar reflects updates via the
// USER_UPDATED auth event.
function AvatarCard() {
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

function ProfileCard() {
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

  async function save() {
    if (saving) return;
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
            <PendingButton pending={saving} onPress={() => void save()}>
              {copy.profileSave}
            </PendingButton>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}

// Password card: set or change the login password via auth updateUser —
// this is how magic-link-only accounts enable password sign-in. Auth traffic
// goes through the exempted browser Supabase client.
function PasswordCard() {
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
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
            minLength={8}
            name="password_confirm"
            type="password"
            value={confirm}
            onChange={setConfirm}
          >
            <Label>{copy.passwordConfirmLabel}</Label>
            <Input autoComplete="new-password" variant="secondary" />
          </TextField>
          {error ? <ErrorMessage role="alert">{error}</ErrorMessage> : null}
          <div>
            <PendingButton pending={busy} type="submit">
              {copy.passwordSave}
            </PendingButton>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}
