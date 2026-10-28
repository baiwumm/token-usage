"use client";

// Share panel for /wrapped: the shared canvas share cards in four styles.
// The preview is the exported PNG itself (WYSIWYG); actions save or copy it.
// Privacy: aggregated numbers only — no row-level data.

import type { ShareCardData, ShareCardVariant } from "@/components/share-card";

import {
  Button,
  Card,
  Spinner,
  ToggleButton,
  ToggleButtonGroup,
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
import { SHARE_CARD_COPY } from "@/lib/copy/share-card";

export function ShareCardPreview({ data }: { data: ShareCardData }) {
  const [locale] = useLocale();
  const copy = SHARE_CARD_COPY[locale];
  const [variant, setVariant] = useState<ShareCardVariant>("broadsheet");
  const [busy, setBusy] = useState(false);
  // The preview is the same data URL the actions export — no HTML twin to
  // drift out of sync with the canvas.
  const dataUrl = useMemo(() => drawShareCard(variant, data), [data, variant]);

  return (
    <Card className="flex-col gap-5 p-6">
      <Card.Header>
        <Card.Title>{copy.panelTitle}</Card.Title>
        <Card.Description>{copy.privacyNote}</Card.Description>
      </Card.Header>

      <ToggleButtonGroup
        disallowEmptySelection
        fullWidth
        aria-label={copy.styleLabel}
        selectedKeys={new Set([variant])}
        selectionMode="single"
        onSelectionChange={(keys) => {
          const next = [...keys][0];

          if (next) setVariant(next as ShareCardVariant);
        }}
      >
        {SHARE_VARIANTS.map(({ id }) => (
          <ToggleButton key={id} id={id}>
            {copy.variants[id]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>

      <div className="flex min-h-40 justify-center">
        {dataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            alt={copy.panelTitle}
            className="max-h-[70vh] w-auto rounded-2xl border shadow-sm"
            src={dataUrl}
          />
        ) : (
          <Spinner />
        )}
      </div>

      <Card.Footer className="justify-end gap-2">
        <Button
          isDisabled={busy}
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
          {busy ? <Spinner color="current" size="sm" /> : null}
          {copy.copyImage}
        </Button>
        <Button
          onPress={() => {
            if (!dataUrl) return;
            downloadPngDataUrl(
              dataUrl,
              `token-usage-${data.periodLabel}-${variant}.png`,
            );
          }}
        >
          {copy.save}
        </Button>
      </Card.Footer>
    </Card>
  );
}
