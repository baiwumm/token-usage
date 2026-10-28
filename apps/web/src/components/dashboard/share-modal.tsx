"use client";

// Dashboard share modal: renders the shared canvas share cards
// (components/share-card) from the current dashboard payload, with a style
// switcher and save / copy-image actions. The preview is the exported PNG
// itself. Privacy: only aggregated numbers leave the page — no row-level data.

import type { ShareCardData, ShareCardVariant } from "@/components/share-card";

import {
  Button,
  Modal,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  toast,
} from "@heroui/react";
import { useMemo, useState } from "react";

import {
  SHARE_VARIANTS,
  copyPngDataUrl,
  downloadPngDataUrl,
  drawShareCard,
} from "@/components/share-card";
import { useLocale } from "@/lib/copy/locale";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { SHARE_CARD_COPY } from "@/lib/copy/share-card";
import { useFormat } from "@/lib/format/format";

export interface ShareModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ShareCardData | null;
}

export function ShareModal({ open, onOpenChange, input }: ShareModalProps) {
  const [locale] = useLocale();
  const copy = DASHBOARD_COPY[locale];
  const sharedCopy = SHARE_CARD_COPY[locale];
  const { formatDate } = useFormat();
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<ShareCardVariant>("broadsheet");
  // Derived from `input` + `variant` only — keying it on `open` too would null
  // the image the moment close starts, flashing a spinner through the exit
  // animation. Redraws happen when the dashboard refreshes the input (rare,
  // and cheap).
  const dataUrl = useMemo(
    () => (input ? drawShareCard(variant, input) : null),
    [input, variant],
  );

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-2xl">
          <Modal.Header>
            <Modal.CloseTrigger />
            <Modal.Heading>{copy.shareCard.title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col items-center gap-4">
            <ToggleButtonGroup
              disallowEmptySelection
              fullWidth
              aria-label={sharedCopy.styleLabel}
              selectedKeys={new Set([variant])}
              selectionMode="single"
              onSelectionChange={(keys) => {
                const next = [...keys][0];

                if (next) setVariant(next as ShareCardVariant);
              }}
            >
              {SHARE_VARIANTS.map(({ id }) => (
                <ToggleButton key={id} id={id}>
                  {sharedCopy.variants[id]}
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {dataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt={copy.shareCard.title}
                className="max-h-[46vh] w-auto rounded-3xl border shadow-sm"
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
  );
}
