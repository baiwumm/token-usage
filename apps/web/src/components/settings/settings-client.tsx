"use client";

// Settings page: account panel + device table. Device data and mutations go
// through the contract endpoints (token-usage-account-devices / device-rename
// / device-revoke, docs/cli-contract.md §2.7–2.9) with the browser session's
// Supabase JWT — the dual-principal path, never a browser→table connection.

import type { LoadStatus } from "@/lib/loadable";

import {
  ArrowRotateLeft,
  Camera,
  Display,
  Palette,
  Pencil,
  Person,
  TrashBin,
} from "@gravity-ui/icons";
import {
  AlertDialog,
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
  NumberField,
  Spinner,
  Tabs,
  TextField,
  Tooltip,
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
  type ReactNode,
} from "react";

import {
  AppearancePanel,
  DataRefreshCard,
  PreferencesFooter,
} from "./appearance-panel";
import { AvatarCropDialog } from "./avatar-crop-dialog";

import { authBrowserClient } from "@/lib/auth/browser";
import { useAvatarUpload, useProfile } from "@/lib/auth/profile";
import { MAX_MONTHLY_BUDGET_USD, useBudgetStore } from "@/stores/budget-store";
import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { SETTINGS_COPY, type SettingsCopy } from "@/lib/copy/settings";
import { useFormat } from "@/lib/format/format";
import { PendingButton } from "@/components/pending-button";
import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
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

// The creation snapshot (§2.7) decides whether the restore action is live; the
// button always renders so the actions column stays aligned across rows.
function defaultNameFor(device: AccountDeviceRow): string | null {
  return device.default_device_name &&
    device.default_device_name !== device.device_name
    ? device.default_device_name
    : null;
}

