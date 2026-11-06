"use client";

// 2026-11-05: the public page now uses the very same achievement detail
// dialog as /achievements (operator call). The only difference is that no
// share handler is supplied, so the share action is hidden.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { AchievementDialog } from "@/components/achievement-dialog";

export function UAchievementDialog({
  progress,
  open,
  onOpenChange,
  locale,
}: {
  progress: AchievementProgress | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locale: Locale;
}) {
  return (
    <AchievementDialog
      locale={locale}
      open={open}
      progress={progress}
      onOpenChange={onOpenChange}
    />
  );
}
