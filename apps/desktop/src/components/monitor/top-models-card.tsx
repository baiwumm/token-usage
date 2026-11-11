import type { ModelUsage, SourceUsage } from "@/lib/queue-lines";

import { Button, Card, Meter, Typography } from "@heroui/react";
import { useMemo, useState } from "react";

import { CostDialog } from "@/components/monitor/cost-dialog";
import { ModelIcon } from "@/components/model-icon";
import { formatCost, formatPercent, formatTokens } from "@/lib/format-tokens";

const TOP_N = 8;

/**
 * Top 模型 ranking card (web 仪表盘 Top models 同款移植): models merged by
 * name (queue rows are already per-model so this is just a rank + slice),
 * sorted by tokens, top 8 with icon · tokens · share · cost and a Meter bar.
 * 「成本分析」 opens the cost modal (totals, daily cost area, per-model /
 * per-source tables). Shares are of the window total, so the top eight do not
 * have to add up to 100%.
 */
export function TopModelsCard({
  models,
  sources,
  dailyCost,
}: {
  models: ModelUsage[];
  sources: SourceUsage[];
  /** Daily cost series of the active window, for the cost modal's chart. */
  dailyCost: Array<{ label: string; cost: number }>;
}) {
  const [costOpen, setCostOpen] = useState(false);
  const totalTokens = useMemo(
    () => models.reduce((sum, entry) => sum + entry.tokens, 0),
    [models],
  );
  const top = useMemo(
    () =>
      [...models]
        .filter((entry) => entry.tokens > 0)
        .sort((first, second) => second.tokens - first.tokens)
        .slice(0, TOP_N),
    [models],
  );

  return (
    <Card className="border-border">
      <Card.Header className="flex-row! items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Card.Title>Top 模型</Card.Title>
          <Card.Description>
            按 Token 用量排序，前 {TOP_N} 个。
          </Card.Description>
        </div>
        <Button size="sm" variant="ghost" onPress={() => setCostOpen(true)}>
          成本分析
        </Button>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {top.length === 0 ? (
          <Typography color="muted" type="body-sm">
            该时间范围内没有模型数据。
          </Typography>
        ) : (
          top.map((entry) => {
            const share = totalTokens > 0 ? entry.tokens / totalTokens : 0;

            return (
              <div key={entry.model} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <ModelIcon model={entry.model} size={14} />
                    <span className="truncate font-medium" title={entry.model}>
                      {entry.model}
                    </span>
                  </span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    {formatTokens(entry.tokens)} · {formatPercent(share)} ·{" "}
                    {formatCost(entry.totalCostUsd)}
                  </span>
                </div>
                <Meter
                  aria-label={`${entry.model} ${formatPercent(share)}`}
                  value={share * 100}
                >
                  <Meter.Track className="h-1.5">
                    <Meter.Fill className="bg-accent" />
                  </Meter.Track>
                </Meter>
              </div>
            );
          })
        )}
      </Card.Content>
      <CostDialog
        dailyCost={dailyCost}
        models={models}
        open={costOpen}
        sources={sources}
        onOpenChange={setCostOpen}
      />
    </Card>
  );
}
