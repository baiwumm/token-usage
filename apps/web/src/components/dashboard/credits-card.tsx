"use client";

// Vendor credits card (docs/sources-capture-plan.md §3, C 方案): the visible
// face of the credits dimension. Credit-based sources only, never merged into
// token or cost totals (docs/sources-capture-audit.md §2).

import type { DashboardCopy } from "@/lib/copy/dashboard";

import { Card } from "@heroui/react";
import { memo } from "react";

import { PanelOverlay } from "./panel-overlay";

import { SourceIcon } from "@/components/source-icon";
import { useFormat } from "@/lib/format/format";

export interface CreditsCardRow {
  id: string;
  label: string;
  credits: number;
  /** Share of the displayed credits total, 0–1. */
  share: number;
}

function CreditsCardImpl({
  copy,
  rows,
  total,
  refreshing,
}: {
  copy: DashboardCopy;
  rows: CreditsCardRow[];
  total: number;
  refreshing: boolean;
}) {
  const { formatCredits, formatPercent } = useFormat();

  return (
    <Card className="relative p-6">
      <PanelOverlay active={refreshing} />
      <Card.Header>
        <Card.Title>{copy.panels.creditsTitle}</Card.Title>
        <Card.Description>{copy.panels.creditsHint}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {rows.map((row) => (
          <div key={row.id} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-sm">
              <SourceIcon label={row.id} size={14} />
              <span className="truncate">{row.label}</span>
            </span>
            <span className="flex items-center gap-3">
              <span className="hidden h-1.5 w-24 overflow-hidden rounded-full bg-default sm:block">
                <span
                  className="block h-full rounded-full bg-accent"
                  style={{ width: `${Math.round(row.share * 100)}%` }}
                />
              </span>
              <span className="tabular-nums text-sm">
                {formatCredits(row.credits)}{" "}
                <span className="text-foreground/60 text-xs">
                  {copy.panels.creditsUnit}
                </span>
              </span>
              <span className="text-foreground/60 tabular-nums hidden text-xs sm:inline">
                {formatPercent(row.share)}
              </span>
            </span>
          </div>
        ))}
        {rows.length > 1 ? (
          <div className="border-default text-foreground/70 flex items-center justify-end gap-3 border-t pt-2 text-sm">
            <span className="text-xs">{copy.panels.creditsTotal}</span>
            <span className="tabular-nums">
              {formatCredits(total)}{" "}
              <span className="text-foreground/60 text-xs">
                {copy.panels.creditsUnit}
              </span>
            </span>
          </div>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export const CreditsCard = memo(CreditsCardImpl);
