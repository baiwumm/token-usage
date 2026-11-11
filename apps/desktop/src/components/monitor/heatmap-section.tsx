import type { HeatmapPayload } from "@/lib/heatmap-helpers";
import type { UsagePeriod } from "@/lib/preferences";

import { CircleInfo } from "@gravity-ui/icons";
import { Card, Typography } from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HeatmapFilter } from "@/components/monitor/heatmap-filter";
import { HeatmapTooltip } from "@/components/monitor/heatmap-tooltip";
import { formatPercent, formatTokens } from "@/lib/format-tokens";
import {
  buildMonthMarkers,
  CELL_GAP,
  clipHeatmap,
  fitHeatmapWidth,
  HEATMAP_STOPS,
  heatmapPeriodStartMs,
  LABEL_WIDTH,
  localTzLabel,
  MIN_CELL,
  TOOLTIP_HIDE_DELAY_MS,
  type HeatmapCell,
  type TooltipAnchor,
} from "@/lib/heatmap-helpers";

const WEEKDAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];

const PERIOD_LABELS: Record<UsagePeriod, string> = {
  today: "今日",
  "7d": "近 7 天",
  "30d": "近 30 天",
  all: "近一年",
};

interface LevelCell extends HeatmapCell {
  total: number;
  level: number;
}

/** Canonical source totals across the whole grid, tokens desc. */
function canonicalSourceTotals(
  columns: HeatmapPayload["weeks"],
): Array<readonly [string, number]> {
  const totals = new Map<string, number>();

  for (const column of columns) {
    for (const cell of column) {
      if (!cell) continue;
      for (const [source, tokens] of Object.entries(cell.sources)) {
        totals.set(source, (totals.get(source) ?? 0) + tokens);
      }
    }
  }

  return [...totals.entries()]
    .filter(([, tokens]) => tokens > 0)
    .sort((first, second) => second[1] - first[1]);
}

/**
 * Width-driven cell sizing for the grid (web use-responsive-weeks.ts 同款):
 * at most `maxWeeks` columns, shrinking to the 15 px floor and then dropping
 * the oldest week columns when the card is narrow. The grid is always the
 * full year, so a period change never resizes the cells.
 */
function useResponsiveWeeks(maxWeeks: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(MIN_CELL);
  const [visibleWeeks, setVisibleWeeks] = useState(maxWeeks);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || maxWeeks <= 0) return;

    // One measurement per animation frame (a window drag fires the observer
    // continuously), and bail out when the values did not actually change so
    // the 364-cell grid is not re-rendered for every intermediate width.
    let frame = 0;
    const update = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const { weeks, cellSize: nextCellSize } = fitHeatmapWidth(
          element.clientWidth,
          maxWeeks,
        );

        setVisibleWeeks((previous) => (previous === weeks ? previous : weeks));
        setCellSize((previous) =>
          previous === nextCellSize ? previous : nextCellSize,
        );
      });
    };

    update();
    // The ResizeObserver alone covers it: any window resize that changes the
    // card width re-fires the observer, so a second window listener would
    // just run the same measurement twice per resize.
    const observer = new ResizeObserver(update);

    observer.observe(element);

    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [maxWeeks]);

  return { containerRef, cellSize, visibleWeeks };
}

/**
 * Year-wide activity heatmap, web 仪表盘活跃热力图同款移植（2026-11-11 D9
 * 修正：364 天锚定今天、未来日不渲染、alignWeeks 周一对齐首列补空；加入
 * web 的「全部平台」来源筛选，等级与合计按所选来源客户端重算）。2026-11-11
 * 验收第三轮：跟随页头周期——网格仍固定整年 364 格，只把窗口外的日期清空
 * （今日 / 近 7 天 / 近 30 天），活跃日与合计按剩余数据重算。共享 portal tooltip 显示当日
 * 来源明细。本机口径与 web 账号全设备口径数字不同，卡内以「仅本机数据」注明
 * （2026-11-11 操作者拍板）。
 */
