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
import { DeleteBadgeDialog } from "./badge-dialogs";
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
import { browserTimezone } from "@/lib/dashboard/ranges";

export function BadgeCard() {
  const [locale] = useLocale();
  const copy = BADGE_COPY[locale];
  const router = useRouter();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [settings, setSettings] = useState<BadgeSettings | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftProjects, setDraftProjects] = useState<string[]>([]);
  const [busy, setBusy] = useState<BadgeSettingsBusy | "add" | null>(null);
  const [linkBusyId, setLinkBusyId] = useState<string | null>(null);
  const [labelBusy, setLabelBusy] = useState(false);
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
      const config = await updateBadgeConfig({
        allowedProjects: draftProjects,
        timezone: browserTimezone(),
      });

      applyConfig(config);
      setDraftProjects(config.allowedProjects);
      // A badge pointing at a project that just left the allowlist would stop
      // rendering; the public endpoint answers "unknown project" instead. The
      // rows keep their value until the operator edits them (PATCH enforces
      // the allowlist), so only the preview needs a refresh here.
      setPreviewVersion((value) => value + 1);
      toast.success(copy.projectsSaved);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function addBadge() {
    if (busy) return;
    setBusy("add");
    try {
      const badge = await createBadge({ timezone: browserTimezone() });

      // POST enables the public switch when it was off (§7.1).
      setSettings((current) =>
        current
          ? { ...current, enabled: true, badges: [...current.badges, badge] }
          : current,
      );
      setSelectedId(badge.id);
      setPreviewVersion((value) => value + 1);
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(null);
    }
  }

  async function saveLabel(label: string) {
    const badge = settings?.badges.find((row) => row.id === selectedId);

    if (!badge || linkBusyId) return;
    setLinkBusyId(badge.id);
    setLabelBusy(true);
    try {
      replaceBadge(await updateBadgeLink(badge.id, { label }));
      toast.success(copy.labelSaved);
    } catch (error) {
      handleFailure(error);
    } finally {
      setLinkBusyId(null);
      setLabelBusy(false);
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
    try {
      replaceBadge(await updateBadgeLink(badge.id, { revoked }));
      toast.success(revoked ? copy.revokeDone : copy.restoreDone);
    } catch (error) {
      handleFailure(error);
    } finally {
      setLinkBusyId(null);
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
    return (
      <Card className="p-6">
        {status === "error" ? (
          <SectionError
            message={copy.loadError}
            retry={() => void load()}
            retryLabel={copy.retry}
          />
        ) : (
          <div className="flex flex-col gap-4">
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-44 w-full rounded-lg" />
          </div>
        )}
      </Card>
    );
  }

  const selected =
    settings.badges.find((badge) => badge.id === selectedId) ?? null;

  return (
    <>
      <BadgeSettingsCard
        badgeCount={settings.badges.length}
        busy={busy === "add" ? null : busy}
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
        addBusy={busy === "add"}
        badges={settings.badges}
        busyId={linkBusyId}
        copy={copy}
        limit={MAX_BADGES}
        selectedId={selectedId}
        onAdd={() => {
          void addBadge();
        }}
        onCopy={copyLink}
        onDelete={setDeleteTarget}
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
        labelBusy={labelBusy}
        origin={origin}
        previewVersion={previewVersion}
        onSaveLabel={(label) => {
          void saveLabel(label);
        }}
        onUpdate={(patch) => {
          if (selected) void updateLink(selected, patch);
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
