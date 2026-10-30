"use client";

// Share dialog for one unlocked achievement (docs/ui-spec.md 分享卡片): the
// exported PNG itself on the left, copy / download on the right. Opened from
// the detail dialog, which is closed first so two modals never stack.
//
// Drawing is async (the badge bitmap loads before the canvas paints), so the
// preview starts as a spinner; a failed render keeps the dialog honest instead
// of spinning forever.

import type { AchievementProgress } from "@/lib/achievements/types";
import type { Locale } from "@/lib/copy/locale-config";

import { ArrowDownToLine, Copy } from "@gravity-ui/icons";
import { Button, Modal, Spinner, Typography, toast } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";

import { useAchievementFormat } from "./use-achievements-format";

import { drawAchievementShareCard } from "@/components/share-card/achievement";
import { copyPngDataUrl, downloadPngDataUrl } from "@/components/share-card";
import {
  achievementShareFilename,
  buildAchievementShareData,
} from "@/lib/achievements/share";
import { SHARE_CARD_COPY } from "@/lib/copy/share-card";

export function AchievementShareDialog({
  progress,
  handle,
  open,
  locale,
  onOpenChange,
}: {
  /** Last selection, kept mounted while the close animation runs. */
  progress: AchievementProgress | null;
  handle: string;
  open: boolean;
  locale: Locale;
  onOpenChange: (open: boolean) => void;
}) {
  const copy = SHARE_CARD_COPY[locale];
  const formatValue = useAchievementFormat();
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const [renderFailed, setRenderFailed] = useState(false);
  const [busy, setBusy] = useState(false);

  const card = useMemo(
    () =>
      progress
        ? buildAchievementShareData(progress, {
            locale,
            handle,
            formatValue,
          })
        : null,
    [formatValue, handle, locale, progress],
  );

  // Redraw whenever the dialog opens on a (possibly different) badge.
  useEffect(() => {
    if (!open || !card) return;

    let cancelled = false;

    setDataUrl(null);
    setRenderFailed(false);
    void drawAchievementShareCard(card).then(
      (url) => {
        if (!cancelled) setDataUrl(url);
      },
      () => {
        if (!cancelled) setRenderFailed(true);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [card, open]);

  return (
    <Modal.Backdrop isOpen={open && card != null} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-none overflow-hidden p-0 sm:w-[min(58rem,calc(100vw-5rem))]">
          <Modal.CloseTrigger aria-label={copy.close} />
          <Modal.Body className="mx-0 p-0">
            <div className="flex flex-col lg:h-[76vh] lg:flex-row">
              <div className="bg-default flex h-[calc(42vh+2rem)] items-center justify-center p-4 sm:h-[calc(42vh+3rem)] sm:p-6 lg:h-auto lg:min-w-0 lg:flex-1">
                {dataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    alt={copy.achievement.title}
                    className="max-h-full max-w-full rounded-2xl shadow-lg ring-1 ring-black/5"
                    src={dataUrl}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    {renderFailed ? (
                      <Typography color="muted" type="body-sm">
                        {copy.achievement.renderFailed}
                      </Typography>
                    ) : (
                      <Spinner />
                    )}
                  </div>
                )}
              </div>

              <div className="border-border flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-t p-5 sm:p-6 lg:w-80 lg:border-t-0 lg:border-l">
                <div className="flex flex-col gap-1 pr-8">
                  <Modal.Heading className="text-lg">
                    {copy.achievement.title}
                  </Modal.Heading>
                  <Typography color="muted" type="body-xs">
                    {copy.achievement.subtitle}
                  </Typography>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    isDisabled={!dataUrl || busy}
                    variant="secondary"
                    onPress={() => {
                      if (!dataUrl) return;
                      setBusy(true);
                      void copyPngDataUrl(dataUrl).then((ok) => {
                        setBusy(false);
                        if (ok) toast.success(copy.copied);
                        else toast(copy.copyFailed);
                      });
                    }}
                  >
                    {busy ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copy.copyImage}
                  </Button>
                  <Button
                    isDisabled={!dataUrl || busy}
                    onPress={() => {
                      if (!dataUrl || !card) return;
                      downloadPngDataUrl(
                        dataUrl,
                        achievementShareFilename(card.id, card.tierKey),
                      );
                    }}
                  >
                    <ArrowDownToLine className="size-4" />
                    {copy.save}
                  </Button>
                </div>

                <div className="border-border mt-auto border-t pt-4">
                  <Typography color="muted" type="body-xs">
                    {copy.achievement.note}
                  </Typography>
                </div>
              </div>
            </div>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
