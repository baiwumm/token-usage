"use client";

// Settings · public badge tab orchestrator (docs/badge.md §7, docs/ui-spec.md
// 设置 · 公开徽章). Self-loading: reads and writes /api/app/badge with the
// browser session's cookies, owns the loaded settings, the drafts, the
// selection and every mutation. The three cards below it are presentational
// (account settings / badge list / selected badge).
//
// 2026-11-13 (multi-badge model): one row per badge; the token is always
// readable, so every card can show a real link. Revoke is reversible (same
// link), delete is permanent, and restyling PATCHes the row so already
// embedded badges follow without touching the README.

import type { LoadStatus } from "@/lib/loadable";

import { Card, Skeleton, toast } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { BadgeDetailCard } from "./badge-detail-card";
import {
  BadgeNameDialog,
  DeleteBadgeDialog,
  type BadgeNameDialogState,
} from "./badge-dialogs";
import { badgeUrl } from "./badge-helpers";
import { BadgeLinksCard } from "./badge-links-card";
import {
  BadgeSettingsCard,
  type BadgeSettingsBusy,
} from "./badge-settings-card";
import { copyText } from "./badge-snippet-section";

import { SectionError } from "@/components/section-states";
import { LOGIN_PATH } from "@/lib/auth/next-path";
import {
  BadgeApiError,
  createBadge,
  deleteBadgeLink,
  fetchBadgeSettings,
  isUnauthorized,
  updateBadgeConfig,
  updateBadgeLink,
  type BadgeConfig,
  type BadgeLink,
  type BadgeLinkInput,
  type BadgeSettings,
} from "@/lib/badge/api";
import { MAX_BADGES } from "@/lib/badge/limits";
import { BADGE_COPY } from "@/lib/copy/badge";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { browserTimezone } from "@/lib/dashboard/ranges";

// Loading placeholder mirroring the real three-card layout (account settings /
// badge list / selected badge) so the swap to content doesn't jump.
function BadgeRowSkeleton() {
  return (
    <div className="flex items-center gap-2 rounded-xl px-3 py-2.5">
      <div className="flex min-w-0 flex-1 flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-24 rounded-md" />
          <Skeleton className="h-5 w-10 rounded-full" />
        </div>
        <Skeleton className="h-3 w-52 rounded-md" />
      </div>
      <div className="flex shrink-0 gap-1">
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
        <Skeleton className="size-8 rounded-lg" />
      </div>
    </div>
  );
}

function BadgeSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <Card className="p-6">
        <Card.Header>
          <div className="flex flex-col gap-2">
            <Skeleton className="h-5 w-24 rounded-md" />
            <Skeleton className="h-3.5 w-96 max-w-full rounded-md" />
          </div>
        </Card.Header>
        <Card.Content className="divide-border/60 flex flex-col divide-y">
          <div className="flex items-center justify-between py-4 first:pt-0">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-6 w-11 rounded-full" />
          </div>
          <div className="flex flex-col gap-2 py-4">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-3 w-64 max-w-full rounded-md" />
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Skeleton className="h-9 w-full rounded-lg md:max-w-md" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
          <div className="flex flex-col gap-2 py-4 last:pb-0">
            <div className="flex flex-col gap-1">
              <Skeleton className="h-4 w-16 rounded-md" />
              <Skeleton className="h-3 w-56 max-w-full rounded-md" />
            </div>
            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <Skeleton className="h-9 w-full rounded-lg md:max-w-md" />
              <Skeleton className="h-8 w-20 rounded-lg" />
            </div>
          </div>
        </Card.Content>
      </Card>

      <Card className="p-6">
        <Card.Header>
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-5 w-20 rounded-md" />
              <Skeleton className="h-3.5 w-72 max-w-full rounded-md" />
            </div>
            <Skeleton className="h-8 w-28 rounded-lg" />
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-1">
          <BadgeRowSkeleton />
          <BadgeRowSkeleton />
        </Card.Content>
      </Card>

      <Card className="p-6">
        <Card.Content className="divide-border/60 flex flex-col divide-y">
          <div className="flex flex-col gap-2 py-4 first:pt-0">
            <Skeleton className="h-4 w-16 rounded-md" />
            <div className="flex flex-wrap items-end gap-4">
              <Skeleton className="h-14 w-44 rounded-lg" />
              <Skeleton className="h-14 w-44 rounded-lg" />
              <Skeleton className="h-14 w-28 rounded-lg" />
              <Skeleton className="h-9 w-48 rounded-lg" />
            </div>
          </div>
          <div className="flex flex-col gap-2 py-4">
            <Skeleton className="h-4 w-16 rounded-md" />
            <Skeleton className="h-48 w-full rounded-xl" />
          </div>
          <div className="flex flex-col gap-2 py-4 last:pb-0">
            <Skeleton className="h-4 w-20 rounded-md" />
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}

