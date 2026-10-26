"use client";

// Dashboard share modal: renders the canvas share card (share-card.ts) from
// the current dashboard payload, with save / copy-image actions. Privacy:
// only aggregated numbers leave the page — no row-level data.

import { Button, Modal, Spinner, Typography, toast } from "@heroui/react";
import { useMemo, useState } from "react";

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
  // Derived from `input` only — keying it on `open` too would null the image
  // the moment close starts, flashing a spinner through the exit animation.
  // Redraws happen when the dashboard refreshes the input (rare, and cheap).
  const dataUrl = useMemo(() => (input ? drawShareCard(input) : null), [input]);

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
            <Modal.Header>
              <Modal.CloseTrigger />
              <Modal.Heading>{copy.shareCard.title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col items-center gap-4">
              {dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  alt={copy.shareCard.title}
                  className="max-h-[52vh] w-auto rounded-3xl border shadow-sm"
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
                isDisabled={!dataUrl || busy}
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
                isDisabled={!dataUrl}
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
