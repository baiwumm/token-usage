import type { ShareCardData, ShareCardVariant } from "@/components/share-card";

import {
  ArrowDownToLine,
  Copy,
  MusicNote,
  Receipt,
  Sparkles,
  SquareArticle,
} from "@gravity-ui/icons";
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
  drawShareCard,
} from "@/components/share-card";
import { SHARE_CARD_COPY } from "@/components/share-card/copy";
import { savePngDataUrlToDownloads } from "@/lib/save-file";

/**
 * Share-card dialog (web ShareCardDialog 移植): two-column modal — live
 * preview on the left, display name / style switcher / export buttons on the
 * right. The preview is the exported PNG itself; the display name is a
 * dialog-local override (never persisted). Drawing happens only while open —
 * the 2x toDataURL is synchronous and would block the monitor between polls
 * (web rule: 关闭态不得重绘 Canvas).
 */
export function ShareCardDialog({
  open,
  onOpenChange,
  input,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  input: ShareCardData | null;
}) {
  const copy = SHARE_CARD_COPY;
  const [busy, setBusy] = useState(false);
  const [variant, setVariant] = useState<ShareCardVariant>("broadsheet");
  // Frame that was on screen when the style changed: kept on top for one
  // crossfade so the swap never flashes the empty stage.
  const [outgoing, setOutgoing] = useState<string | null>(null);
  const [name, setName] = useState("");
  // Deferring the name keeps typing responsive while the 2x canvas redraws.
  const deferredName = useDeferredValue(name);

  // Seed the override from the machine identity whenever the dialog opens.
  useEffect(() => {
    if (open) setName(input?.handle ?? "");
  }, [open, input?.handle]);

  // Derived from the deferred input only, kept independently of `open` so
  // closing never nulls the image and flashes a spinner through the exit
  // animation.
  const cardData = useMemo(
    () =>
      input ? { ...input, handle: deferredName.trim() || input.handle } : null,
    [deferredName, input],
  );
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !cardData) return;

    setDataUrl(drawShareCard(variant, cardData));
  }, [open, cardData, variant]);

  // Drop the outgoing frame shortly after its fade-out ends. A timer also
  // covers reduced-motion users, whose layer is hidden instead of animated.
  useEffect(() => {
    if (!outgoing) return;
    const timer = setTimeout(() => setOutgoing(null), 320);

    return () => clearTimeout(timer);
  }, [outgoing]);

  const handleSave = () => {
    if (!dataUrl || busy) return;
    setBusy(true);
    const stamp = new Date();
    const pad = (value: number) => String(value).padStart(2, "0");
    const filename = `token-usage-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}.png`;

    void savePngDataUrlToDownloads(dataUrl, filename)
      .then((path) => {
        toast.success(`${copy.saveSucceeded}：${path}`);
      })
      .catch(() => {
        toast(copy.saveFailed);
      })
      .finally(() => {
        setBusy(false);
      });
  };

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        {/* `max-w-none` drops the default `size="md"` cap (max-w-md) — without
            it the two-column dialog collapses to 28rem and the preview
            squeezes into a sliver (the same bug web hit and fixed; D11
            acceptance round 1). */}
        <Modal.Dialog className="max-h-[92vh] w-[calc(100vw-2rem)] max-w-none overflow-hidden p-0 sm:w-[min(64rem,calc(100vw-5rem))]">
          <Modal.CloseTrigger aria-label={copy.close} />
          <Modal.Body className="mx-0 p-0">
            <div className="flex flex-col lg:h-[80vh] lg:flex-row">
              {/* Preview column — the exported PNG itself, scaled to fit. The
                  stage keeps a definite height so the crossfade layers can
                  stack absolutely without reflowing the dialog mid-swap. */}
              <div className="bg-default h-[calc(42vh+2rem)] p-4 sm:h-[calc(42vh+3rem)] sm:p-6 lg:h-auto lg:min-w-0 lg:flex-1">
                <div className="relative h-full w-full">
                  {dataUrl ? (
                    <>
                      <img
                        key={`in-${variant}`}
                        alt={copy.title}
                        className="animate-in fade-in-0 zoom-in-98 duration-300 ease-out motion-reduce:animate-none absolute inset-0 m-auto max-h-full max-w-full rounded-2xl shadow-lg ring-1 ring-black/5"
                        src={dataUrl}
                      />
                      {outgoing ? (
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
                    {copy.title}
                  </Modal.Heading>
                  <Typography className="text-muted" type="body-xs">
                    {copy.subtitle}
                  </Typography>
                </div>

                <TextField value={name} onChange={setName}>
                  <Label>{copy.displayName}</Label>
                  <Input
                    placeholder={copy.displayNamePlaceholder}
                    variant="secondary"
                  />
                </TextField>

                <div className="flex flex-col gap-2">
                  <Typography className="text-muted" type="body-xs">
                    {copy.styleLabel}
                  </Typography>
                  <ToggleButtonGroup
                    disallowEmptySelection
                    aria-label={copy.styleLabel}
                    className="grid w-full grid-cols-2 gap-2"
                    selectedKeys={new Set([variant])}
                    selectionMode="single"
                    size="sm"
                    onSelectionChange={(keys) => {
                      const next = [...keys][0];

                      if (!next || next === variant) return;
                      // Crossfade: keep the frame that is on screen as the
                      // outgoing layer under the freshly drawn one.
                      if (dataUrl) setOutgoing(dataUrl);
                      setVariant(next as ShareCardVariant);
                    }}
                  >
                    {SHARE_VARIANTS.map(({ id }) => {
                      const Icon = VARIANT_ICONS[id];

                      return (
                        <ToggleButton
                          key={id}
                          className="w-full rounded-[calc(var(--radius)*3)]"
                          id={id}
                        >
                          <Icon aria-hidden="true" className="size-4" />
                          {copy.variants[id]}
                        </ToggleButton>
                      );
                    })}
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
                          toast.success(copy.copied);
                        } else {
                          toast(copy.copyFailed);
                        }
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
                  <Button isDisabled={!dataUrl || busy} onPress={handleSave}>
                    <ArrowDownToLine className="size-4" />
                    {copy.save}
                  </Button>
                </div>

                <div className="border-border mt-auto border-t pt-4">
                  <Typography className="text-muted" type="body-xs">
                    {copy.note}
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

/** One glyph per style so the switcher reads before the label does. */
const VARIANT_ICONS = {
  broadsheet: SquareArticle,
  receipt: Receipt,
  neon: Sparkles,
  vinyl: MusicNote,
} as const;
