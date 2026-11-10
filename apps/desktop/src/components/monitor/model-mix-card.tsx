import type { ModelUsage } from "@/lib/queue-lines";

import { Card, Typography } from "@heroui/react";
import { useMemo } from "react";

import { formatTokens } from "@/lib/format-tokens";

interface ModelMixCardProps {
  models: ModelUsage[];
  periodLabel: string;
}

const MAX_ROWS = 5;

/**
 * Model mix for the selected period. Same anatomy as the source card (label +
 * tokens/share + ranked bar), but model names are raw collector strings, so a
 * long one truncates with a native title instead of wrapping the bar.
 * Shares are of the window total, so the top five do not have to add up to
 * 100% — the remainder belongs to models outside the list.
 */
export function ModelMixCard({ models, periodLabel }: ModelMixCardProps) {
  const { top, restCount } = useMemo(() => {
    const ranked = models.filter((model) => model.tokens > 0);

    return {
      top: ranked.slice(0, MAX_ROWS),
      restCount: Math.max(0, ranked.length - MAX_ROWS),
    };
  }, [models]);

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>主要模型</Card.Title>
        <Card.Description>{periodLabel}</Card.Description>
      </Card.Header>
      <Card.Content>
        {top.length === 0 ? (
          <Typography className="text-muted" type="body">
            窗口内暂无数据
          </Typography>
        ) : (
          <ul className="flex flex-col gap-2">
            {top.map((model) => (
              <li key={model.model} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2">
                  <span
                    className="min-w-0 truncate text-xs text-foreground"
                    title={model.model}
                  >
                    {model.model}
                  </span>
                  <span className="shrink-0 text-xs text-muted tabular-nums">
                    {formatTokens(model.tokens)} ·{" "}
                    {(model.share * 100).toFixed(0)}%
                  </span>
                </div>
                <div
                  aria-hidden="true"
                  className="h-1.5 w-full overflow-hidden rounded-full bg-default"
                >
                  <div
                    className="h-full rounded-full bg-accent"
                    style={{ width: `${Math.max(model.share * 100, 2)}%` }}
                  />
                </div>
              </li>
            ))}
            {restCount > 0 ? (
              <li className="text-xs text-muted">其余 {restCount} 个模型</li>
            ) : null}
          </ul>
        )}
      </Card.Content>
    </Card>
  );
}
