"use client";

// Year-wide activity heatmap (docs/ui-spec.md 仪表盘): GitHub-style grid that
// fills the card width, with a platform/source filter, month + weekday rulers,
// a timezone footnote and a shared hover tooltip. Interaction model follows
// juejin-usage's ActivityHeatmap (one delegated portal tooltip instead of a
// Tooltip tree per cell — 364 cells would rebuild too much on each refresh).

import type { HeatmapPayload } from "@/lib/dashboard/api";
import type { DashboardCopy } from "@/lib/copy/dashboard";

import { ChevronDown, CircleInfo } from "@gravity-ui/icons";
import {
  Button,
  Card,
  Dropdown,
  Header,
  Label,
  Popover,
  Typography,
} from "@heroui/react";
import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import { SourceIcon } from "./source-icon";
import { canonicalSource, sourceDisplayLabel } from "./sources";
import { canonicalTokenTotals } from "./aggregate";

import { formatMessage } from "@/lib/copy/message";
import { tzLabel } from "@/lib/dashboard/ranges";
import { useFormat } from "@/lib/format/format";

const MIN_CELL = 15;
const CELL_GAP = 4;
const LABEL_WIDTH = 26;
const TARGET_WEEKS = 52;
const TOOLTIP_HIDE_DELAY_MS = 80;

/** Level stops mirror the --heatmap-* tokens in globals.css. */
const HEATMAP_STOPS = [
  "var(--heatmap-0)",
  "var(--heatmap-1)",
  "var(--heatmap-2)",
  "var(--heatmap-3)",
  "var(--heatmap-4)",
] as const;

interface GridCell {
  day: string;
  /** Tokens of the active source selection (falls back to the raw total). */
  total: number;
  level: number;
  /** Canonical-id → tokens, aliases merged (Pi, DeepSeek Harness …). */
  sources: Record<string, number>;
}

function canonicalSources(
  raw: Record<string, number> | null,
): Record<string, number> {
  const out: Record<string, number> = {};

  for (const [source, tokens] of Object.entries(raw ?? {})) {
    const id = canonicalSource(source);

    out[id] = (out[id] ?? 0) + tokens;
  }

  return out;
}

function weekdayIndex(day: string): number {
  // getUTCDay(): 0=Sun..6=Sat
  return new Date(`${day}T00:00:00Z`).getUTCDay();
}

/** Columns are Mon-start weeks; the head is padded so the grid aligns. */
function alignWeeks(
  payload: HeatmapPayload,
): Array<
  Array<{ day: string | null; sources: Record<string, number> | null }>
> {
  const flat = payload.weeks.flat();
  const first = flat[0]?.day;
  const pad = first != null ? (weekdayIndex(first) + 6) % 7 : 0;
  const columns: Array<
    Array<{ day: string | null; sources: Record<string, number> | null }>
  > = [];
  let row = 0;
  let col: Array<{
    day: string | null;
    sources: Record<string, number> | null;
  }> = [];

  for (let index = 0; index < pad; index++) {
    col.push({ day: null, sources: null });
  }
  for (const cell of flat) {
    col.push({ day: cell.day, sources: cell.sources });
    row += 1;
    if (row === 7) {
      columns.push(col);
      col = [];
      row = 0;
    }
  }
  if (col.length > 0) {
    while (col.length < 7) col.push({ day: null, sources: null });
    columns.push(col);
  }

  return columns;
}

/** Month labels positioned at the week column containing each month start. */
function buildMonthMarkers(
  columns: number,
  lastDay: string,
  labels: Intl.DateTimeFormat,
): Array<{ index: number; label: string }> {
  if (columns <= 0) return [];
  const end = new Date(`${lastDay}T00:00:00Z`);
  // Anchor: the Sunday that starts the week containing `lastDay`.
  const endWeekStart = new Date(end);

  endWeekStart.setUTCDate(end.getUTCDate() - end.getUTCDay());
  const start = new Date(endWeekStart);

  start.setUTCDate(endWeekStart.getUTCDate() - (columns - 1) * 7);

  const markers: Array<{ index: number; label: string }> = [];
  const used = new Set<number>();

  for (let back = 11; back >= 0; back -= 1) {
    const month = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - back, 1),
    );
    const index = Math.floor(
      (month.getTime() - start.getTime()) / (7 * 86_400_000),
    );

    if (index < 0 || index >= columns || used.has(index)) continue;
    used.add(index);
    markers.push({ index, label: labels.format(month) });
  }

  return markers;
}

function useResponsiveWeeks(maxWeeks: number) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [cellSize, setCellSize] = useState(MIN_CELL);
  const [visibleWeeks, setVisibleWeeks] = useState(maxWeeks);

  useEffect(() => {
    const element = containerRef.current;

    if (!element || maxWeeks <= 0) return;

    const update = () => {
      const width = element.clientWidth;
      const fitted = Math.floor(
        (width - LABEL_WIDTH + CELL_GAP) / (MIN_CELL + CELL_GAP),
      );
      const weeks = Math.max(1, Math.min(maxWeeks, fitted || 1));

      if (weeks >= maxWeeks) {
        setVisibleWeeks(maxWeeks);
        const gaps = Math.max(0, maxWeeks - 1) * CELL_GAP;

        setCellSize(
          Math.max(1, Math.floor((width - LABEL_WIDTH - gaps) / maxWeeks)),
        );
      } else {
        setVisibleWeeks(weeks);
        setCellSize(MIN_CELL);
      }
    };

    update();
    // The ResizeObserver alone covers it: any window resize that changes the
    // card width re-fires the observer, so a second window listener would
    // just run the same measurement twice per resize.
    const observer = new ResizeObserver(update);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [maxWeeks]);

  return { containerRef, cellSize, visibleWeeks };
}

