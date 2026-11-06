"use client";

// KPI / total card row shared by /sessions, /sync-runs and /wrapped
// (docs/ui-spec.md:217 — dynamic numbers go through FlowNumber). The grid
// columns, the content gap and the skeleton widths differ per page, so the
// caller supplies those while the card anatomy stays here.

import type { ComponentType } from "react";

import { Card, Skeleton, Typography, cn } from "@heroui/react";

import { FlowNumber } from "@/components/flow-number";

type SummaryIcon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;

export interface SummaryCardItem {
  key: string;
  label: string;
  icon: SummaryIcon;
  value: string;
  sub?: string | undefined;
}

export interface SummaryCardSkeletonItem {
  key: string;
  label: string;
  icon: SummaryIcon;
  /** Tailwind width class for the value skeleton line. */
  valueWidth: string;
  /** Width class for a second skeleton line (when the caption is a skeleton). */
  captionWidth?: string;
  /** Caption rendered as real copy instead of a skeleton line. */
  sub?: string | undefined;
}

export function SummaryCards({
  cards,
  className,
  contentClassName,
}: {
  cards: SummaryCardItem[];
  className: string;
  contentClassName?: string | undefined;
}) {
  return (
    <div className={className}>
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className={contentClassName}>
            <Typography className="tabular-nums" type="h4" weight="semibold">
              <FlowNumber text={card.value} />
            </Typography>
            {card.sub ? (
              <Typography color="muted" type="body-xs">
                {card.sub}
              </Typography>
            ) : null}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}

export function SummaryCardsSkeleton({
  cards,
  className,
  contentClassName,
}: {
  cards: SummaryCardSkeletonItem[];
  className: string;
  contentClassName?: string | undefined;
}) {
  return (
    <div className={className}>
      {cards.map((card) => (
        <Card key={card.key} className="gap-1 p-4">
          <Card.Header className="flex-row items-center justify-between gap-2">
            <Card.Title className="text-muted text-xs font-normal">
              {card.label}
            </Card.Title>
            <card.icon aria-hidden="true" className="text-accent/70 size-4" />
          </Card.Header>
          <Card.Content className={contentClassName}>
            <Skeleton className={cn("h-7 rounded-full", card.valueWidth)} />
            {card.captionWidth ? (
              <Skeleton className={cn("h-3 rounded-full", card.captionWidth)} />
            ) : card.sub ? (
              <Typography color="muted" type="body-xs">
                {card.sub}
              </Typography>
            ) : null}
          </Card.Content>
        </Card>
      ))}
    </div>
  );
}