export function HeatmapSection({
  payload,
  period,
  nowMs,
}: {
  payload: HeatmapPayload;
  period: UsagePeriod;
  nowMs: number;
}) {
  const scoped = useMemo(
    () => clipHeatmap(payload, heatmapPeriodStartMs(nowMs, period)),
    [nowMs, payload, period],
  );
  const columns = scoped.weeks;
  const { containerRef, cellSize, visibleWeeks } = useResponsiveWeeks(
    columns.length || 1,
  );

  const sourceTotals = useMemo(() => canonicalSourceTotals(columns), [columns]);

  const [selectedSources, setSelectedSources] = useState<Set<string> | null>(
    null,
  );
  const activeSources = useMemo(
    () =>
      selectedSources == null
        ? null
        : sourceTotals
            .map(([source]) => source)
            .filter((source) => selectedSources.has(source)),
    [selectedSources, sourceTotals],
  );
  const filtersActive = selectedSources != null;

  // Levels re-compute against the busiest day of the whole year under the
  // active source selection (web 同款 quartile thresholds, 0 = empty).
  const cells = useMemo(() => {
    const selected = new Set(activeSources ?? []);
    const totalOf = (cell: HeatmapCell): number =>
      activeSources == null
        ? cell.totalTokens
        : Object.entries(cell.sources)
            .filter(([source]) => selected.has(source))
            .reduce((sum, [, tokens]) => sum + tokens, 0);
    const maxValue = Math.max(
      0,
      ...columns.map((column) =>
        Math.max(0, ...column.map((cell) => (cell ? totalOf(cell) : 0))),
      ),
    );
    const levelOf = (value: number): number => {
      if (value <= 0) return 0;
      if (maxValue === 0) return 1;
      const ratio = value / maxValue;

      if (ratio <= 0.25) return 1;
      if (ratio <= 0.5) return 2;
      if (ratio <= 0.75) return 3;

      return 4;
    };

    return columns.map((column) =>
      column.map((cell): LevelCell | null => {
        if (!cell) return null;
        const total = totalOf(cell);

        return { ...cell, total, level: levelOf(total) };
      }),
    );
  }, [activeSources, columns]);
  const visible = useMemo(
    () => cells.slice(-visibleWeeks),
    [cells, visibleWeeks],
  );

  const monthFormatter = useMemo(
    () => new Intl.DateTimeFormat("zh-CN", { month: "short", timeZone: "UTC" }),
    [],
  );
  const monthMarkers = useMemo(
    () => buildMonthMarkers(visible.length, payload.to, monthFormatter),
    [monthFormatter, payload.to, visible.length],
  );

  const [tooltip, setTooltip] = useState<TooltipAnchor | null>(null);
  const tooltipRef = useRef<TooltipAnchor | null>(null);
  const hideTimer = useRef(0);

  const updateTooltip = useCallback((next: TooltipAnchor | null) => {
    tooltipRef.current = next;
    setTooltip(next);
  }, []);

  useEffect(
    () => () => {
      window.clearTimeout(hideTimer.current);
    },
    [],
  );

  const showFor = useCallback(
    (target: HTMLElement) => {
      const day = target.dataset.day;
      const weekIndex = Number(target.dataset.weekIndex);
      const dayIndex = Number(target.dataset.dayIndex);
      const cell = visible[weekIndex]?.[dayIndex];

      if (!day || !cell) return;
      window.clearTimeout(hideTimer.current);
      if (tooltipRef.current?.day === day || !target.isConnected) return;
      const rect = target.getBoundingClientRect();

      updateTooltip({
        day,
        cell,
        left: rect.left + rect.width / 2,
        top: rect.top,
        bottom: rect.bottom,
      });
    },
    [updateTooltip, visible],
  );

  const scheduleHide = useCallback(() => {
    window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(
      () => updateTooltip(null),
      TOOLTIP_HIDE_DELAY_MS,
    );
  }, [updateTooltip]);

  const onPointerOver = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const target = (event.target as HTMLElement).closest<HTMLElement>(
        "[data-day]",
      );

      if (target) showFor(target);
    },
    [showFor],
  );

  const filteredTotal = useMemo(
    () => visible.flat().reduce((sum, cell) => sum + (cell?.total ?? 0), 0),
    [visible],
  );

  const weekTemplate = `${LABEL_WIDTH}px repeat(${visible.length}, ${cellSize}px)`;

  return (
    <Card className="border-border">
      <Card.Header className="flex-row! items-center justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <Card.Title>
            活跃热力图
            <Typography className="ml-2 inline" color="muted" type="body-xs">
              {PERIOD_LABELS[period]}
            </Typography>
          </Card.Title>
          <Card.Description>
            {scoped.activeDays} 个活跃日
            {filtersActive
              ? ` · 筛选后 ${formatTokens(filteredTotal)}`
              : " · 仅本机数据"}
          </Card.Description>
        </div>
        <HeatmapFilter
          activeSources={activeSources}
          sourceTotals={sourceTotals}
          onSelect={setSelectedSources}
        />
      </Card.Header>
      <Card.Content className="gap-3">
        {filtersActive && (activeSources?.length ?? 0) === 0 ? (
          <div className="text-muted flex w-full items-center justify-center gap-2 py-10 text-sm">
            <CircleInfo aria-hidden="true" className="size-4" />
            请至少选择一个平台。
          </div>
        ) : (
          <>
            <div ref={containerRef} className="w-full min-w-0">
              <div className="w-full overflow-hidden">
                <div
                  className="text-muted mb-1.5 text-[10px] font-medium"
                  style={{
                    display: "grid",
                    gridTemplateColumns: weekTemplate,
                    columnGap: CELL_GAP,
                  }}
                >
                  <span />
                  {monthMarkers.map((marker) => (
                    <span
                      key={`${marker.label}-${marker.index}`}
                      style={{
                        gridColumnStart: marker.index + 2,
                        whiteSpace: "nowrap",
                      }}
                    >
                      {marker.label}
                    </span>
                  ))}
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: weekTemplate,
                    columnGap: CELL_GAP,
                  }}
                >
                  <div
                    className="text-muted pr-1 text-[10px] font-medium"
                    style={{
                      display: "grid",
                      gridTemplateRows: `repeat(7, ${cellSize}px)`,
                      rowGap: CELL_GAP,
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
                    style={{
                      display: "grid",
                      gridAutoFlow: "column",
                      gridTemplateRows: `repeat(7, ${cellSize}px)`,
                      gridTemplateColumns: `repeat(${visible.length}, ${cellSize}px)`,
                      gap: CELL_GAP,
                    }}
                    onPointerLeave={scheduleHide}
                    onPointerOver={onPointerOver}
                  >
                    {visible.map((week, weekIndex) =>
                      week.map((cell, dayIndex) => {
                        // Null slots (Monday pad / tail after today) MUST
                        // still occupy a grid slot, or auto-flow would drag
                        // every later cell left/up (web 同款).
                        if (!cell) {
                          return (
                            <div
                              key={`pad-${weekIndex}-${dayIndex}`}
                              aria-hidden="true"
                              style={{ height: cellSize, width: cellSize }}
                            />
                          );
                        }
                        const color =
                          HEATMAP_STOPS[cell.level] ?? HEATMAP_STOPS[0];

                        return (
                          <div
                            key={cell.day}
                            aria-label={`${cell.day} · ${formatTokens(cell.total)}`}
                            className="transition-transform hover:scale-110"
                            data-day={cell.day}
                            data-day-index={dayIndex}
                            data-week-index={weekIndex}
                            role="img"
                            style={{
                              background: color,
                              borderRadius: 4,
                              height: cellSize,
                              width: cellSize,
                            }}
                          />
                        );
                      }),
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-muted flex items-center justify-between text-xs">
              <span className="tabular-nums">{localTzLabel()}</span>
              <span className="flex items-center gap-1.5">
                <span>少</span>
                {HEATMAP_STOPS.map((color) => (
                  <span
                    key={color}
                    aria-hidden="true"
                    className="size-3 rounded-md"
                    style={{ background: color }}
                  />
                ))}
                <span>多</span>
              </span>
            </div>
          </>
        )}
      </Card.Content>
      {tooltip ? (
        <HeatmapTooltip
          emptyLabel="当日无用量"
          formatPercent={formatPercent}
          formatTokens={formatTokens}
          tooltip={tooltip}
        />
      ) : null}
    </Card>
  );
}
