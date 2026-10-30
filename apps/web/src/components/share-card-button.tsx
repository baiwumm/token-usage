"use client";

// Share entry point shared by the dashboard filter bar and the /wrapped
// header: a tertiary icon button (same glyph, tooltip and dialog everywhere)
// that opens ShareCardDialog. The page owns the payload projection
// (dashboard/share-input.ts, wrapped/share-input.ts); a null input disables
// the button until the data is ready.

import type { ShareCardData } from "@/components/share-card";

import { NodesRight } from "@gravity-ui/icons";
import { Button, Tooltip, Typography } from "@heroui/react";
import { useState } from "react";

import { ShareCardDialog } from "@/components/share-card-dialog";
import { useLocale } from "@/lib/copy/locale";
import { SHARE_CARD_COPY } from "@/lib/copy/share-card";

export function ShareCardButton({ input }: { input: ShareCardData | null }) {
  const [locale] = useLocale();
  const copy = SHARE_CARD_COPY[locale];
  const [open, setOpen] = useState(false);

  return (
    <>
      <Tooltip delay={0}>
        <Button
          isIconOnly
          aria-label={copy.share}
          isDisabled={!input}
          size="sm"
          variant="tertiary"
          onPress={() => setOpen(true)}
        >
          <NodesRight aria-hidden="true" className="size-4" />
        </Button>
        <Tooltip.Content showArrow placement="bottom">
          <Tooltip.Arrow />
          <Typography type="body-xs">{copy.share}</Typography>
        </Tooltip.Content>
      </Tooltip>
      <ShareCardDialog input={input} open={open} onOpenChange={setOpen} />
    </>
  );
}
