"use client";

// Settings page: account panel + device table. Device data and mutations go
// through the contract endpoints (token-usage-account-devices / device-rename
// / device-revoke, docs/cli-contract.md §2.7–2.9) with the browser session's
// Supabase JWT — the dual-principal path, never a browser→table connection.

import {
  Avatar,
  Button,
  Card,
  Chip,
  Description,
  ErrorMessage,
  FieldError,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  Table,
  TextField,
  Typography,
  toast,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { useProfile } from "@/lib/auth/profile";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import { SETTINGS_COPY, type SettingsCopy } from "@/lib/copy/settings";
import { useLocale } from "@/lib/copy/locale";

interface DeviceRow {
  id: string;
  device_name: string;
  platform: string;
  created_at: string;
  total_tokens: number;
}

type LoadStatus = "loading" | "ready" | "error";

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

function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "zh" ? "zh-CN" : "en-US").format(
    value,
  );
}

function formatDate(iso: string, locale: string): string {
  const date = new Date(iso);

  if (Number.isNaN(date.getTime())) return iso;

  return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
    dateStyle: "medium",
  }).format(date);
}

function friendlyDeviceError(code: string, copy: SettingsCopy): string {
  if (code === "device_name_taken") return copy.errorDeviceNameTaken;

  return copy.errorGeneric;
}

export function SettingsClient() {
  const router = useRouter();
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [devices, setDevices] = useState<DeviceRow[]>([]);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<DeviceRow | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [renameBusy, setRenameBusy] = useState(false);
  const [revoking, setRevoking] = useState<DeviceRow | null>(null);
  const [revokeBusy, setRevokeBusy] = useState(false);

  const { from, to } = useMemo(() => usageWindow(), []);

  const redirectToLogin = useCallback(
    (target = "/settings") => {
      router.replace(`${LOGIN_PATH}?next=${encodeURIComponent(target)}`);
    },
    [router],
  );

  // The proxy guard normally guarantees a session; if the cookie state is
  // missing anyway (expired between hops), bounce to /login.
  const loadDevices = useCallback(
    async (token: string) => {
      setStatus("loading");

      const query = new URLSearchParams({ from, to });
      const response = await fetch(
        `/api/functions/token-usage-account-devices?${query}`,
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (response.status === 401) {
        redirectToLogin();

        return;
      }
      if (!response.ok) {
        setStatus("error");

        return;
      }
      const payload = (await response.json()) as { devices?: DeviceRow[] };

      setDevices(Array.isArray(payload.devices) ? payload.devices : []);
      setStatus("ready");
    },
    [from, to, redirectToLogin],
  );

  useEffect(() => {
    const supabase = authBrowserClient();

    if (!supabase) {
      setStatus("error");

      return;
    }

    void (async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (!session?.access_token) {
        redirectToLogin();

        return;
      }
      setAccessToken(session.access_token);
      await loadDevices(session.access_token);
    })();
  }, [loadDevices, redirectToLogin]);

  async function submitRename() {
    const target = renaming;
    const supabase = authBrowserClient();
    const token = accessToken;

    if (!target || !supabase || !token || renameBusy) return;

    const name = renameDraft.replace(/\s+/g, " ").trim();

    if (name.length < 1 || name.length > 60) {
      setRenameError(copy.renameLengthError);

      return;
    }
    setRenameBusy(true);
    setRenameError(null);

    const response = await fetch("/api/functions/token-usage-device-rename", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ device_id: target.id, device_name: name }),
    });

    setRenameBusy(false);

    if (response.status === 401) {
      redirectToLogin();

      return;
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      setRenameError(friendlyDeviceError(payload.error || "", copy));

      return;
    }
    setDevices((rows) =>
      rows.map((row) =>
        row.id === target.id ? { ...row, device_name: name } : row,
      ),
    );
    setRenaming(null);
    toast.success(copy.renameSuccess);
  }

  async function submitRevoke() {
    const target = revoking;
    const supabase = authBrowserClient();
    const token = accessToken;

    if (!target || !supabase || !token || revokeBusy) return;
    setRevokeBusy(true);

    const response = await fetch("/api/functions/token-usage-device-revoke", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ device_id: target.id }),
    });

    setRevokeBusy(false);

    if (response.status === 401) {
      redirectToLogin();

      return;
    }
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
      };

      toast(friendlyDeviceError(payload.error || "", copy));
      setRevoking(null);

      return;
    }
    const payload = (await response.json().catch(() => ({}))) as {
      revoked_tokens?: number;
    };

    setDevices((rows) => rows.filter((row) => row.id !== target.id));
    setRevoking(null);
    toast.success(
      `${copy.revokeSuccess} · ${payload.revoked_tokens ?? 0} ${copy.revokedTokensSuffix}`,
    );
  }

  const dateFormatter = (iso: string) => formatDate(iso, locale);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Typography type="h3">{copy.pageTitle}</Typography>
      </header>

      <ProfileCard />

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
                      <Table.Cell>
                        {dateFormatter(device.created_at)}
                      </Table.Cell>
                      <Table.Cell>
                        {formatNumber(device.total_tokens ?? 0, locale)}{" "}
                        {copy.usageUnit}
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

      {/* Rename dialog */}
      <Modal>
        <Modal.Backdrop
          isOpen={renaming !== null}
          onOpenChange={(open) => {
            if (!open) setRenaming(null);
          }}
        >
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
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
                    {renameError ? (
                      <FieldError>{renameError}</FieldError>
                    ) : null}
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
                <Button
                  isPending={renameBusy}
                  onPress={() => {
                    void submitRename();
                  }}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {copy.renameSave}
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>

      {/* Revoke confirm dialog */}
      <Modal>
        <Modal.Backdrop
          isOpen={revoking !== null}
          onOpenChange={(open) => {
            if (!open) setRevoking(null);
          }}
        >
          <Modal.Container>
            <Modal.Dialog>
              <Modal.Header>
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
                <Button
                  isPending={revokeBusy}
                  variant="danger"
                  onPress={submitRevoke}
                >
                  {({ isPending }) => (
                    <>
                      {isPending ? <Spinner color="current" size="sm" /> : null}
                      {copy.revokeConfirm}
                    </>
                  )}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
        </Modal.Backdrop>
      </Modal>
    </main>
  );
}

