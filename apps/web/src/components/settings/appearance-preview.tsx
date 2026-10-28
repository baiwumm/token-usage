"use client";

// Appearance · live preview of the number and date formats, so a toggle's
// effect is visible without leaving the tab.

import { Typography } from "@heroui/react";

import { Row } from "./appearance-row";

import { APPEARANCE_COPY } from "@/lib/copy/appearance";
import { useLocalePreference } from "@/lib/copy/locale";
import { useFormat } from "@/lib/format/format";

export function AppearancePreview() {
  const { locale } = useLocalePreference();
  const copy = APPEARANCE_COPY[locale];
  const { formatTokens, formatCost, formatDate } = useFormat();

  return (
    <Row label={copy.previewLabel}>
      <div className="bg-default/50 ring-border/60 grid w-full min-w-64 grid-cols-3 gap-3 rounded-3xl px-4 py-3 ring-1 md:w-96">
        <div className="flex flex-col gap-0.5">
          <Typography color="muted" type="body-xs">
            {copy.previewTokens}
          </Typography>
          <Typography
            className="min-w-16 tabular-nums"
            type="body-sm"
            weight="medium"
          >
            {formatTokens(1_234_567)}
          </Typography>
        </div>
        <div className="flex flex-col gap-0.5">
          <Typography color="muted" type="body-xs">
            {copy.previewCost}
          </Typography>
          <Typography
            className="min-w-16 tabular-nums"
            type="body-sm"
            weight="medium"
          >
            {formatCost(123.4567)}
          </Typography>
        </div>
        <div className="flex flex-col gap-0.5">
          <Typography color="muted" type="body-xs">
            {copy.previewDate}
          </Typography>
          <Typography
            className="whitespace-nowrap tabular-nums"
            type="body-sm"
            weight="medium"
          >
            {formatDate(new Date(), { dateStyle: "medium" })}
          </Typography>
        </div>
      </div>
    </Row>
  );
}
