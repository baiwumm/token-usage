import type { HeatmapDay, HeatmapMonth } from "@/lib/heatmap-helpers";

import { Card, Typography } from "@heroui/react";
import { useEffect, useRef } from "react";

import { formatTokens } from "@/lib/format-tokens";
import { heatmapLevel } from "@/lib/heatmap-helpers";

const CELL = 12;
const GAP = 4;
const LABEL_WIDTH = 26;
const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const LEVEL_CLASSES = [
  "bg-default",
  "bg-accent/25",
  "bg-accent/45",
  "bg-accent/70",
  "bg-accent",
] as const;

interface HeatmapSectionProps {
  days: HeatmapDay[];
  months: HeatmapMonth[];
  totalTokens: number;
  maxTokens: number;
}

/**
 * Full-year rhythm heatmap, presentation borrowed from the web dashboard's
 * activity heatmap (desktop-plan §12.4): month ruler on top, Monday–Sunday
 * ruler on the left, fixed 12 px cells with a five-step accent scale, and a
 * 「本地时区 / 少 → 多」footer. A 53-week grid cannot fit a 400 px window at a
 * readable size, so the grid scrolls horizontally and opens scrolled to the
 * newest week; the card itself never widens the window (operator reviews
 * 2026-11-10). The grid keeps one summary label instead of 371 tab stops.
 */
export function HeatmapSection({
  days,
  months,
  totalTokens,
  maxTokens,
}: HeatmapSectionProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const pinnedToEnd = useRef(false);
  const weeks = Math.max(1, Math.round(days.length / 7));
  const gridWidth = weeks * CELL + (weeks - 1) * GAP;

  // Open on the newest days; the flag keeps later 10 s polls from yanking the
  // strip back after the operator scrolled into older months.
  useEffect(() => {
    const element = scrollRef.current;

    if (pinnedToEnd.current || !element) return;
    element.scrollLeft = element.scrollWidth;
    pinnedToEnd.current = true;
  }, []);

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>使用节奏</Card.Title>
        <Card.Description>
          近一年 · {formatTokens(totalTokens)} tokens
        </Card.Description>
      </Card.Header>
      <Card.Content className="gap-3">
        {totalTokens === 0 ? (
          <Typography className="text-muted" type="body">
            近一年暂无数据
          </Typography>
        ) : (
          <>
            <div ref={scrollRef} className="w-full overflow-x-auto">
              <div className="w-max">
                <div className="flex" style={{ columnGap: GAP }}>
                  <span style={{ width: LABEL_WIDTH }} />
                  <div
                    className="text-muted text-[10px] font-medium"
                    style={{
                      columnGap: GAP,
                      display: "grid",
                      gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`,
                      width: gridWidth,
                    }}
                  >
                    {months.map((month) => (
                      <span
                        key={`${month.index}-${month.label}`}
                        style={{
                          gridColumnStart: month.index + 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {month.label}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mt-1.5 flex" style={{ columnGap: GAP }}>
                  <div
                    className="text-muted text-[10px] font-medium"
                    style={{
                      display: "grid",
                      gridTemplateRows: `repeat(7, ${CELL}px)`,
                      rowGap: GAP,
                      width: LABEL_WIDTH,
                    }}
                  >
                    {WEEKDAY_LABELS.map((label) => (
                      <span
                        key={label}
                        className="flex items-center"
                        style={{ lineHeight: 1 }}
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                  <div
                    aria-label={`近一年每日用量热力图，合计 ${formatTokens(totalTokens)} tokens`}
                    className="grid"
                    role="img"
                    style={{
                      display: "grid",
                      gap: GAP,
                      gridAutoFlow: "column",
                      gridTemplateColumns: `repeat(${weeks}, ${CELL}px)`,
                      gridTemplateRows: `repeat(7, ${CELL}px)`,
                      width: gridWidth,
                    }}
                  >
                    {days.map((day) => (
                      <span
                        key={day.day}
                        aria-hidden="true"
                        className={`rounded-[3px] ${LEVEL_CLASSES[heatmapLevel(day.tokens, maxTokens)]}`}
                        title={`${day.day} · ${formatTokens(day.tokens)} tokens · ${day.conversations} 会话`}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-muted">
              <span>本地时区</span>
              <span className="flex items-center gap-1.5">
                <span>少</span>
                {LEVEL_CLASSES.map((className) => (
                  <span
                    key={className}
                    aria-hidden="true"
                    className={`size-3 rounded-[3px] ${className}`}
                  />
                ))}
                <span>多</span>
              </span>
            </div>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
