"use client";

// Read-only cost analysis modal, opened from the cost KPI or the Top models
// "view all" action (docs/ui-spec.md 仪表盘 7). All amounts are computed at
// read time by the pricing engine; unpriced models are called out explicitly.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type {
  ModelBreakdownModel,
  ModelBreakdownSource,
  SeriesPoint,
} from "@/lib/dashboard/api";

import { Button, Chip, Modal, Tabs, Typography } from "@heroui/react";
import { useMemo } from "react";

import { CostTrendChart } from "./charts";

import { FlowNumber } from "@/components/flow-number";
import { useFormat } from "@/lib/format/format";

interface ModelRow {
  model: string;
  sources: string[];
  tokens: number;
  cost: number;
  unpriced: boolean;
}

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

  const models = useMemo<ModelRow[]>(() => {
    const byModel = new Map<string, ModelRow>();

    for (const source of sources) {
      for (const entry of source.models as ModelBreakdownModel[]) {
        const existing = byModel.get(entry.model) ?? {
          model: entry.model,
          sources: [],
          tokens: 0,
          cost: 0,
          unpriced: false,
        };

        existing.tokens += entry.totals.total_tokens;
        existing.cost += Number(entry.totals.total_cost_usd) || 0;
        existing.unpriced =
          existing.unpriced ||
          (entry.pricing.status === "unpriced" &&
            entry.totals.total_tokens > 0);
        if (!existing.sources.includes(source.source)) {
          existing.sources.push(source.source);
        }
        byModel.set(entry.model, existing);
      }
    }

    return [...byModel.values()].sort(
      (first, second) =>
        second.cost - first.cost || second.tokens - first.tokens,
    );
  }, [sources]);

  const totalTokens = models.reduce((sum, entry) => sum + entry.tokens, 0);
  const unpriced = models.filter((entry) => entry.unpriced);
  const trend = daily.map((point) => ({
    label: point.day ?? "",
    cost: point.total_cost_usd,
  }));
  const sourceRows = [...sources].sort(
    (first, second) =>
      Number(second.totals.total_cost_usd) -
      Number(first.totals.total_cost_usd),
  );

  return (
    <Modal>
      <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
        <Modal.Container>
          <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl">
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
                  <Typography
                    className="tabular-nums"
                    type="h5"
                    weight="medium"
                  >
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
                <div className="bg-warning/10 text-warning rounded-xl px-3 py-2 text-xs">
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
                        <span className="text-end">
                          {copy.cost.columnTokens}
                        </span>
                        <span className="text-end">
                          {copy.cost.columnShare}
                        </span>
                        <span className="text-end">{copy.cost.columnCost}</span>
                      </div>
                      {models.map((entry) => (
                        <div
                          key={entry.model}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-baseline gap-3 border-b py-2 text-sm last:border-b-0"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">
                              {entry.model}
                            </span>
                            <span className="text-muted truncate text-xs">
                              {entry.sources.join(", ")}
                            </span>
                          </span>
                          <span className="tabular-nums">
                            {formatTokens(entry.tokens)}
                          </span>
                          <span className="text-foreground/60 tabular-nums">
                            {formatPercent(
                              totalTokens > 0 ? entry.tokens / totalTokens : 0,
                            )}
                          </span>
                          <span className="tabular-nums">
                            {formatCost(entry.cost)}
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
                        <span className="text-end">
                          {copy.cost.columnTokens}
                        </span>
                        <span className="text-end">{copy.cost.columnCost}</span>
                      </div>
                      {sourceRows.map((entry) => (
                        <div
                          key={entry.source}
                          className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-baseline gap-3 border-b py-2 text-sm last:border-b-0"
                        >
                          <span className="truncate font-medium">
                            {entry.source}
                          </span>
                          <span className="tabular-nums">
                            {formatTokens(entry.totals.total_tokens)}
                          </span>
                          <span className="tabular-nums">
                            {formatCost(entry.totals.total_cost_usd)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </Tabs.Panel>
              </Tabs>
            </Modal.Body>
            <Modal.Footer>
              <Button
                slot="close"
                variant="secondary"
                onPress={() => onOpenChange(false)}
              >
                {copy.cost.close}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
