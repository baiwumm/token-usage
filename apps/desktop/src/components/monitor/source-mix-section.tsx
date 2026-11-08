import type { SourceUsage } from "@/lib/queue-lines";

import { Typography } from "@heroui/react";

import { formatTokens } from "@/lib/format-tokens";

interface SourceMixSectionProps {
  sources: SourceUsage[];
}

/**
 * Source mix for the window (近 7 天): ranked bars driven by each source's
 * share of the window total. Read-only view over the queue baseline.
 */
export function SourceMixSection({ sources }: SourceMixSectionProps) {
  return (
    <section className="rounded-2xl border border-border bg-surface p-3">
      <Typography className="text-muted" type="body">
        来源构成（近 7 天）
      </Typography>
      {sources.length === 0 ? (
        <Typography className="text-muted" type="body">
          窗口内暂无数据
        </Typography>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {sources.slice(0, 8).map((source) => (
            <li key={source.source} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-xs text-foreground">
                  {source.source}
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
    </section>
  );
}
