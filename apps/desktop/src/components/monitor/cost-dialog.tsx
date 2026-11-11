import type { ModelUsage, SourceUsage } from "@/lib/queue-lines";

import { Modal, Tabs, Typography } from "@heroui/react";
import { useMemo } from "react";

import { CostTrendChart } from "@/components/charts";
import { BreakdownTable } from "@/components/monitor/breakdown-table";
import { ModelIcon } from "@/components/model-icon";
import { SourceIcon } from "@/components/source-icon";
import { formatCost, formatTokens } from "@/lib/format-tokens";
import { groupSourceUsage, sourceDisplayLabel } from "@/lib/source-logos";

/**
 * 成本分析 modal (web 同款移植, simplified): totals headline + the daily cost
 * area chart + per-model / per-source tabs sharing the BreakdownTable shell.
 * Amounts are the collector's clamped estimates summed from the queue — the
 * web's read-time pricing engine has no desktop counterpart, so there is no
 * unpriced-model callout here.
 */
export function CostDialog({
  open,
  onOpenChange,
  models,
  sources,
  dailyCost,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  models: ModelUsage[];
  sources: SourceUsage[];
  /** Daily cost series of the active window (label = MM-DD). */
  dailyCost: Array<{ label: string; cost: number }>;
}) {
  const costRanked = useMemo(
    () =>
      [...models].sort(
        (first, second) =>
          second.totalCostUsd - first.totalCostUsd ||
          second.tokens - first.tokens,
      ),
    [models],
  );
  const totalCostUsd = models.reduce(
    (sum, entry) => sum + entry.totalCostUsd,
    0,
  );
  const totalTokens = models.reduce((sum, entry) => sum + entry.tokens, 0);
  const sourceRows = useMemo(
    () =>
      groupSourceUsage(sources)
        .slice()
        .sort((first, second) => second.totalCostUsd - first.totalCostUsd),
    [sources],
  );
  const sourceTotalTokens = sourceRows.reduce(
    (sum, entry) => sum + entry.tokens,
    0,
  );

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Container>
        <Modal.Dialog className="max-h-[90vh] w-[calc(100vw-1rem)] max-w-3xl">
          <Modal.CloseTrigger aria-label="关闭" />
          <Modal.Header>
            <Modal.Heading>成本分析</Modal.Heading>
            <Typography color="muted" type="body-xs">
              成本为采集端上报的估算值（预计口径）
            </Typography>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-5">
            <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
              <div className="flex flex-col gap-0.5">
                <Typography color="muted" type="body-xs">
                  总成本
                </Typography>
                <Typography className="tabular-nums" type="h3" weight="bold">
                  {formatCost(totalCostUsd)}
                </Typography>
              </div>
              <div className="flex flex-col gap-0.5">
                <Typography color="muted" type="body-xs">
                  总 Tokens
                </Typography>
                <Typography className="tabular-nums" type="h5" weight="medium">
                  {formatTokens(totalTokens)}
                </Typography>
              </div>
            </div>

            {dailyCost.length > 0 ? (
              <div className="flex flex-col gap-1">
                <Typography type="body-sm" weight="medium">
                  每日成本
                </Typography>
                <CostTrendChart ariaLabel="每日成本" data={dailyCost} />
              </div>
            ) : null}

            <Tabs defaultSelectedKey="model">
              <Tabs.ListContainer>
                <Tabs.List aria-label="成本分析">
                  <Tabs.Tab id="model">
                    按模型
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab id="source">
                    按来源
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>

              <Tabs.Panel className="pt-3" id="model">
                {costRanked.length === 0 ? (
                  <Typography color="muted" type="body-sm">
                    该时间范围内没有成本数据。
                  </Typography>
                ) : (
                  <BreakdownTable
                    ariaLabel="按模型"
                    labels={{
                      name: "名称",
                      tokens: "Token",
                      share: "占比",
                      cost: "成本",
                      credits: "积分",
                    }}
                    minClassName="min-w-[28rem]"
                    rows={costRanked.map((entry) => ({
                      id: entry.model,
                      label: entry.model,
                      icon: <ModelIcon model={entry.model} size={14} />,
                      tokens: entry.tokens,
                      share:
                        totalTokens > 0
                          ? entry.tokens / totalTokens
                          : undefined,
                      cost: entry.totalCostUsd,
                    }))}
                  />
                )}
              </Tabs.Panel>

              <Tabs.Panel className="pt-3" id="source">
                {sourceRows.length === 0 ? (
                  <Typography color="muted" type="body-sm">
                    该时间范围内没有成本数据。
                  </Typography>
                ) : (
                  <BreakdownTable
                    ariaLabel="按来源"
                    labels={{
                      name: "名称",
                      tokens: "Token",
                      share: "占比",
                      cost: "成本",
                      credits: "积分",
                    }}
                    minClassName="min-w-[28rem]"
                    rows={sourceRows.map((entry) => ({
                      id: entry.source,
                      label: sourceDisplayLabel(entry.source),
                      icon: <SourceIcon size={14} source={entry.source} />,
                      tokens: entry.tokens,
                      share:
                        sourceTotalTokens > 0
                          ? entry.tokens / sourceTotalTokens
                          : undefined,
                      cost: entry.totalCostUsd,
                    }))}
                  />
                )}
              </Tabs.Panel>
            </Tabs>
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
