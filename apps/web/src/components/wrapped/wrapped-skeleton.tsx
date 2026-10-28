"use client";

// First-load skeleton for /wrapped. Mirrors the loaded stack — the share-card
// panel, the four stat cards, the monthly trend, the source mix and the model
// table — so swapping in real data does not shift the page.

import { Card, Skeleton } from "@heroui/react";

export function WrappedSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-6">
      {/* Share panel: header, style switcher, tall preview, footer actions. */}
      <Card className="flex-col gap-5 p-6">
        <Card.Header>
          <Skeleton className="h-5 w-28 rounded-full" />
          <Skeleton className="h-4 w-72 rounded-full" />
        </Card.Header>
        <Skeleton className="h-9 w-full rounded-lg" />
        <div className="flex min-h-40 justify-center">
          <Skeleton className="h-[420px] w-full max-w-md rounded-2xl" />
        </div>
        <Card.Footer className="justify-end gap-2">
          <Skeleton className="h-9 w-24 rounded-full" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </Card.Footer>
      </Card>

      {/* Four stat cards, same shell the loaded ones use. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <Card key={index} className="gap-1 p-4">
            <Card.Header className="flex-row items-center justify-between gap-2">
              <Skeleton className="h-4 w-16 rounded-full" />
              <Skeleton className="size-4 rounded-full" />
            </Card.Header>
            <Card.Content>
              <Skeleton className="h-7 w-24 rounded-full" />
            </Card.Content>
          </Card>
        ))}
      </div>

      {/* Monthly trend: card header plus the chart block. */}
      <Card className="p-6">
        <Card.Header>
          <Skeleton className="h-5 w-28 rounded-full" />
        </Card.Header>
        <Card.Content>
          <Skeleton className="h-72 w-full rounded-2xl" />
        </Card.Content>
      </Card>

      {/* Source mix: stacked bar, then a row per source with its own track. */}
      <Card className="p-6">
        <Card.Header>
          <Skeleton className="h-5 w-24 rounded-full" />
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          <Skeleton className="h-2 w-full rounded-full" />
          {[0, 1, 2].map((index) => (
            <div key={index} className="flex flex-col gap-1">
              <div className="flex items-center justify-between gap-2">
                <Skeleton className="h-4 w-32 rounded-full" />
                <Skeleton className="h-3 w-40 rounded-full" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ))}
        </Card.Content>
      </Card>

      {/* Model table: header line plus row placeholders. */}
      <Card className="p-6">
        <Card.Header>
          <Skeleton className="h-5 w-24 rounded-full" />
        </Card.Header>
        <Card.Content className="flex flex-col gap-3">
          {[0, 1, 2, 3].map((index) => (
            <Skeleton key={index} className="h-9 w-full rounded-xl" />
          ))}
        </Card.Content>
      </Card>
    </div>
  );
}