// Profile editing: display name + avatar URL persisted to auth user_metadata
// (email is admin-assigned and read-only). The sidebar reflects updates via
// the USER_UPDATED auth event.
function ProfileCard() {
  const { profile, updateProfile } = useProfile();
  const [name, setName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!profile || loadedFor.current === profile.email) return;
    loadedFor.current = profile.email;
    setName(profile.displayName);
    setAvatarUrl(profile.avatarUrl ?? "");
  }, [profile]);

  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];

  async function save() {
    if (saving) return;
    setSaving(true);

    const { error } = await updateProfile({
      display_name: name.trim(),
      avatar_url: avatarUrl.trim() || undefined,
    });

    setSaving(false);
    if (error) {
      toast(`${copy.profileSaveFailed} (${error})`);
    } else {
      toast.success(copy.profileSaved);
    }
  }

  const initial = (name.trim() || profile?.email || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.profileHeading}</Card.Title>
        <Card.Description>{copy.profileHint}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-4 md:flex-row md:items-start">
        <Avatar className="size-20 shrink-0">
          {avatarUrl.trim() ? (
            <Avatar.Image alt={initial} src={avatarUrl.trim()} />
          ) : null}
          <Avatar.Fallback className="text-2xl">{initial}</Avatar.Fallback>
        </Avatar>
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
          <TextField
            name="avatar_url"
            value={avatarUrl}
            onChange={setAvatarUrl}
          >
            <Label>{copy.profileAvatarLabel}</Label>
            <Input placeholder="https://…" type="url" variant="secondary" />
            <Description>{copy.profileAvatarHint}</Description>
          </TextField>
          <TextField isDisabled name="email" value={profile?.email ?? ""}>
            <Label>{copy.profileEmailLabel}</Label>
            <Input variant="secondary" />
          </TextField>
          <div>
            <Button isPending={saving} onPress={() => void save()}>
              {copy.profileSave}
            </Button>
          </div>
        </Form>
      </Card.Content>
    </Card>
  );
}