// Icon-only table actions carry their label in a tooltip (docs/ui-spec.md).
function ActionTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip delay={0}>
      {children}
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{label}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
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
  const [restoring, setRestoring] = useState<AccountDeviceRow | null>(null);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [revoking, setRevoking] = useState<AccountDeviceRow | null>(null);
  const [revokeStep, setRevokeStep] = useState<"confirm" | "type">("confirm");
  const [revokeDraft, setRevokeDraft] = useState("");
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

  async function submitRestore() {
    const target = restoring;
    const token = accessToken;
    const name = target ? defaultNameFor(target) : null;

    if (!target || !token || !name || restoreBusy) return;
    setRestoreBusy(true);

    try {
      await renameDevice(token, { deviceId: target.id, name });
      setDevices((rows) =>
        rows.map((row) =>
          row.id === target.id ? { ...row, device_name: name } : row,
        ),
      );
      setRestoring(null);
      toast.success(copy.restoreSuccess);
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
      setRestoring(null);
    } finally {
      setRestoreBusy(false);
    }
  }

  const openRevoke = useCallback((device: AccountDeviceRow) => {
    setRevoking(device);
    setRevokeStep("confirm");
    setRevokeDraft("");
  }, []);

  function closeRevoke() {
    setRevoking(null);
    setRevokeStep("confirm");
    setRevokeDraft("");
  }

  async function submitRevoke() {
    const target = revoking;
    const token = accessToken;

    if (!target || !token || revokeBusy) return;
    setRevokeBusy(true);

    try {
      const payload = await revokeDevice(token, { deviceId: target.id });

      setDevices((rows) => rows.filter((row) => row.id !== target.id));
      closeRevoke();
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
      closeRevoke();
    } finally {
      // A network-level throw must not leave the confirm button disabled.
      setRevokeBusy(false);
    }
  }

  const revokeDraftTrimmed = revokeDraft.trim();
  const revokeMatches =
    revoking !== null && revokeDraftTrimmed === revoking.device_name;
  const revokeMismatch = revokeDraftTrimmed.length > 0 && !revokeMatches;

  const deviceColumns = useMemo<DataTableColumn<AccountDeviceRow>[]>(
    () => [
      {
        id: "device",
        header: copy.columnDevice,
        className: "font-medium",
        cell: (device) => device.device_name,
      },
      {
        id: "platform",
        header: copy.columnPlatform,
        cell: (device) => (
          <Chip size="sm" variant="secondary">
            {device.platform}
          </Chip>
        ),
      },
      {
        id: "joined",
        header: copy.columnJoined,
        cell: (device) => formatDate(device.created_at),
      },
      {
        id: "usage",
        header: `${copy.columnUsage}（${copy.usageWindowLabel}）`,
        className: "tabular-nums",
        cell: (device) => formatTokens(device.total_tokens ?? 0),
      },
      {
        id: "actions",
        header: copy.columnActions,
        cell: (device) => (
          <div className="flex gap-2">
            <ActionTooltip label={copy.renameAction}>
              <Button
                isIconOnly
                aria-label={copy.renameAction}
                size="sm"
                variant="secondary"
                onPress={() => {
                  setRenaming(device);
                  setRenameDraft(device.device_name);
                  setRenameError(null);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label={copy.restoreAction}>
              <Button
                isIconOnly
                aria-label={copy.restoreAction}
                isDisabled={!defaultNameFor(device)}
                size="sm"
                variant="tertiary"
                onPress={() => {
                  setRestoring(device);
                }}
              >
                <ArrowRotateLeft aria-hidden="true" className="size-4" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label={copy.revokeAction}>
              <Button
                isIconOnly
                aria-label={copy.revokeAction}
                size="sm"
                variant="danger-soft"
                onPress={() => {
                  openRevoke(device);
                }}
              >
                <TrashBin aria-hidden="true" className="size-4" />
              </Button>
            </ActionTooltip>
          </div>
        ),
      },
    ],
    [copy, formatDate, formatTokens, openRevoke],
  );

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
          <BudgetCard />
          <PasswordCard />
        </div>
      ) : null}
      {section === "appearance" ? (
        <div className="flex flex-col gap-4">
          <AppearancePanel />
          <DataRefreshCard />
          <PreferencesFooter />
        </div>
      ) : null}

      {section === "devices" ? (
        <DataTableCard
          className="p-6"
          columns={deviceColumns}
          empty={
            <div className="flex flex-col gap-1 py-4">
              <Typography type="body-sm" weight="semibold">
                {copy.emptyTitle}
              </Typography>
              <Typography color="muted" type="body-sm">
                {copy.emptyBody}
              </Typography>
            </div>
          }
          error={{
            message: copy.loadError,
            onRetry: () => {
              if (accessToken) void loadDevices(accessToken);
            },
            retryLabel: copy.retry,
          }}
          hint={copy.devicesHint}
          rowKey={(device) => device.id}
          rows={devices}
          status={status}
          tableLabel={copy.devicesHeading}
          title={copy.devicesHeading}
        />
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

      {/* Restore-default-name confirmation. Reuses the frozen rename endpoint
          with the creation snapshot as the new name (§2.7 + §2.8). */}
      <AlertDialog.Backdrop
        isOpen={restoring !== null}
        onOpenChange={(open) => {
          if (!open) setRestoring(null);
        }}
      >
        <AlertDialog.Container>
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="accent" />
              <AlertDialog.Heading>{copy.restoreTitle}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <Typography type="body-sm">
                {restoring
                  ? formatMessage(copy.restoreBody, locale, {
                      current: restoring.device_name,
                      defaultName: restoring.default_device_name,
                    })
                  : null}
              </Typography>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button isDisabled={restoreBusy} slot="close" variant="tertiary">
                {copy.restoreCancel}
              </Button>
              <PendingButton
                pending={restoreBusy}
                onPress={() => {
                  void submitRestore();
                }}
              >
                {copy.restoreConfirm}
              </PendingButton>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>

      {/* Revoke step 1 — consequence summary. */}
      <Modal.Backdrop
        isOpen={revoking !== null && revokeStep === "confirm"}
        onOpenChange={(open) => {
          if (!open) closeRevoke();
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.CloseTrigger />
              <Modal.Heading>{copy.revokeTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Typography type="body-sm">
                {revoking?.device_name} · {copy.revokeBody}
              </Typography>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">
                {copy.revokeCancel}
              </Button>
              <Button
                variant="danger"
                onPress={() => {
                  setRevokeStep("type");
                }}
              >
                {copy.revokeContinue}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>

      {/* Revoke step 2 — typed confirmation. The final button only unlocks on
          an exact name match; this is a deliberate extra gate on a destructive,
          irreversible action. */}
      <Modal.Backdrop
        isOpen={revoking !== null && revokeStep === "type"}
        onOpenChange={(open) => {
          if (!open && !revokeBusy) closeRevoke();
        }}
      >
        <Modal.Container>
          <Modal.Dialog>
            <Modal.Header>
              <Modal.CloseTrigger isDisabled={revokeBusy} />
              <Modal.Heading>{copy.revokeTypeTitle}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <Form
                className="flex flex-col gap-4"
                onSubmit={(event) => {
                  event.preventDefault();
                  if (revokeMatches) void submitRevoke();
                }}
              >
                <Typography type="body-sm">
                  {formatMessage(copy.revokeTypeBody, locale, {
                    name: revoking?.device_name ?? "",
                  })}
                </Typography>
                <TextField
                  isRequired
                  isInvalid={revokeMismatch}
                  name="revoke_confirm"
                  value={revokeDraft}
                  onChange={setRevokeDraft}
                >
                  <Label>{copy.revokeTypeLabel}</Label>
                  <Input
                    autoComplete="off"
                    placeholder={copy.revokeTypePlaceholder}
                    variant="secondary"
                  />
                  {revokeMismatch ? (
                    <FieldError>{copy.revokeTypeMismatch}</FieldError>
                  ) : null}
                </TextField>
              </Form>
            </Modal.Body>
            <Modal.Footer>
              <Button isDisabled={revokeBusy} slot="close" variant="secondary">
                {copy.revokeCancel}
              </Button>
              <PendingButton
                isDisabled={!revokeMatches}
                pending={revokeBusy}
                variant="danger"
                onPress={() => {
                  void submitRevoke();
                }}
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

// Budget card: the monthly spend cap (D5) is a local preference — it feeds
// the dashboard's exceeded-budget warning and lives in localStorage, not in
// the database.
function BudgetCard() {
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];
  const monthlyBudgetUsd = useBudgetStore((state) => state.monthlyBudgetUsd);
  const setMonthlyBudgetUsd = useBudgetStore(
    (state) => state.setMonthlyBudgetUsd,
  );
  // Draft, not a direct store binding: typing stays local until save. The
  // effect also re-syncs after hydration — the first client render replays the
  // SSR snapshot (0), so an initializer alone leaves the field empty even
  // though the saved budget is already in localStorage. NaN is react-aria's
  // empty number-field value.
  const [draft, setDraft] = useState(
    monthlyBudgetUsd > 0 ? monthlyBudgetUsd : Number.NaN,
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(monthlyBudgetUsd > 0 ? monthlyBudgetUsd : Number.NaN);
  }, [monthlyBudgetUsd]);

  function save() {
    if (saving) return;
    setSaving(true);
    setMonthlyBudgetUsd(Number.isFinite(draft) && draft > 0 ? draft : 0);
    setSaving(false);
    toast.success(copy.budgetSaved);
  }

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.budgetHeading}</Card.Title>
        <Card.Description>{copy.budgetHint}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Form
          className="flex w-full flex-col gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            save();
          }}
        >
          <NumberField
            fullWidth
            formatOptions={{ maximumFractionDigits: 0 }}
            maxValue={MAX_MONTHLY_BUDGET_USD}
            minValue={0}
            name="monthly_budget_usd"
            step={1}
            value={draft}
            variant="secondary"
            onChange={setDraft}
          >
            <Label>{copy.budgetLabel}</Label>
            <NumberField.Group>
              <NumberField.DecrementButton />
              <NumberField.Input placeholder="0" />
              <NumberField.IncrementButton />
            </NumberField.Group>
          </NumberField>
          <div>
            <PendingButton pending={saving} type="submit">
              {copy.budgetSave}
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
            <Input
              autoComplete="new-password"
              placeholder={copy.passwordConfirmPlaceholder}
              variant="secondary"
            />
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
