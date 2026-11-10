"use client";

// First-load dashboard skeleton. The loaded page stacks a hero card, the
// heatmap, the achievements strip, the trend card, the model/source breakdown
// row, the credits card, the device panel and the detail table; mirror those
// shells so the cards settle into place without a layout jump (docs/ui-spec.md
// 状态与可访问性). Every card block below is exported: a section whose own
// request lands after the first paint renders the same shell from its loading
// branch, so a placeholder never changes shape between the two phases.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { DetailRow } from "./detail-table";

import { Card, Skeleton, cn } from "@heroui/react";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";

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
        <Skeleton className={cn("h-6 rounded-full", title)} />
        {description ? (
          <Skeleton className={cn("h-5 rounded-full", description)} />
        ) : null}
      </div>
      {trailing ? (
        <Skeleton className={cn("h-8 rounded-full", trailing)} />
      ) : null}
    </Card.Header>
  );
}

/** 热门模型卡（`top-models-panel.tsx`）：标题 + 提示 + 「查看全部」，每行模型名与
 * 三项指标压在一条占比条上。 */
export function ModelsCardSkeleton() {
  return (
    <Card className="p-6">
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-24 rounded-full" />
          <Skeleton className="h-5 w-48 rounded-full" />
        </div>
        <Skeleton className="h-8 w-20 rounded-full" />
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-2">
              <span className="flex min-w-0 items-center gap-1.5">
                <Skeleton className="size-3.5 shrink-0 rounded-full" />
                <Skeleton className="h-4 w-32 rounded-full" />
              </span>
              <Skeleton className="h-3 w-36 rounded-full" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

/** 来源构成卡（`source-panel.tsx`）：标题 + 提示，环形图配五行可点击来源。 */
export function SourcesCardSkeleton() {
  return (
    <Card className="p-6">
      <Card.Header>
        <Skeleton className="h-6 w-24 rounded-full" />
        <Skeleton className="h-5 w-48 rounded-full" />
      </Card.Header>
      <Card.Content className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        <Skeleton className="size-48 shrink-0 rounded-full sm:size-52" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center gap-2">
              <Skeleton className="size-3.5 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="ms-auto h-3 w-16 rounded-full" />
              <Skeleton className="h-3 w-10 rounded-full" />
            </div>
          ))}
        </div>
      </Card.Content>
    </Card>
  );
}

/**
 * 积分消耗卡（`credits-card.tsx`，docs/sources-capture-plan.md §3 C 方案）：
 * 标题 + 提示、逐来源的占比条与积分数、底部合计行。真实卡片只在范围内确有
 * credits 数据时出现，骨架无从得知，因此无条件绘制——没有积分制来源的实例会
 * 看到这张卡出现又消失，换来有积分数据时的位置对齐。
 */
export function CreditsCardSkeleton() {
  return (
    <Card className="relative p-6">
      <Card.Header>
        <Skeleton className="h-6 w-20 rounded-full" />
        <Skeleton className="h-5 w-96 rounded-full" />
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div key={index} className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2">
              <Skeleton className="size-3.5 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-24 rounded-full" />
            </span>
            <span className="flex items-center gap-3">
              <Skeleton className="hidden h-1.5 w-24 rounded-full sm:block" />
              <Skeleton className="h-4 w-20 rounded-full" />
              <Skeleton className="hidden h-3 w-10 rounded-full sm:inline" />
            </span>
          </div>
        ))}
        <div className="border-default flex items-center justify-end gap-3 border-t pt-2">
          <Skeleton className="h-3 w-12 rounded-full" />
          <Skeleton className="h-4 w-20 rounded-full" />
        </div>
      </Card.Content>
    </Card>
  );
}

/** 设备卡（`device-panel.tsx`）：标题 + 提示，每台设备一行（图标、名称、平台
 * 徽章、Token · 成本）加一条最后上报时间。 */
