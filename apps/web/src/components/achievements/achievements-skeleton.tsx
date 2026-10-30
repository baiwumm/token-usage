"use client";

// First-load skeleton for /achievements: the summary line plus two category
// blocks of three cards, matching the real card height (medallion row, meter,
// date) so the layout does not jump when data lands.

import { Card, Skeleton } from "@heroui/react";

function CardSkeleton() {
  return (
    <Card className="gap-3 p-4">
      <div className="flex items-start gap-3">
        <Skeleton className="size-14 shrink-0 rounded-full" />
        <div className="flex flex-1 flex-col gap-2 pt-1">
          <Skeleton className="h-3.5 w-2/3 rounded-lg" />
          <Skeleton className="h-3 w-full rounded-lg" />
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Skeleton className="h-1.5 w-full rounded-full" />
        <Skeleton className="h-3 w-1/2 rounded-lg" />
      </div>
    </Card>
  );
}

export function AchievementsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-6 w-56 rounded-lg" />
      {[0, 1].map((block) => (
        <div key={block} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24 rounded-lg" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <CardSkeleton key={card} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
