import type { HeatmapDay } from "@/lib/heatmap-helpers";

import { Card, Typography } from "@heroui/react";

import { formatTokens } from "@/lib/format-tokens";
import { heatmapLevel } from "@/lib/heatmap-helpers";

const LEVEL_CLASSES = [
  "bg-default",
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
] as const;

interface HeatmapSectionProps {
  days: HeatmapDay[];
  totalTokens: number;
  maxTokens: number;
}

/**
 * 12-week rhythm heatmap (desktop-plan §12.4): 12 columns × 7 local days,
 * Monday-aligned, last column ending on Sunday so weekday rows never drift.
 * The grid carries one accessible summary label instead of 84 tab stops; each
 * cell keeps its own title for hover. Levels reuse the accent token, so the
 * scale follows the theme.
 */
export function HeatmapSection({
  days,
  totalTokens,
  maxTokens,
}: HeatmapSectionProps) {
  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>使用节奏</Card.Title>
        <Card.Description>
          近 12 周 · {formatTokens(totalTokens)} tokens
        </Card.Description>
      </Card.Header>
      <Card.Content className="gap-3">
        {totalTokens === 0 ? (
          <Typography className="text-muted" type="body">
            近 12 周暂无数据
          </Typography>
        ) : (
          <>
            <div
              aria-label={`近 12 周每日用量热力图，合计 ${formatTokens(totalTokens)} tokens`}
              className="grid w-fit grid-flow-col gap-1"
              role="img"
              style={{ gridTemplateRows: "repeat(7, minmax(0, 1fr))" }}
            >
              {days.map((day) => (
                <span
                  key={day.day}
                  aria-hidden="true"
                  className={`size-2.5 rounded-[3px] ${LEVEL_CLASSES[heatmapLevel(day.tokens, maxTokens)]}`}
                  title={`${day.day} · ${formatTokens(day.tokens)} tokens · ${day.conversations} 会话`}
                />
              ))}
            </div>
            <div className="flex items-center justify-end gap-1.5 text-xs text-muted">
              <span>少</span>
              {LEVEL_CLASSES.map((className) => (
                <span
                  key={className}
                  aria-hidden="true"
                  className={`size-2.5 rounded-[3px] ${className}`}
                />
              ))}
              <span>多</span>
            </div>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
