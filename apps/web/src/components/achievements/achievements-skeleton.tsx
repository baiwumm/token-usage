"use client";

// First-load skeleton for /achievements: the summary band plus two category
// blocks of three cards, matching the badge-first card shape so the layout
// does not jump when the payload lands.

import { Card, Skeleton } from "@heroui/react";

function CardSkeleton() {
  return (
    <Card className="items-center gap-2 border border-border/60 p-5 pt-6">
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="mt-2 h-3.5 w-24 rounded-lg" />
      <Skeleton className="h-3 w-16 rounded-full" />
      <Skeleton className="mt-1 h-3 w-40 rounded-lg" />
      <Skeleton className="mt-3 h-1.5 w-full rounded-full" />
      <Skeleton className="h-3 w-2/3 rounded-lg" />
    </Card>
  );
}

export function AchievementsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-32 w-full rounded-3xl" />
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
