"use client";

// Dashboard share modal: renders the canvas share card (share-card.ts) from
// the current dashboard payload, with save / copy-image actions. Privacy:
// only aggregated numbers leave the page — no row-level data.

import { Button, Modal, Spinner, Typography, toast } from "@heroui/react";
import { useEffect, useMemo, useState } from "react";

import {
  copyPngDataUrl,
  downloadPngDataUrl,
  drawShareCard,
  type ShareCardInput,
} from "./share-card";

import { useLocale } from "@/lib/copy/locale";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useFormat } from "@/lib/format/format";

export interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ShareCardInput | null;
}

export function ShareModal({ open, onOpenChange, input }: ShareModalProps) {
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];
  const { formatDate } = useFormat();
  const [busy, setBusy] = useState(false);
  // Graceful close: the canvas preview tears down with the dialog, so a
  // click on close shows a brief loading beat before the modal disappears.
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  const requestClose = () => {
    if (closing) return;
    setClosing(true);
    window.setTimeout(() => {
      setClosing(false);
      onOpenChange(false);
    }, 400);
  };
  const dataUrl = useMemo(
    () => (open && input ? drawShareCard(input) : null),
    [input, open],
  );

  return (
    <Modal>
      <Modal.Backdrop
        isOpen={open}
        onOpenChange={(next) => {
          if (!next) requestClose();
        }}
      >
        <Modal.Container>
          <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
            <Modal.Header>
              <Modal.CloseTrigger />
              <Modal.Heading>{copy.shareCard.title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="relative flex flex-col items-center gap-4">
              {closing ? (
                <div
                  aria-hidden="true"
                  className="bg-surface/70 absolute inset-0 z-10 flex items-center justify-center backdrop-blur-[2px]"
                >
                  <Spinner size="sm" />
                </div>
              ) : null}
              {dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={copy.shareCard.title}
                  className="max-h-[52vh] w-auto rounded-xl border shadow-sm"
                  src={dataUrl}
                />
              ) : (
                <Spinner />
              )}
              <Typography color="muted" type="body-xs">
                {copy.shareCard.note}
              </Typography>
            </Modal.Body>
            <Modal.Footer>
              <Button
                isDisabled={!dataUrl || busy || closing}
                onPress={() => {
                  if (!dataUrl) return;
                  setBusy(true);
                  void copyPngDataUrl(dataUrl).then((ok) => {
                    setBusy(false);
                    if (ok) {
                      toast.success(copy.shareCard.copied);
                    } else {
                      toast(copy.shareCard.copyFailed);
                    }
                  });
                }}
              >
                {busy ? <Spinner color="current" size="sm" /> : null}
                {copy.shareCard.copyImage}
              </Button>
              <Button
                isDisabled={!dataUrl || closing}
                onPress={() => {
                  if (!dataUrl) return;
                  const stamp = formatDate(new Date(), { dateStyle: "short" });

                  downloadPngDataUrl(
                    dataUrl,
                    `token-usage-${stamp.replace(/\D/g, "")}.png`,
                  );
                }}
              >
                {copy.shareCard.save}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
