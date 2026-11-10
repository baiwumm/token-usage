import type { SourceUsage } from "@/lib/queue-lines";

import { useMemo } from "react";
import { Card, Typography } from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import { formatTokens } from "@/lib/format-tokens";
import { groupSourceUsage, sourceDisplayLabel } from "@/lib/source-logos";

interface SourceMixCardProps {
  sources: SourceUsage[];
  periodLabel: string;
}

/**
 * Source mix for the selected period: canonical groups (trae-cn → Trae, …)
 * with brand logos, ranked bars driven by each group's share of the window
 * total. Read-only view over the queue baseline.
 */
export function SourceMixCard({ sources, periodLabel }: SourceMixCardProps) {
  const grouped = useMemo(() => groupSourceUsage(sources), [sources]);
  // Credits-only sources (e.g. qoder-cn) carry zero tokens in the window; a
  // token mix would only show them as "0 · 0%" with the 2% minimum bar.
  const ranked = useMemo(
    () => grouped.filter((source) => source.tokens > 0).slice(0, 8),
    [grouped],
  );

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>来源构成</Card.Title>
        <Card.Description>{periodLabel}</Card.Description>
      </Card.Header>
      <Card.Content>
        {ranked.length === 0 ? (
          <Typography className="text-muted" type="body">
            窗口内暂无数据
          </Typography>
        ) : (
          <ul className="flex flex-col gap-2">
            {ranked.map((source) => (
              <li key={source.source} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceIcon size={16} source={source.source} />
                    <span className="truncate text-xs text-foreground">
                      {sourceDisplayLabel(source.source)}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {formatTokens(source.tokens)}
                    {source.share < 1
                      ? ` · ${(source.share * 100).toFixed(0)}%`
                      : ""}
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full overflow-hidden rounded-full bg-default"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(source.share * 100, 2)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
