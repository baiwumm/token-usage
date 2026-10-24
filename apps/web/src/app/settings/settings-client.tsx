"use client";

// Settings page: account panel + device table. Device data and mutations go
// through the contract endpoints (token-usage-account-devices / device-rename
// / device-revoke, docs/cli-contract.md §2.7–2.9) with the browser session's
// Supabase JWT — the dual-principal path, never a browser→table connection.

import {
  Button,
  Card,
  Chip,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  Table,
  TextField,
  toast,
} from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";

import { authBrowserClient } from "@/lib/auth/browser";
import { LOGIN_PATH, resolvePostLoginPath } from "@/lib/auth/next-path";
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
  const [email, setEmail] = useState<string | null>(null);
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
      setEmail(session.user.email ?? null);
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

  async function signOut() {
    const supabase = authBrowserClient();

    await supabase?.auth.signOut();
    router.replace(resolvePostLoginPath(null));
    router.refresh();
  }

  const dateFormatter = (iso: string) => formatDate(iso, locale);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">{copy.pageTitle}</h1>
        <div className="flex items-center gap-3">
          {email ? (
            <span className="text-foreground/60 text-sm">{email}</span>
          ) : null}
          <Button size="sm" variant="outline" onPress={signOut}>
            {copy.signOut}
          </Button>
        </div>
      </header>

      <Card className="flex flex-col gap-3 p-6">
        <h2 className="font-medium">{copy.accountHeading}</h2>
        <p className="text-foreground/60 text-sm">
          {copy.signedInAs}
          {email ? `：${email}` : ""}
        </p>
      </Card>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="font-medium">{copy.devicesHeading}</h2>
          <p className="text-foreground/60 text-sm">{copy.devicesHint}</p>
        </div>

        {status === "loading" ? (
          <Card className="items-center gap-2 p-10">
            <Spinner />
            <p className="text-foreground/60 text-sm">{copy.loading}</p>
          </Card>
        ) : null}

        {status === "error" ? (
          <Card className="flex-col gap-3 p-6">
            <p className="text-danger text-sm">{copy.loadError}</p>
            <Button
              size="sm"
              variant="outline"
              onPress={() => {
                if (accessToken) void loadDevices(accessToken);
              }}
            >
              {copy.retry}
            </Button>
          </Card>
        ) : null}

        {status === "ready" && devices.length === 0 ? (
          <Card className="flex-col gap-2 p-10">
            <p className="font-medium">{copy.emptyTitle}</p>
            <p className="text-foreground/60 text-sm">{copy.emptyBody}</p>
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
                      <p className="text-danger text-sm" role="alert">
                        {renameError}
                      </p>
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
