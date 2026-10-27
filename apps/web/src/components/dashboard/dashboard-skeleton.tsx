"use client";

// First-load dashboard skeleton. The loaded page stacks a hero card, the
// heatmap, the trend card, the model/source breakdown row, the device panel
// and the detail table; mirror those shells so the cards settle into place
// without a layout jump (docs/ui-spec.md 状态与可访问性).

import { Card, Skeleton } from "@heroui/react";

function PanelHeader({
  title,
  description,
  trailing,
}: {
  title: string;
  description?: string;
  trailing?: string;
}) {
  return (
    <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
      <div className="flex flex-col gap-1">
        <Skeleton className={`h-5 rounded-full ${title}`} />
        {description ? (
          <Skeleton className={`h-3 rounded-full ${description}`} />
        ) : null}
      </div>
      {trailing ? (
        <Skeleton className={`h-8 rounded-full ${trailing}`} />
      ) : null}
    </Card.Header>
  );
}

export function DashboardSkeleton() {
  return (
    <div aria-hidden="true" className="flex flex-col gap-5">
      {/* Total tokens hero: headline, absorbed KPI line, share bar, source tiles. */}
      <Card className="p-6">
        <Card.Content className="flex flex-col items-center gap-3">
          <Skeleton className="h-3 w-20 rounded-full" />
          <Skeleton className="h-12 w-64 rounded-2xl" />
          <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Skeleton key={index} className="h-3 w-28 rounded-full" />
            ))}
          </div>
          <Skeleton className="h-4 w-28 rounded-full" />
          <Skeleton className="h-3 w-48 rounded-full" />
          <Skeleton className="h-2 w-full rounded-full" />
          <div className="grid w-full grid-cols-2 gap-2 pt-2 sm:grid-cols-4 lg:grid-cols-6">
            {Array.from({ length: 6 }, (_, index) => (
              <Skeleton key={index} className="h-20 w-full rounded-3xl" />
            ))}
          </div>
        </Card.Content>
      </Card>

      <Card className="p-4 md:p-6">
        <PanelHeader description="w-52" title="w-40" trailing="w-28" />
        <Card.Content className="gap-3">
          <Skeleton className="h-44 w-full rounded-3xl" />
        </Card.Content>
      </Card>

      <Card className="p-6">
        <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-5 w-32 rounded-full" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </Card.Header>
        <Card.Content>
          <Skeleton className="h-72 w-full rounded-3xl" />
        </Card.Content>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <PanelHeader description="w-48" title="w-32" trailing="w-16" />
          <Card.Content className="flex flex-col gap-4">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                  <Skeleton className="h-4 w-32 rounded-full" />
                  <Skeleton className="h-3 w-24 rounded-full" />
                </div>
                <Skeleton className="h-1.5 w-full rounded-full" />
              </div>
            ))}
          </Card.Content>
        </Card>

        <Card className="p-6">
          <PanelHeader description="w-40" title="w-24" />
          <Card.Content className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
            <Skeleton className="size-44 shrink-0 rounded-full" />
            <div className="flex w-full min-w-0 flex-1 flex-col gap-3">
              {Array.from({ length: 5 }, (_, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between gap-2"
                >
                  <Skeleton className="h-4 w-24 rounded-full" />
                  <Skeleton className="h-3 w-12 rounded-full" />
                </div>
              ))}
            </div>
          </Card.Content>
        </Card>
      </div>

      <Card className="p-6">
        <PanelHeader description="w-44" title="w-32" />
        <Card.Content className="flex flex-col gap-1">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-14 w-full rounded-3xl" />
          ))}
        </Card.Content>
      </Card>

      <Card className="p-6">
        <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-5 w-28 rounded-full" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-40 rounded-full" />
            <Skeleton className="h-8 w-32 rounded-full" />
          </div>
        </Card.Header>
        <Card.Content className="flex flex-col gap-2">
          {Array.from({ length: 10 }, (_, index) => (
            <Skeleton key={index} className="h-10 w-full rounded-xl" />
          ))}
          <div className="grid w-full grid-cols-1 items-center gap-3 pt-1 md:grid-cols-[1fr_auto_1fr]">
            <Skeleton className="h-3 w-32 rounded-full" />
            <div className="flex justify-center gap-1">
              {Array.from({ length: 5 }, (_, index) => (
                <Skeleton key={index} className="size-8 rounded-full" />
              ))}
            </div>
            <Skeleton className="h-8 w-36 justify-self-end rounded-full" />
          </div>
        </Card.Content>
      </Card>
    </div>
  );
}
