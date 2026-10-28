"use client";

// Share-card preview for /wrapped — the same design the Canvas export draws.

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { DashboardPayload } from "@/lib/dashboard/api";

import { useRef } from "react";
import { Typography } from "@heroui/react";

import { useFormat } from "@/lib/format/format";

export function ShareCardPreview({
  copy,
  year,
  totals,
  highlights,
}: {
  copy: WrappedCopy;
  year: number;
  totals: DashboardPayload["totals"];
  highlights: Array<[string, string]>;
}) {
  const { formatTokens, formatCost, formatNumber } = useFormat();
  const cardRef = useRef<HTMLDivElement | null>(null);

  return (
    <div
      ref={cardRef}
      className="bg-surface flex flex-col gap-4 rounded-3xl p-8"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Typography type="h4">
            {copy.share.cardTitle.replace("{year}", String(year))}
          </Typography>
          <Typography color="muted" type="body-xs">
            {copy.share.cardCaption}
          </Typography>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Typography className="text-accent" type="h3" weight="bold">
            {formatTokens(totals.total_tokens)}
          </Typography>
          <Typography color="muted" type="body-xs">
            {copy.cards.totalTokens}
          </Typography>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          [copy.cards.cost, formatCost(totals.total_cost_usd)],
          [copy.cards.conversations, formatNumber(totals.conversations)],
          [copy.cards.activeDays, formatNumber(totals.active_days)],
        ].map(([label, value]) => (
          <div key={label} className="bg-default rounded-3xl p-3">
            <Typography color="muted" type="body-xs">
              {label}
            </Typography>
            <Typography className="tabular-nums" type="body" weight="semibold">
              {value}
            </Typography>
          </div>
        ))}
      </div>
      {highlights.length > 0 ? (
        <div className="flex flex-col gap-1.5">
          <Typography color="muted" type="body-xs">
            {copy.highlightsTitle}
          </Typography>
          <div className="flex flex-wrap gap-x-6 gap-y-1">
            {highlights.map(([label, value]) => (
              <Typography key={label} color="muted" type="body-sm">
                {`${label}: `}
                <span className="text-foreground">{value}</span>
              </Typography>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
