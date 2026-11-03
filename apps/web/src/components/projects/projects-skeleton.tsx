"use client";

// First-load skeleton for /projects: mirrors the list card shell (header +
// rows) so the layout does not jump when the payload lands.

import { Card, Skeleton } from "@heroui/react";

export function ProjectsSkeleton() {
  return (
    <Card className="p-4 md:p-6">
      <Card.Header className="flex-col items-start gap-1">
        <Skeleton className="h-5 w-24 rounded-3xl" />
        <Skeleton className="h-3.5 w-64 max-w-full rounded-3xl" />
      </Card.Header>
      <Card.Content className="gap-2">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full rounded-2xl" />
        ))}
      </Card.Content>
    </Card>
  );
}
