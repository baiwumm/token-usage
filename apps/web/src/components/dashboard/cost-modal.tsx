"use client";

// Read-only cost analysis modal, opened from the cost KPI or the Top models
// "view all" action (docs/ui-spec.md 仪表盘 7). All amounts are computed at
// read time by the pricing engine; unpriced models are called out explicitly.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { ModelBreakdownSource, SeriesPoint } from "@/lib/dashboard/api";

import { Chip, Modal, Tabs, Typography } from "@heroui/react";
import { useMemo } from "react";

import { canonicalSourceRows, mergeModelsAcrossSources } from "./aggregate";

import { CostTrendChart } from "@/components/charts";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { FlowNumber } from "@/components/flow-number";
import { useFormat } from "@/lib/format/format";

export function CostAnalysisModal({
  open,
  onOpenChange,
  sources,
  daily,
  totalCostUsd,
  copy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sources: ModelBreakdownSource[];
  daily: SeriesPoint[];
  totalCostUsd: number;
  copy: DashboardCopy;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();

  // One row per model name across sources, cost-ranked.
  const models = useMemo(
    () =>
      mergeModelsAcrossSources(sources).sort(
        (first, second) =>
          second.totals.total_cost_usd - first.totals.total_cost_usd ||
          second.totals.total_tokens - first.totals.total_tokens,
      ),
    [sources],
  );

  const totalTokens = models.reduce(
    (sum, entry) => sum + entry.totals.total_tokens,
    0,
  );
  const unpriced = models.filter((entry) => entry.unpriced);
  const trend = useMemo(
    () =>
      daily.map((point) => ({
        label: point.day ?? "",
        cost: point.total_cost_usd,
      })),
    [daily],
  );
  // Canonical source rows re-sorted by cost for the by-source tab.
  const sourceRows = useMemo(
    () =>
      canonicalSourceRows(sources)
        .slice()
        .sort((first, second) => second.totalCost - first.totalCost),
    [sources],
  );

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl">
          <Modal.CloseTrigger aria-label={copy.cost.close} />
          <Modal.Header>
            <Modal.Heading>{copy.cost.title}</Modal.Heading>
            <Typography color="muted" type="body-xs">
              {copy.cost.description}
            </Typography>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div className="flex flex-col gap-0.5">
                <Typography color="muted" type="body-xs">
                  {copy.cost.total}
                </Typography>
                <Typography className="tabular-nums" type="h3" weight="bold">
                  <FlowNumber text={formatCost(totalCostUsd)} />
                </Typography>
              </div>
              <div className="flex flex-col gap-0.5">
                <Typography color="muted" type="body-xs">
                  {copy.cards.totalTokens}
                </Typography>
                <Typography className="tabular-nums" type="h5" weight="medium">
                  <FlowNumber text={formatTokens(totalTokens)} />
                </Typography>
              </div>
              {unpriced.length > 0 ? (
                <Chip color="warning" size="sm" variant="soft">
                  {copy.cost.unpriced}: {unpriced.length}
                </Chip>
              ) : null}
            </div>

            {trend.length > 0 ? (
              <div className="flex flex-col gap-1">
                <Typography type="body-sm" weight="medium">
                  {copy.cost.dailyTrend}
                </Typography>
                <CostTrendChart
                  ariaLabel={copy.cost.dailyTrend}
                  data={trend}
                  labels={{ cost: copy.cost.columnCost }}
                />
              </div>
            ) : null}

            {unpriced.length > 0 ? (
              <div className="bg-warning/10 text-warning rounded-3xl px-3 py-2 text-xs">
                <span className="font-medium">{copy.cost.unpriced}</span>
                {" · "}
                {copy.cost.unpricedHint.replace(
                  "{models}",
                  unpriced.map((entry) => entry.model).join(", "),
                )}
              </div>
            ) : null}

            <Tabs defaultSelectedKey="model">
              <Tabs.ListContainer>
                <Tabs.List aria-label={copy.cost.title}>
                  <Tabs.Tab id="model">
                    {copy.cost.byModel}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="source">
                    {copy.cost.bySource}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <Tabs.Panel className="pt-3" id="model">
                {models.length === 0 ? (
                  <Typography color="muted" type="body-sm">
                    {copy.cost.noData}
                  </Typography>
                ) : (
                  <div className="flex flex-col">
                    <div className="text-muted grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-3 border-b pb-2 text-xs">
                      <span>{copy.cost.columnName}</span>
                      <span className="text-end">{copy.cost.columnTokens}</span>
                      <span className="text-end">{copy.cost.columnShare}</span>
                      <span className="text-end">{copy.cost.columnCost}</span>
                    </div>
                    {models.map((entry) => (
                      <div
                        key={entry.model}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-b py-2 text-sm last:border-b-0"
                      >
                        <span className="flex min-w-0 flex-col">
                          <span className="flex min-w-0 items-center gap-1.5">
                            <SourceIcon label={entry.model} size={14} />
                            <span className="truncate font-medium">
                              {entry.model}
                            </span>
                          </span>
                          <span className="text-muted truncate text-xs">
                            {[
                              ...new Set(
                                entry.sources.map((source) =>
                                  sourceDisplayLabel(source),
                                ),
                              ),
                            ].join(", ")}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {formatTokens(entry.totals.total_tokens)}
                        </span>
                        <span className="text-foreground/60 tabular-nums">
                          {formatPercent(
                            totalTokens > 0
                              ? entry.totals.total_tokens / totalTokens
                              : 0,
                          )}
                        </span>
                        <span className="tabular-nums">
                          {formatCost(entry.totals.total_cost_usd)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>

              <Tabs.Panel className="pt-3" id="source">
                {sourceRows.length === 0 ? (
                  <Typography color="muted" type="body-sm">
                    {copy.cost.noData}
                  </Typography>
                ) : (
                  <div className="flex flex-col">
                    <div className="text-muted grid grid-cols-[minmax(0,1fr)_auto_auto] gap-3 border-b pb-2 text-xs">
                      <span>{copy.cost.columnName}</span>
                      <span className="text-end">{copy.cost.columnTokens}</span>
                      <span className="text-end">{copy.cost.columnCost}</span>
                    </div>
                    {sourceRows.map((entry) => (
                      <div
                        key={entry.id}
                        className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-b py-2 text-sm last:border-b-0"
                      >
                        <span className="flex min-w-0 items-center gap-1.5">
                          <SourceIcon label={entry.id} size={14} />
                          <span className="truncate font-medium">
                            {entry.label}
                          </span>
                        </span>
                        <span className="tabular-nums">
                          {formatTokens(entry.totalTokens)}
                        </span>
                        <span className="tabular-nums">
                          {formatCost(entry.totalCost)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Tabs.Panel>
            </Tabs>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
