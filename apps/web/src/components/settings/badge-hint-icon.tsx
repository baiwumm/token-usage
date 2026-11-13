"use client";

// Info affordance for the badge tab (docs/ui-spec.md 设置): a `CircleInfo`
// icon button beside a row label whose tooltip carries the secondary
// explanation, so each row keeps only the one line needed before acting.

import type { ReactNode } from "react";

import { CircleInfo } from "@gravity-ui/icons";
import { Button, Tooltip } from "@heroui/react";

export function BadgeHint({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <Tooltip delay={0}>
      <Button
        aria-label={label}
        className="text-muted size-5 shrink-0 p-0"
        size="sm"
        variant="ghost"
      >
        <CircleInfo aria-hidden="true" className="size-3.5" />
      </Button>
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <div className="flex max-w-72 flex-col gap-1.5">{children}</div>
      </Tooltip.Content>
    </Tooltip>
  );
}
