"use client";

// Per-model table for /wrapped: model, tokens, cost and a share meter.

import type { WrappedCopy } from "@/lib/copy/wrapped";
import type { DashboardModel } from "@/lib/dashboard/api";

import { Meter, Typography } from "@heroui/react";

import { SourceIcon } from "../dashboard/source-icon";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { useFormat } from "@/lib/format/format";

export function ModelsTable({
  copy,
  models,
  totalTokens,
  refreshing,
}: {
  copy: WrappedCopy;
  models: DashboardModel[];
  totalTokens: number;
  refreshing: boolean;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();

  const columns: DataTableColumn<DashboardModel>[] = [
    {
      id: "model",
      header: copy.table.model,
      cell: (entry) => (
        <span className="flex min-w-0 items-center gap-1.5">
          <SourceIcon label={entry.model} size={14} />
          <span className="truncate font-medium">{entry.model}</span>
        </span>
      ),
    },
    {
      id: "tokens",
      header: copy.table.tokens,
      className: "whitespace-nowrap tabular-nums",
      cell: (entry) => formatTokens(entry.total_tokens),
    },
    {
      id: "cost",
      header: copy.table.cost,
      className: "whitespace-nowrap tabular-nums",
      cell: (entry) => formatCost(entry.total_cost_usd),
    },
    {
      id: "share",
      header: copy.table.share,
      cell: (entry) => {
        const share = totalTokens > 0 ? entry.total_tokens / totalTokens : 0;

        return (
          <div className="flex items-center gap-2">
            <Meter
              aria-label={`${entry.model} ${formatPercent(share)}`}
              className="w-24 shrink-0"
              value={share * 100}
            >
              <Meter.Track className="h-1.5">
                <Meter.Fill className="bg-accent" />
              </Meter.Track>
            </Meter>
            <span className="text-foreground/60 tabular-nums text-xs">
              {formatPercent(share)}
            </span>
          </div>
        );
      },
    },
  ];

  return (
    <DataTableCard
      columns={columns}
      empty={
        <Typography color="muted" type="body-sm">
          {copy.modelsEmpty}
        </Typography>
      }
      refreshing={refreshing}
      rowKey={(entry) => entry.model}
      rows={models}
      status="ready"
      tableLabel={copy.modelsTitle}
      title={copy.modelsTitle}
    />
  );
}