export function DevicesCardSkeleton() {
  return (
    <Card className="p-6">
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Skeleton className="h-6 w-16 rounded-full" />
          <Skeleton className="h-5 w-64 rounded-full" />
        </div>
      </Card.Header>
      <Card.Content className="flex flex-col gap-1">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex flex-col gap-2 rounded-3xl px-3 py-2.5"
          >
            <div className="flex items-center gap-2">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <Skeleton className="h-4 w-32 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="ms-auto h-3 w-28 rounded-full" />
            </div>
            <Skeleton className="h-3 w-44 rounded-full" />
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}

/**
 * 用量明细卡（`detail-table.tsx`）：与 /sessions 同一套路——直接渲染共享
 * `DataTableCard` 的加载态，真实标题与列头之下是单元格灰条，两段加载因此是
 * 同一个组件、同一张列布局。积分列无条件绘制，理由同 `CreditsCardSkeleton`；
 * 列 id / 列头需与 `detail-table.tsx` 保持同步。
 */
export function DetailTableSkeleton({ copy }: { copy: DashboardCopy }) {
  const columns: DataTableColumn<DetailRow>[] = [
    {
      id: "time",
      header: copy.detail.columnTime,
      sortable: true,
      cell: () => null,
    },
    {
      id: "tokens",
      header: copy.detail.columnTokens,
      sortable: true,
      cell: () => null,
    },
    {
      id: "input",
      header: copy.detail.columnInput,
      sortable: true,
      cell: () => null,
    },
    {
      id: "cached",
      header: copy.detail.columnCached,
      sortable: true,
      cell: () => null,
    },
    {
      id: "output",
      header: copy.detail.columnOutput,
      sortable: true,
      cell: () => null,
    },
    {
      id: "cost",
      header: copy.detail.columnCost,
      sortable: true,
      cell: () => null,
    },
    {
      id: "conversations",
      header: copy.detail.columnConversations,
      sortable: true,
      cell: () => null,
    },
    {
      id: "models",
      header: copy.detail.columnModels,
      sortable: true,
      cell: () => null,
    },
    {
      id: "credits",
      header: copy.detail.columnCredits,
      sortable: true,
      cell: () => null,
    },
  ];

  return (
    <DataTableCard
      className="p-6"
      columns={columns}
      empty={null}
      extra={<Skeleton className="h-8 w-40 rounded-full" />}
      loadingRows={10}
      rowKey={() => ""}
      rows={[]}
      sort={{
        descriptor: { column: "time", direction: "descending" },
        onChange: () => {},
      }}
      status="loading"
      tableLabel={copy.detail.title}
      title={copy.detail.title}
    />
  );
}

export function DashboardSkeleton({ copy }: { copy: DashboardCopy }) {
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

      {/* Achievements strip: header plus two stacked groups of five wall tiles. */}
      <Card className="p-6">
        <PanelHeader description="w-44" title="w-24" trailing="w-20" />
        <Card.Content className="flex flex-col gap-4">
          {Array.from({ length: 2 }, (_, group) => (
            <div key={group} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-16 rounded-full" />
              <div className="grid grid-cols-3 gap-1 sm:grid-cols-5">
                {Array.from({ length: 5 }, (_, tile) => (
                  <div
                    key={tile}
                    className="flex flex-col items-center gap-1.5 p-1"
                  >
                    <Skeleton className="size-20 rounded-full md:size-24" />
                    <Skeleton className="h-3 w-16 rounded-full" />
                    <Skeleton className="h-3 w-10 rounded-full" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </Card.Content>
      </Card>

      <Card className="p-6">
        <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-6 w-32 rounded-full" />
          <div className="flex flex-wrap items-center gap-2">
            <Skeleton className="h-8 w-28 rounded-full" />
            <Skeleton className="h-8 w-28 rounded-full" />
          </div>
        </Card.Header>
        <Card.Content>
          <Skeleton className="h-72 w-full rounded-3xl" />
        </Card.Content>
      </Card>

      {/* Breakdown row: models and sources side by side, credits spanning below. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <ModelsCardSkeleton />
        <SourcesCardSkeleton />
      </div>

      <CreditsCardSkeleton />

      <DevicesCardSkeleton />

      <DetailTableSkeleton copy={copy} />
    </div>
  );
}
