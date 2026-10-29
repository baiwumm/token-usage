"use client";

// Dashboard share modal: two-column dialog (live preview on the left, controls
// on the right) over the shared canvas share-card engine. The display name is
// a dialog-local override — never persisted — seeded from the signed-in user
// each time it opens; the style switcher crossfades the preview in place. The
// preview is the exported PNG itself. Privacy: only aggregated numbers leave
// the page — no row-level data.

import type { ShareCardData, ShareCardVariant } from "@/components/share-card";

import { ArrowDownToLine, Copy } from "@gravity-ui/icons";
import {
  Button,
  Input,
  Label,
  Modal,
  Spinner,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
  toast,
} from "@heroui/react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";

import {
  SHARE_VARIANTS,
  copyPngDataUrl,
  downloadPngDataUrl,
  drawShareCard,
} from "@/components/share-card";
import { DASHBOARD_COPY } from "@/lib/copy/dashboard";
import { useLocale } from "@/lib/copy/locale";
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
  // Frame that was on screen when the style changed: kept on top for one
  // crossfade so the swap never flashes the empty stage.
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [name, setName] = useState("");
  // Deferring the name keeps typing responsive while the 2x canvas redraws.
  const deferredName = useDeferredValue(name);

  // Seed the override from the current user whenever the dialog opens; edits
  // stay local to this dialog (no persistence, no profile write).
  useEffect(() => {
    if (open) setName(input?.handle ?? "");
  }, [open, input?.handle]);

  // Derived from the deferred input only — keying on `open` would null the
  // image the moment close starts, flashing a spinner through the exit
  // animation. Redraws happen when the dashboard refreshes the input (rare,
  // and cheap).
  const cardData = useMemo(
    () =>
      input ? { ...input, handle: deferredName.trim() || input.handle } : null,
    [deferredName, input],
  );
  const dataUrl = useMemo(
    () => (cardData ? drawShareCard(variant, cardData) : null),
    [cardData, variant],
  );

  // Drop the outgoing frame shortly after its fade-out ends. A timer (rather
  // than `onAnimationEnd`) also covers reduced-motion users, whose layer is
  // hidden instead of animated.
  useEffect(() => {
    if (!outgoing) return;
    const timer = setTimeout(() => setOutgoing(null), 320);

    return () => clearTimeout(timer);
  }, [outgoing]);

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        {/* `max-w-none` drops the default `size="md"` cap (max-w-md); the
            explicit width below is the only width constraint. */}
        <Modal.Dialog className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-none overflow-hidden p-0 sm:w-[min(64rem,calc(100vw-5rem))]">
          <Modal.CloseTrigger aria-label={copy.shareCard.close} />
          <Modal.Body className="mx-0 p-0">
            <div className="flex flex-col lg:h-[80vh] lg:flex-row">
              {/* Preview column — the exported PNG itself, scaled to fit. The
                  stage keeps a definite height (the old `max-h-[42vh]` plus the
                  padding) so the crossfade layers can stack absolutely without
                  reflowing the dialog mid-swap. */}
              <div className="bg-default h-[calc(42vh+2rem)] p-4 sm:h-[calc(42vh+3rem)] sm:p-6 lg:h-auto lg:min-w-0 lg:flex-1">
                <div className="relative h-full w-full">
                  {dataUrl ? (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        key={`in-${variant}`}
                        alt={copy.shareCard.title}
                        className="animate-in fade-in-0 zoom-in-98 duration-300 ease-out motion-reduce:animate-none absolute inset-0 m-auto max-h-full max-w-full rounded-2xl shadow-lg ring-1 ring-black/5"
                        src={dataUrl}
                      />
                      {outgoing ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={`out-${outgoing}`}
                          aria-hidden
                          alt=""
                          className="animate-out fade-out-0 zoom-out-102 fill-mode-forwards duration-300 ease-out motion-reduce:hidden pointer-events-none absolute inset-0 m-auto max-h-full max-w-full rounded-2xl shadow-lg ring-1 ring-black/5"
                          src={outgoing}
                        />
                      ) : null}
                    </>
                  ) : (
                    <div className="flex h-full items-center justify-center">
                      <Spinner />
                    </div>
                  )}
                </div>
              </div>

              {/* Controls column */}
              <div className="border-border flex w-full shrink-0 flex-col gap-5 overflow-y-auto border-t p-5 sm:p-6 lg:w-85 lg:border-t-0 lg:border-l">
                <div className="flex flex-col gap-1 pr-8">
                  <Modal.Heading className="text-lg">
                    {copy.shareCard.title}
                  </Modal.Heading>
                  <Typography color="muted" type="body-xs">
                    {copy.shareCard.subtitle}
                  </Typography>
                </div>

                <TextField value={name} onChange={setName}>
                  <Label>{copy.shareCard.displayName}</Label>
                  <Input
                    placeholder={copy.shareCard.displayNamePlaceholder}
                    variant="secondary"
                  />
                </TextField>

                <div className="flex flex-col gap-2">
                  <Typography color="muted" type="body-xs">
                    {sharedCopy.styleLabel}
                  </Typography>
                  <ToggleButtonGroup
                    disallowEmptySelection
                    fullWidth
                    aria-label={sharedCopy.styleLabel}
                    selectedKeys={new Set([variant])}
                    selectionMode="single"
                    onSelectionChange={(keys) => {
                      const next = [...keys][0];

                      if (!next || next === variant) return;
                      // Crossfade: keep the frame that is on screen as the
                      // outgoing layer under the freshly drawn one.
                      if (dataUrl) setOutgoing(dataUrl);
                      setVariant(next as ShareCardVariant);
                    }}
                  >
                    {SHARE_VARIANTS.map(({ id }) => (
                      <ToggleButton key={id} id={id}>
                        {sharedCopy.variants[id]}
                      </ToggleButton>
                    ))}
                  </ToggleButtonGroup>
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
                        if (ok) {
                          toast.success(copy.shareCard.copied);
                        } else {
                          toast(copy.shareCard.copyFailed);
                        }
                      });
                    }}
                  >
                    {busy ? (
                      <Spinner color="current" size="sm" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    {copy.shareCard.copyImage}
                  </Button>
                  <Button
                    isDisabled={!dataUrl || busy}
                    onPress={() => {
                      if (!dataUrl) return;
                      const stamp = formatDate(new Date(), {
                        dateStyle: "short",
                      });

                      downloadPngDataUrl(
                        dataUrl,
                        `token-usage-${stamp.replace(/\D/g, "")}.png`,
                      );
                    }}
                  >
                    <ArrowDownToLine className="size-4" />
                    {copy.shareCard.save}
                  </Button>
                </div>

                <div className="border-border mt-auto border-t pt-4">
                  <Typography color="muted" type="body-xs">
                    {copy.shareCard.note}
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
