"use client";

// Shared loading / error blocks for dashboard-style section cards. The
// skeleton mirrors HeroUI card radius (min(32px, --radius-3xl)) so loading
// blocks match the layout they stand in for.

import { Button, Skeleton, Typography } from "@heroui/react";

export function SectionSkeleton({ className }: { className?: string }) {
  return (
    <Skeleton
      className={`rounded-[min(32px,var(--radius-3xl))] ${className ?? "h-40 w-full"}`}
    />
  );
}

export function SectionError({
  message,
  retry,
  retryLabel,
}: {
  message: string;
  retry: () => void;
  retryLabel: string;
}) {
  return (
    <div className="flex flex-col items-start gap-2">
      <Typography className="text-danger" type="body-sm">
        {message}
      </Typography>
      <Button size="sm" variant="outline" onPress={retry}>
        {retryLabel}
      </Button>
    </div>
  );
}
