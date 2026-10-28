"use client";

// Top-models ranking panel: merged across sources, sorted by tokens, with a
// "view all" trigger into the full model list.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { ModelBreakdownSource } from "@/lib/dashboard/api";

import { Button, Card, Meter, Typography } from "@heroui/react";
import { memo, useMemo } from "react";

import { mergeModelsAcrossSources } from "./aggregate";

import { SourceIcon } from "@/components/source-icon";
import { useFormat } from "@/lib/format/format";

// Memoized: the breakdown slot only changes when its request settles.
function TopModelsImpl({
  sources,
  copy,
  onViewAll,
}: {
  sources: ModelBreakdownSource[];
  copy: DashboardCopy;
  onViewAll: () => void;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();
  // The wire lists models per source; the same model name can come from
  // several sources (e.g. step-5-preview on zcode and opencode). Merging by
  // name keeps the ranking (and its React keys) unique.
  const merged = useMemo(() => mergeModelsAcrossSources(sources), [sources]);
  const totalTokens = merged.reduce(
    (sum, entry) => sum + entry.totals.total_tokens,
    0,
  );

  const top = useMemo(
    () =>
      [...merged]
        .sort((a, b) => b.totals.total_tokens - a.totals.total_tokens)
        .slice(0, 8),
    [merged],
  );

  return (
    <Card className="p-6">
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Card.Title>{copy.panels.modelsTitle}</Card.Title>
          <Card.Description>{copy.panels.modelsHint}</Card.Description>
        </div>
        <Button size="sm" variant="ghost" onPress={onViewAll}>
          {copy.panels.viewAll}
        </Button>
      </Card.Header>
      <Card.Content className="flex flex-col gap-3">
        {top.length === 0 ? (
          <Typography color="muted" type="body-sm">
            {copy.panels.noModels}
          </Typography>
        ) : (
          top.map((entry) => {
            const share =
              totalTokens > 0 ? entry.totals.total_tokens / totalTokens : 0;

            return (
              <div key={entry.model} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <SourceIcon label={entry.model} size={14} />
                    <span className="truncate font-medium">{entry.model}</span>
                  </span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    {formatTokens(entry.totals.total_tokens)} ·{" "}
                    {formatPercent(share)} ·{" "}
                    {formatCost(entry.totals.total_cost_usd)}
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
    </Card>
  );
}

export const TopModels = memo(TopModelsImpl);
