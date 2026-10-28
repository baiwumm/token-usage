"use client";

// Settings page: account panel + device table. Device data and mutations go
// through the contract endpoints (token-usage-account-devices / device-rename
// / device-revoke, docs/cli-contract.md §2.7–2.9) with the browser session's
// Supabase JWT — the dual-principal path, never a browser→table connection.
//
// This file is the orchestrator: auth bootstrap, device loading, the mutation
// handlers and the page <main> composition. The account cards live beside it
// (profile/avatar/budget/password-card.tsx), the device UI in
// devices-table.tsx + device-dialogs.tsx, and the pure device rules in
// device-helpers.ts.

import type { LoadStatus } from "@/lib/loadable";

import { Display, Palette, Person } from "@gravity-ui/icons";
import { Tabs, toast } from "@heroui/react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { AppearancePanel } from "./appearance-panel";
import { DataRefreshCard } from "./data-refresh-card";
import { PreferencesFooter } from "./preferences-footer";
import { AvatarCard } from "./avatar-card";
import { BudgetCard } from "./budget-card";
import {
  RenameDeviceDialog,
  RestoreDeviceDialog,
  RevokeDeviceDialog,
} from "./device-dialogs";
import {
  defaultNameFor,
  friendlyDeviceError,
  usageWindow,
} from "./device-helpers";
import { DevicesTable } from "./devices-table";
import { PasswordCard } from "./password-card";
import { ProfileCard } from "./profile-card";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { SETTINGS_COPY } from "@/lib/copy/settings";
import {
  DashboardApiError,
  fetchAccountDevices,
  isUnauthorized,
  renameDevice,
  revokeDevice,
  type AccountDeviceRow,
} from "@/lib/dashboard/api";

export function SettingsClient() {
  const [locale] = useLocale();
  const copy = SETTINGS_COPY[locale];

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

  const openRename = useCallback((device: AccountDeviceRow) => {
    setRenaming(device);
    setRenameDraft(device.device_name);
    setRenameError(null);
  }, []);

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
        <DevicesTable
          copy={copy}
          rows={devices}
          status={status}
          onRename={openRename}
          onRestore={setRestoring}
          onRetry={() => {
            if (accessToken) void loadDevices(accessToken);
          }}
          onRevoke={openRevoke}
        />
      ) : null}

      <RenameDeviceDialog
        busy={renameBusy}
        copy={copy}
        device={renaming}
        draft={renameDraft}
        error={renameError}
        onClose={() => {
          setRenaming(null);
        }}
        onDraftChange={setRenameDraft}
        onSubmit={() => {
          void submitRename();
        }}
      />

      <RestoreDeviceDialog
        busy={restoreBusy}
        copy={copy}
        device={restoring}
        locale={locale}
        onClose={() => {
          setRestoring(null);
        }}
        onSubmit={() => {
          void submitRestore();
        }}
      />

      <RevokeDeviceDialog
        busy={revokeBusy}
        copy={copy}
        device={revoking}
        draft={revokeDraft}
        locale={locale}
        step={revokeStep}
        onClose={closeRevoke}
        onContinue={() => {
          setRevokeStep("type");
        }}
        onDraftChange={setRevokeDraft}
        onSubmit={() => {
          void submitRevoke();
        }}
      />
    </main>
  );
}
