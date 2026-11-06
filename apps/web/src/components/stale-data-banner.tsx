"use client";

// Shared "refresh failed, showing the last successful data" banner. Every
// data surface places it at the top of its content so stale rows are never
// read as fresh (docs/ui-spec.md 三态与响应式). All wording comes from the
// caller's typed copy dictionary — this component carries no UI text itself.

import type { ReactNode } from "react";

import { Button, Typography, cn } from "@heroui/react";

export function StaleDataBanner({
  message,
  retry,
  retryLabel,
  className,
}: {
  message: ReactNode;
  retry: () => void;
  retryLabel: ReactNode;
  /** Additive motion / state classes from the calling page (e.g. errorSlide). */
  className?: string;
}) {
  return (
    <div
      className={cn(
        "bg-danger-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2",
        className,
      )}
    >
      <Typography className="text-danger" type="body-sm">
        {message}
      </Typography>
      <Button size="sm" variant="outline" onPress={retry}>
        {retryLabel}
      </Button>
    </div>
  );
}