interface TooltipAnchor {
  day: string;
  cell: GridCell;
  left: number;
  top: number;
  bottom: number;
}

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
  const { formatTokens, formatPercent } = useFormat();
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

  let tooltipNode: ReactNode = null;

  if (tooltip) {
    const entries = Object.entries(tooltip.cell.sources)
      .filter(
        ([source]) => activeSources == null || activeSources.includes(source),
      )
      .sort((first, second) => second[1] - first[1]);
    const total = tooltip.cell.total || 1;

    tooltipNode = createPortal(
      <div
        className="bg-surface text-foreground border-border pointer-events-none fixed z-50 w-64 max-w-[calc(100vw-24px)] rounded-3xl border p-3 text-xs shadow-sm"
        role="tooltip"
        style={{
          left: Math.min(
            Math.max(tooltip.left, 128),
            Math.max(128, window.innerWidth - 128),
          ),
          top: Math.max(8, tooltip.top - 8),
          transform: "translate(-50%, -100%)",
        }}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="font-medium">{tooltip.day}</span>
          <span className="text-muted tabular-nums">
            {formatTokens(tooltip.cell.total)}
          </span>
        </div>
        {entries.length === 0 ? (
          <Typography color="muted" type="body-xs">
            {copy.charts.noData}
          </Typography>
        ) : (
          <div className="flex flex-col gap-1.5">
            {entries.slice(0, 6).map(([source, tokens]) => (
              <div key={source} className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1.5">
                  <SourceIcon label={source} size={12} />
                  <span className="min-w-0 flex-1 truncate">
                    {sourceDisplayLabel(source)}
                  </span>
                  <span className="text-muted tabular-nums">
                    {formatTokens(tokens)} · {formatPercent(tokens / total)}
                  </span>
                </div>
                <div className="bg-default h-1 overflow-hidden rounded-full">
                  <div
                    className="bg-accent h-full rounded-full"
                    style={{ width: `${(tokens / total) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>,
      document.body,
    );
  }

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
        <Dropdown>
          <Button
            aria-label={copy.charts.heatmapAllPlatforms}
            size="sm"
            variant="tertiary"
          >
            {filtersActive
              ? (activeSources?.length ?? 0) === 1
                ? sourceDisplayLabel(activeSources?.[0] ?? "")
                : formatMessage(copy.charts.heatmapSelectedCount, locale, {
                    count: activeSources?.length ?? 0,
                  })
              : copy.charts.heatmapAllPlatforms}
            <ChevronDown aria-hidden="true" className="size-3.5" />
          </Button>
          <Dropdown.Popover className="min-w-56" placement="bottom end">
            <Popover.Arrow />
            <Dropdown.Menu
              selectedKeys={filtersActive ? (activeSources ?? []) : "all"}
              selectionMode="multiple"
              onSelectionChange={(keys) => {
                if (keys === "all") {
                  setSelectedSources(null);

                  return;
                }
                setSelectedSources(new Set([...keys] as string[]));
              }}
            >
              <Dropdown.Section>
                <Header>
                  <span className="flex w-full items-center justify-between gap-2">
                    {copy.charts.heatmapAllPlatforms}
                    <span className="flex gap-1">
                      <Button
                        className="h-6 px-1.5 text-xs"
                        size="sm"
                        variant="ghost"
                        onPress={() => setSelectedSources(null)}
                      >
                        {copy.charts.heatmapAll}
                      </Button>
                      <Button
                        className="h-6 px-1.5 text-xs"
                        size="sm"
                        variant="ghost"
                        onPress={() => setSelectedSources(new Set())}
                      >
                        {copy.charts.heatmapClear}
                      </Button>
                    </span>
                  </span>
                </Header>
                {sourceTotals.map(([source]) => (
                  <Dropdown.Item
                    key={source}
                    id={source}
                    textValue={sourceDisplayLabel(source)}
                  >
                    <Dropdown.ItemIndicator />
                    <SourceIcon label={source} size={14} />
                    <Label>{sourceDisplayLabel(source)}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            </Dropdown.Menu>
          </Dropdown.Popover>
        </Dropdown>
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
                          key: cell.day,
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
                            {...shared}
                            className="cursor-pointer appearance-none border-0 p-0 transition-transform hover:scale-110 focus-visible:outline-2 focus-visible:outline-accent"
                            type="button"
                            onClick={() => onDaySelect(cell.day)}
                          />
                        ) : (
                          <div {...shared} role="img" />
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
      {tooltipNode}
    </Card>
  );
}

export const HeatmapCard = memo(HeatmapCardImpl);
