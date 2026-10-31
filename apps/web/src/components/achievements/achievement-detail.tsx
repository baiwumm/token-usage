"use client";

// Shared detail host for one achievement (2026-10-31): the detail dialog plus
// its share dialog with the never-stacked transition (detail closes as the
// share opens for the same row). Used by the /achievements wall and the
// dashboard's achievement strip — click a tile anywhere, get the same detail.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { useCallback, useState } from "react";

import { AchievementDialog } from "./achievement-dialog";
import { AchievementShareDialog } from "./achievement-share-dialog";

export function AchievementDetail({
  progress,
  open,
  locale,
  handle,
  onOpenChange,
}: {
  /** Last selection, kept mounted while the close animation runs. */
  progress: AchievementProgress | null;
  open: boolean;
  locale: Locale;
  /** Display name on the exported share card. */
  handle: string;
  onOpenChange: (open: boolean) => void;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const [shared, setShared] = useState<AchievementProgress | null>(null);

  // Detail and share never stack: the detail closes as the share opens for
  // the same achievement (the selection survives the close animation).
  const openShare = useCallback(() => {
    if (!progress) return;
    setShared(progress);
    onOpenChange(false);
    setShareOpen(true);
  }, [progress, onOpenChange]);

  return (
    <>
      <AchievementDialog
        locale={locale}
        open={open}
        progress={progress}
        onOpenChange={onOpenChange}
        onShare={openShare}
      />
      <AchievementShareDialog
        handle={handle}
        locale={locale}
        open={shareOpen}
        progress={shared}
        onOpenChange={setShareOpen}
      />
    </>
  );
}
