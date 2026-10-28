"use client";

// Year-wide activity heatmap (docs/ui-spec.md 仪表盘): GitHub-style grid that
// fills the card width, with a platform/source filter, month + weekday rulers,
// a timezone footnote and a shared hover tooltip. Interaction model follows
// juejin-usage's ActivityHeatmap (one delegated portal tooltip instead of a
// Tooltip tree per cell — 364 cells would rebuild too much on each refresh).

import type { HeatmapPayload } from "@/lib/dashboard/api";
import type { DashboardCopy } from "@/lib/copy/dashboard";

import { CircleInfo } from "@gravity-ui/icons";
import { Card, Typography } from "@heroui/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { canonicalTokenTotals } from "./aggregate";
import { HeatmapFilter } from "./heatmap-filter";
import {
  alignWeeks,
  buildMonthMarkers,
  canonicalSources,
  CELL_GAP,
  HEATMAP_STOPS,
  LABEL_WIDTH,
  TARGET_WEEKS,
  TOOLTIP_HIDE_DELAY_MS,
  type GridCell,
  type TooltipAnchor,
} from "./heatmap-geometry";
import { HeatmapTooltip } from "./heatmap-tooltip";
import { useResponsiveWeeks } from "./use-responsive-weeks";

import { formatMessage } from "@/lib/copy/message";
import { tzLabel } from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

// Memoized: refresh renders keep the previous payload reference, so the
// 364-cell grid and its tooltip state skip re-rendering entirely.
function HeatmapCardImpl({
  payload,
  copy,
  locale,
  timezone,
  onDaySelect,
}: {
  payload: HeatmapPayload;
  copy: DashboardCopy;
  locale: "zh" | "en";
  timezone: string;
  /** Present = cells are clickable (dashboard → sessions cross-link). */
  onDaySelect?: (day: string) => void;
}) {
  const { formatTokens } = useFormat();
  const [selectedSources, setSelectedSources] = useState<Set<string> | null>(
    null,
  );

  const columns = useMemo(() => alignWeeks(payload), [payload]);

  const sourceTotals = useMemo(
    () =>
      canonicalTokenTotals(
        payload.weeks
          .flat()
          .flatMap(
            (cell) =>
              Object.entries(cell.sources ?? {}) as Array<
                readonly [string, number]
              >,
          ),
      ),
    [payload],
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

  const dayTotals = useMemo(() => {
    const totals = new Map<string, number>();

    for (const cell of payload.weeks.flat()) {
      totals.set(cell.day, cell.total_tokens);
    }

    return totals;
  }, [payload]);

  const grid = useMemo<[Array<Array<GridCell | null>>, number]>(() => {
    const filtered = new Set(activeSources ?? []);
    const totals = new Map<string, number>();

    for (const column of columns) {
      for (const cell of column) {
        if (!cell?.day) continue;
        const value =
          activeSources == null
            ? (dayTotals.get(cell.day) ?? 0)
            : Object.entries(cell.sources ?? {})
                .filter(([source]) => filtered.has(source))
                .reduce((sum, [, tokens]) => sum + tokens, 0);

        totals.set(cell.day, value);
      }
    }
    const maxValue = Math.max(0, ...totals.values());
    const levelOf = (value: number): number => {
      if (value <= 0) return 0;
      if (maxValue === 0) return 1;
      const ratio = value / maxValue;

      if (ratio <= 0.25) return 1;
      if (ratio <= 0.5) return 2;
      if (ratio <= 0.75) return 3;

      return 4;
    };

    const cells = columns.map((column) =>
      column.map((cell) =>
        cell?.day
          ? {
              day: cell.day,
              total: totals.get(cell.day) ?? 0,
              level: levelOf(totals.get(cell.day) ?? 0),
              sources: canonicalSources(cell.sources),
            }
          : null,
      ),
    );

    return [cells, maxValue];
  }, [activeSources, columns, dayTotals]);

  const [cells] = grid;
  const { containerRef, cellSize, visibleWeeks } = useResponsiveWeeks(
    cells.length || TARGET_WEEKS,
  );
  const visible = useMemo(
    () => cells.slice(-visibleWeeks),
    [cells, visibleWeeks],
  );

  const monthFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
        month: "short",
        timeZone: "UTC",
      }),
    [locale],
  );
  // Rows run Mon..Sun (columns are Mon-start weeks). Single-character labels
  // fit the narrow ruler column; Intl "short" renders 周一-style and wraps.
  // The English set repeats T and S, so the ruler keys off the weekday slot.
  const dayLabels =
    locale === "zh"
      ? ["一", "二", "三", "四", "五", "六", "日"]
      : ["M", "T", "W", "T", "F", "S", "S"];
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
  const filtersActive = selectedSources != null;

  return (
    <Card className="p-4 md:p-6">
      <Card.Header className="flex-col items-start justify-between gap-2 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <Card.Title>
            {copy.charts.heatmapTitle}
            <Typography className="ml-2 inline" color="muted" type="body-xs">
              {copy.charts.heatmapMonths}
            </Typography>
          </Card.Title>
          <Card.Description>
            {formatMessage(copy.charts.heatmapActiveDays, locale, {
              count: payload.active_days,
            })}
            {filtersActive
              ? ` · ${copy.charts.heatmapFiltered}: ${formatTokens(filteredTotal)}`
              : ""}
          </Card.Description>
        </div>
        <HeatmapFilter
          activeSources={activeSources}
          copy={copy}
          locale={locale}
          sourceTotals={sourceTotals}
          onSelect={setSelectedSources}
        />
      </Card.Header>
      <Card.Content className="gap-3">
        {filtersActive && (activeSources?.length ?? 0) === 0 ? (
          <div className="text-muted flex w-full items-center justify-center gap-2 py-10 text-sm">
            <CircleInfo aria-hidden="true" className="size-4" />
            {copy.charts.heatmapPickOne}
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
                    {dayLabels.map((label, index) => (
                      <span
                        key={index}
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
                        if (!cell) return null;
                        const color =
                          HEATMAP_STOPS[cell.level] ?? HEATMAP_STOPS[0];
                        const shared = {
                          "aria-label": `${cell.day} · ${formatTokens(cell.total)}`,
                          "data-day": cell.day,
                          "data-day-index": dayIndex,
                          "data-week-index": weekIndex,
                          style: {
                            background: color,
                            borderRadius: 4,
                            height: cellSize,
                            width: cellSize,
                          } as const,
                        };

                        // Clickable (dashboard cross-links the day into
                        // sessions) or plain display (aria-label only).
                        return onDaySelect ? (
                          <button
                            key={cell.day}
                            {...shared}
                            className="cursor-pointer appearance-none border-0 p-0 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
                            type="button"
                            onClick={() => onDaySelect(cell.day)}
                          />
                        ) : (
                          <div key={cell.day} {...shared} role="img" />
                        );
                      }),
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="text-muted flex items-center justify-between text-xs">
              <span className="tabular-nums">{tzLabel(timezone)}</span>
              <span className="flex items-center gap-1.5">
                {copy.charts.heatmapLess}
                {HEATMAP_STOPS.map((color) => (
                  <span
                    key={color}
                    aria-hidden="true"
                    className="size-3 rounded-md"
                    style={{ background: color }}
                  />
                ))}
                {copy.charts.heatmapMore}
              </span>
            </div>
          </>
        )}
      </Card.Content>
      {tooltip ? (
        <HeatmapTooltip
          activeSources={activeSources}
          copy={copy}
          tooltip={tooltip}
        />
      ) : null}
    </Card>
  );
}

export const HeatmapCard = memo(HeatmapCardImpl);
