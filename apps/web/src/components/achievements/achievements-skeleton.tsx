"use client";

// First-load skeleton for /achievements: the summary header plus two category
// blocks of circular badge placeholders. The circles keep the real badge size
// (96px) so the wall does not jump when the payload lands.

import { Skeleton } from "@heroui/react";

function WallCellSkeleton() {
  return (
    <div className="flex flex-col items-center gap-2 p-1">
      <Skeleton className="size-24 rounded-full" />
      <Skeleton className="h-3.5 w-20 rounded-lg" />
      <Skeleton className="h-3 w-12 rounded-lg" />
    </div>
  );
}

export function AchievementsSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-28 rounded-lg" />
          <Skeleton className="h-3 w-48 rounded-lg" />
        </div>
        <div className="flex flex-col items-end gap-2">
          <Skeleton className="h-9 w-20 rounded-lg" />
          <Skeleton className="h-1.5 w-40 rounded-full" />
        </div>
      </div>
      <Skeleton className="h-3.5 w-56 rounded-lg" />

      {[0, 1].map((block) => (
        <div key={block} className="flex flex-col gap-3">
          <Skeleton className="h-4 w-24 rounded-lg" />
          <div className="grid grid-cols-3 gap-2 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {[0, 1, 2, 3, 4, 5].map((cell) => (
              <WallCellSkeleton key={cell} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