export function BadgeCard() {
  const [locale] = useLocale();
  const copy = BADGE_COPY[locale];
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [settings, setSettings] = useState<BadgeSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftProjects, setDraftProjects] = useState<string[]>([]);
  const [busy, setBusy] = useState<BadgeSettingsBusy | null>(null);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  // Only the revoke/restore PATCH gets the row spinner (ui-spec); the other
  // PATCHes show their result in the detail card without row chrome.
  const [linkAction, setLinkAction] = useState<"revoke" | null>(null);
  // Shared add/edit name dialog (§7.2): the draft, the inline error and the
  // confirm-button busy live here so reopening starts clean.
  const [nameDialog, setNameDialog] = useState<BadgeNameDialogState | null>(
    null,
  );
  const [nameDraft, setNameDraft] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [nameBusy, setNameBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<BadgeLink | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [previewVersion, setPreviewVersion] = useState(0);
  // `window` does not exist during the server render; the snippet needs the
  // real origin, so read it after mount instead of touching window in render.
  const [origin, setOrigin] = useState("");

  const redirectToLogin = useCallback(() => {
    router.replace(`${LOGIN_PATH}?next=${encodeURIComponent("/settings")}`);
  }, [router]);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const next = await fetchBadgeSettings();

      setSettings(next);
      setDraftName(next.displayName);
      setDraftProjects(next.allowedProjects);
      setSelectedId((current) =>
        current && next.badges.some((badge) => badge.id === current)
          ? current
          : (next.badges[0]?.id ?? null),
      );
      setStatus("ready");
    } catch (error) {
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      setStatus("error");
    }
  }, [redirectToLogin]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  // Saved config replaces the loaded one; the known-projects list and the
  // badge rows only come with GET and stay as loaded.
  const applyConfig = useCallback((config: BadgeConfig) => {
    setSettings((current) => (current ? { ...current, ...config } : current));
  }, []);

  const handleFailure = useCallback(
    (error: unknown) => {
      if (isUnauthorized(error)) redirectToLogin();
      else toast(copy.saveError);
    },
    [copy.saveError, redirectToLogin],
  );

  function replaceBadge(badge: BadgeLink) {
    setSettings((current) =>
      current
        ? {
            ...current,
            badges: current.badges.map((row) =>
              row.id === badge.id ? badge : row,
            ),
          }
        : current,
    );
    setPreviewVersion((value) => value + 1);
  }

  async function toggleEnabled(enabled: boolean) {
    if (busy) return;
    setBusy("toggle");
    try {
      // §3.4: every save carries the browser's zone for active-day bucketing.
      applyConfig(
        await updateBadgeConfig({ enabled, timezone: browserTimezone() }),
      );
      toast.success(enabled ? copy.enabledOn : copy.enabledOff);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveName() {
    if (busy) return;
    setBusy("name");
    try {
      // §3.4: every save carries the browser's zone for active-day bucketing.
      const config = await updateBadgeConfig({
        displayName: draftName,
        timezone: browserTimezone(),
      });

      applyConfig(config);
      // The server trims; adopt its value so the dirty check settles.
      setDraftName(config.displayName);
      setPreviewVersion((value) => value + 1);
      toast.success(copy.nameSaved);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveProjects() {
    if (busy) return;
    setBusy("projects");
    try {
      const { fallbackBadgeIds, ...config } = await updateBadgeConfig({
        allowedProjects: draftProjects,
        timezone: browserTimezone(),
      });

      applyConfig(config);
      setDraftProjects(config.allowedProjects);
      // §7.1 cascade: rows that pointed at a project which just left the
      // allowlist now carry project=null in the response, so the rows and the
      // preview follow without a refetch.
      setPreviewVersion((value) => value + 1);
      if (fallbackBadgeIds.length > 0) {
        toast.success(
          formatMessage(copy.projectsCascaded, locale, {
            count: fallbackBadgeIds.length,
          }),
        );
      } else {
        toast.success(copy.projectsSaved);
      }
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  function openAdd() {
    setNameDraft("");
    setNameError(null);
    setNameDialog({ mode: "add" });
  }

  function openEdit(badge: BadgeLink) {
    setNameDraft(badge.label);
    setNameError(null);
    setNameDialog({ mode: "edit", badge });
  }

  // Shared add/edit confirm (§7.2): the name is required and capped by the
  // dialog; the server re-validates both. Failures keep the dialog open so
  // the draft survives a retry.
  async function submitName() {
    const target = nameDialog;

    if (!target || nameBusy) return;
    const label = nameDraft.trim();

    if (label.length === 0) {
      setNameError(copy.labelRequired);

      return;
    }

    // Instant duplicate check against the loaded rows; the server mirrors it
    // (trimmed + case-folded, self excluded, §7.1).
    const selfId = target.mode === "edit" ? target.badge.id : null;

    if (
      (settings?.badges ?? []).some(
        (row) =>
          row.id !== selfId &&
          row.label.trim().toLowerCase() === label.toLowerCase(),
      )
    ) {
      setNameError(copy.labelDuplicate);

      return;
    }
    setNameBusy(true);
    try {
      if (target.mode === "add") {
        const badge = await createBadge({ label, timezone: browserTimezone() });

        // POST enables the public switch when it was off (§7.1).
        setSettings((current) =>
          current
            ? { ...current, enabled: true, badges: [...current.badges, badge] }
            : current,
        );
        setSelectedId(badge.id);
        setPreviewVersion((value) => value + 1);
      } else {
        replaceBadge(await updateBadgeLink(target.badge.id, { label }));
        toast.success(copy.labelSaved);
      }
      setNameDialog(null);
    } catch (error) {
      if (
        error instanceof BadgeApiError &&
        error.status === 409 &&
        error.message === "Label already exists"
      ) {
        // The local list can be stale (another tab); surface the server's
        // verdict inline instead of a toast.
        setNameError(copy.labelDuplicate);
      } else {
        handleFailure(error);
      }
    } finally {
      setNameBusy(false);
    }
  }

  async function updateLink(badge: BadgeLink, patch: BadgeLinkInput) {
    if (linkBusyId) return;
    setLinkBusyId(badge.id);
    try {
      replaceBadge(await updateBadgeLink(badge.id, patch));
    } catch (error) {
      handleFailure(error);
    } finally {
      setLinkBusyId(null);
    }
  }

  async function toggleRevoked(badge: BadgeLink) {
    if (linkBusyId) return;
    const revoked = badge.revokedAt === null;

    setLinkBusyId(badge.id);
    setLinkAction("revoke");
    try {
      replaceBadge(await updateBadgeLink(badge.id, { revoked }));
      toast.success(revoked ? copy.revokeDone : copy.restoreDone);
    } catch (error) {
      handleFailure(error);
    } finally {
      setLinkBusyId(null);
      setLinkAction(null);
    }
  }

  async function confirmDelete() {
    const target = deleteTarget;

    if (!target || deleteBusy) return;
    setDeleteBusy(true);
    try {
      await deleteBadgeLink(target.id);
      const remaining = (settings?.badges ?? []).filter(
        (row) => row.id !== target.id,
      );

      setSettings((current) =>
        current ? { ...current, badges: remaining } : current,
      );
      setSelectedId((current) =>
        current === target.id ? (remaining[0]?.id ?? null) : current,
      );
      setDeleteTarget(null);
      setPreviewVersion((value) => value + 1);
      toast.success(copy.deleteDone);
    } catch (error) {
      handleFailure(error);
    } finally {
      setDeleteBusy(false);
    }
  }

  function copyLink(badge: BadgeLink) {
    void copyText(badgeUrl(origin, badge.token), copy, copy.copyLinkDone);
  }

  if (status !== "ready" || !settings) {
    if (status === "error") {
      return (
        <Card className="p-6">
          <SectionError
            message={copy.loadError}
            retry={() => void load()}
            retryLabel={copy.retry}
          />
        </Card>
      );
    }

    return <BadgeSkeleton />;
  }

  const selected =
    settings.badges.find((badge) => badge.id === selectedId) ?? null;

  return (
    <>
      <BadgeSettingsCard
        badgeCount={settings.badges.length}
        busy={busy}
        copy={copy}
        draftName={draftName}
        draftProjects={draftProjects}
        locale={locale}
        settings={settings}
        onDraftNameChange={setDraftName}
        onDraftProjectsChange={setDraftProjects}
        onSaveName={() => {
          void saveName();
        }}
        onSaveProjects={() => {
          void saveProjects();
        }}
        onToggleEnabled={(enabled) => {
          void toggleEnabled(enabled);
        }}
      />

      <BadgeLinksCard
        badges={settings.badges}
        busyId={linkBusyId}
        copy={copy}
        limit={MAX_BADGES}
        revokingId={linkAction === "revoke" ? linkBusyId : null}
        selectedId={selectedId}
        onAdd={openAdd}
        onCopy={copyLink}
        onDelete={setDeleteTarget}
        onEdit={openEdit}
        onSelect={setSelectedId}
        onToggleRevoked={(badge) => {
          void toggleRevoked(badge);
        }}
      />

      <BadgeDetailCard
        allowedProjects={settings.allowedProjects}
        badge={selected}
        busy={selected !== null && linkBusyId === selected.id}
        copy={copy}
        origin={origin}
        previewVersion={previewVersion}
        onUpdate={(patch) => {
          if (selected) void updateLink(selected, patch);
        }}
      />

      <BadgeNameDialog
        busy={nameBusy}
        copy={copy}
        dialog={nameDialog}
        draft={nameDraft}
        error={nameError}
        onClose={() => {
          setNameDialog(null);
        }}
        onDraftChange={(value) => {
          setNameDraft(value);
          if (nameError) setNameError(null);
        }}
        onSubmit={() => {
          void submitName();
        }}
      />

      <DeleteBadgeDialog
        badge={deleteTarget}
        busy={deleteBusy}
        copy={copy}
        locale={locale}
        onClose={() => {
          setDeleteTarget(null);
        }}
        onSubmit={() => {
          void confirmDelete();
        }}
      />
    </>
  );
}
