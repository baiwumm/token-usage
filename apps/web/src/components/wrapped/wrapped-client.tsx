"use client";

// Wrapped (annual review) at /wrapped — year totals, monthly trend,
// sources/models breakdown, highlights, and a Canvas-2D share card export.
// Data comes from the frozen Dashboard-face endpoints (dashboard payload +
// account-monthly).

import {
  ArrowDownToLine,
  Calendar,
  Comments,
  Hashtag,
  Wallet,
} from "@gravity-ui/icons";
import {
  Button,
  Card,
  ListBox,
  Meter,
  Select,
  Spinner,
  Table,
  Typography,
  toast,
  Popover,
} from "@heroui/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { TrendChart, type TrendPoint } from "../dashboard/charts";
import { seriesColor } from "../dashboard/mini-charts";
import { SourceIcon } from "../dashboard/source-icon";
import { sourceDisplayLabel } from "../dashboard/sources";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { WRAPPED_COPY } from "@/lib/copy/wrapped";
import { useLocale } from "@/lib/copy/locale";
import {
  DashboardApiError,
  fetchDashboard,
  fetchMonthly,
  type DashboardPayload,
  type MonthlyPoint,
} from "@/lib/dashboard/api";
import { useFormat } from "@/lib/format/format";
import {
  ALL_RANGE_START,
  browserTimezone,
  dayKeyInTz,
  yearRange,
} from "@/lib/dashboard/ranges";

type LoadStatus = "loading" | "ready" | "error";

// The dashboard's default timezone view: the browser zone, not UTC — the
// year boundary must match the tz the rest of the app buckets by.
function currentYear(): number {
  return Number(dayKeyInTz(new Date(), browserTimezone()).slice(0, 4));
}

const MONTHS_PER_YEAR = 12;

// One entry per month of the review: a closed year shows all twelve, the
// running year stops at the current month so the axis carries no future void.
function monthsOfYear(year: number, timeZone: string): string[] {
  const currentMonth = dayKeyInTz(new Date(), timeZone).slice(0, 7);

  return Array.from(
    { length: MONTHS_PER_YEAR },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  ).filter((month) => month <= currentMonth);
}

export function WrappedClient() {
  const [locale] = useLocale();
  const copy = WRAPPED_COPY[locale];
  const { formatTokens, formatCost, formatNumber, formatPercent, formatMonth } =
    useFormat();

  const [status, setStatus] = useState<LoadStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [payload, setPayload] = useState<DashboardPayload | null>(null);
  const [monthly, setMonthly] = useState<MonthlyPoint[]>([]);
  const [year, setYear] = useState(currentYear);
  // Years that actually carry usage, newest first — the select only offers
  // these (operator call 2026-10-28).
  const [historyYears, setHistoryYears] = useState<number[]>([]);
  const [exporting, setExporting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const cardRef = useRef<HTMLDivElement | null>(null);
  // Run id: switching years starts a new load while the old one may still be
  // in flight; a superseded response must never overwrite the newer year.
  const loadSeq = useRef(0);
  // Whether any payload has landed — a failed refresh keeps the previous
  // year's content on screen; only an empty slot falls to the error state.
  const hasPayload = useRef(false);
  // Set once the operator picks a year, so the auto-jump to the newest year
  // with data never overrides a deliberate choice.
  const yearChosen = useRef(false);

  const { accessToken, redirectToLogin } = useSessionBootstrap("/wrapped");
  const timezone = browserTimezone();

  const loadAll = useCallback(
    async (token: string) => {
      const seq = ++loadSeq.current;

      setLoadError(null);
      setRefreshing(true);

      try {
        const tzRange = yearRange(year, timezone);
        const [nextPayload, nextHistory] = await Promise.all([
          fetchDashboard(token, {
            fromIso: tzRange.fromIso,
            toIso: tzRange.toIso,
            rangeKey: "custom",
            // Same zone the year window is cut in — the payload's daily rows
            // (peak day) bucket by the requested tz too.
            tz: timezone,
          }),
          // All-history months: drives both the year selector (months come
          // back only when they carry rows) and the selected year's series.
          fetchMonthly(token, {
            fromDay: ALL_RANGE_START,
            toDay: dayKeyInTz(new Date(), timezone),
          }),
        ]);

        if (loadSeq.current !== seq) return;
        setPayload(nextPayload);
        setHistoryYears(
          Array.from(
            new Set(
              nextHistory.data.map((point) => Number(point.month.slice(0, 4))),
            ),
          )
            .filter((value) => Number.isFinite(value))
            .sort((a, b) => b - a),
        );
        setMonthly(
          nextHistory.data.filter((point) =>
            point.month.startsWith(`${year}-`),
          ),
        );
        hasPayload.current = true;
        setStatus("ready");
      } catch (error) {
        if (loadSeq.current !== seq) return;
        if (error instanceof DashboardApiError && error.status === 401) {
          redirectToLogin();

          return;
        }
        setLoadError(error instanceof Error ? error.message : "error");
        setStatus(hasPayload.current ? "ready" : "error");
      } finally {
        if (loadSeq.current === seq) setRefreshing(false);
      }
    },
    [timezone, year, redirectToLogin],
  );

  useEffect(() => {
    if (accessToken) void loadAll(accessToken);
  }, [accessToken, loadAll]);

  // While the first load runs the current year keeps the select populated.
  const yearOptions = useMemo(
    () => (historyYears.length > 0 ? historyYears : [year]),
    [historyYears, year],
  );

  // A running year without usage (January before the first sync) would land
  // on the empty card; jump to the newest year that has data once the list
  // arrives, unless the operator already picked a year.
  useEffect(() => {
    if (yearChosen.current || historyYears.length === 0) return;
    if (historyYears.includes(year)) return;
    setYear(historyYears[0]);
  }, [historyYears, year]);

  // Canvas-drawn share card: html-to-image hangs cloning this page's
  // Tailwind-4/oklch computed styles (tried font on/off, pixelRatio 1/2 --
  // the img.load step never settles), so the export draws the same design
  // with Canvas 2D directly. Deterministic and resolution-independent.
  function drawShareCard(): string {
    const width = 1200;
    const height = 630;
    const scale = 2;
    const canvas = document.createElement("canvas");

    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext("2d");

    if (!ctx) throw new Error("canvas unavailable");
    ctx.scale(scale, scale);

    const yearTotals = totals;
    const font = '"Maple Mono CN", ui-monospace, monospace';

    // Backdrop: dark brand surface with a soft primary glow.
    ctx.fillStyle = "#101014";
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(
      width - 160,
      120,
      40,
      width - 160,
      120,
      520,
    );

    glow.addColorStop(0, "rgba(99,102,241,0.35)");
    glow.addColorStop(1, "rgba(99,102,241,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);

    ctx.textBaseline = "top";

    // Header.
    ctx.fillStyle = "#f1f1f3";
    ctx.font = `600 30px ${font}`;
    ctx.fillText("Token Usage", 64, 56);
    ctx.fillStyle = "rgba(241,241,243,0.55)";
    ctx.font = `400 16px ${font}`;
    ctx.fillText(copy.share.cardCaption, 64, 96);

    // Year headline — same title the preview shows.
    ctx.fillStyle = "#f1f1f3";
    ctx.font = `700 54px ${font}`;
    ctx.fillText(copy.share.cardTitle.replace("{year}", String(year)), 64, 150);

    // Big token number.
    ctx.fillStyle = "#818cf8";
    ctx.font = `700 64px ${font}`;
    ctx.fillText(formatTokens(yearTotals?.total_tokens ?? 0), 64, 236);
    ctx.fillStyle = "rgba(241,241,243,0.55)";
    ctx.font = `400 18px ${font}`;
    ctx.fillText(copy.cards.totalTokens, 64, 312);

    // Stat tiles.
    const tiles: Array<[string, string]> = [
      [copy.cards.cost, formatCost(yearTotals?.total_cost_usd ?? 0)],
      [copy.cards.conversations, formatNumber(yearTotals?.conversations ?? 0)],
      [copy.cards.activeDays, formatNumber(yearTotals?.active_days ?? 0)],
    ];
    let tileX = 64;

    for (const [label, value] of tiles) {
      ctx.fillStyle = "rgba(255,255,255,0.06)";
      ctx.beginPath();
      ctx.roundRect(tileX, 368, 330, 108, 14);
      ctx.fill();
      ctx.fillStyle = "rgba(241,241,243,0.55)";
      ctx.font = `400 15px ${font}`;
      ctx.fillText(label, tileX + 22, 392);
      ctx.fillStyle = "#f1f1f3";
      ctx.font = `600 28px ${font}`;
      ctx.fillText(value, tileX + 22, 422);
      tileX += 354;
    }

    // Highlights line.
    if (highlights.length > 0) {
      ctx.fillStyle = "rgba(241,241,243,0.7)";
      ctx.font = `400 17px ${font}`;
      const line = highlights
        .map(([label, value]) => `${label}: ${value}`)
        .join("   ·   ");

      ctx.fillText(line.slice(0, 110), 64, 528);
    }

    return canvas.toDataURL("image/png");
  }

  async function exportCard() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("export timeout")), 15_000);
    });

    try {
      const dataUrl = await Promise.race([drawShareCard(), timeout]);
      const link = document.createElement("a");

      link.download = `token-usage-wrapped-${year}.png`;
      link.href = dataUrl;
      link.click();
      toast.success(copy.share.exported);
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";

      toast(
        detail
          ? `${copy.share.exportFailed} (${detail})`
          : copy.share.exportFailed,
      );
    } finally {
      clearTimeout(timer);
      setExporting(false);
    }
  }

  const totals = payload?.totals;
  const hasData = (totals?.total_tokens ?? 0) > 0;
  const models = payload?.models ?? [];
  const sources = payload?.sources ?? [];
  const daily = payload?.daily ?? [];
  const peakDay =
    daily.length > 0
      ? daily.reduce((best, day) =>
          day.total_tokens > best.total_tokens ? day : best,
        )
      : null;

  // Month buckets are UTC-fixed (docs/cli-contract.md §2.7) while the totals
  // above ride the browser tz; only rows near a year boundary can differ.
  const trendData = useMemo<TrendPoint[]>(() => {
    const byMonth = new Map(monthly.map((point) => [point.month, point]));

    return monthsOfYear(year, timezone).map((month) => {
      const point = byMonth.get(month);

      return {
        key: month,
        label: formatMonth(month),
        tokens: point?.total_tokens ?? 0,
        cost: point?.total_cost_usd ?? 0,
        conversations: point?.conversation_count ?? 0,
        input: point?.input_tokens ?? 0,
        // Same merge as the dashboard: cache read + cache write stack
        // together so the composition sums to the token total.
        cached:
          (point?.cached_input_tokens ?? 0) +
          (point?.cache_creation_input_tokens ?? 0),
        output: point?.output_tokens ?? 0,
      };
    });
  }, [formatMonth, monthly, timezone, year]);

  const highlights: Array<[string, string]> = [];

  if (models[0]) {
    highlights.push([
      copy.topModel,
      `${models[0].model} · ${formatTokens(models[0].total_tokens)}`,
    ]);
  }
  if (sources[0]) {
    highlights.push([
      copy.topSource,
      `${sourceDisplayLabel(sources[0].source)} · ${formatTokens(sources[0].total_tokens)}`,
    ]);
  }
  if (peakDay && peakDay.total_tokens > 0) {
    highlights.push([
      copy.peakDay,
      `${peakDay.date} · ${formatTokens(peakDay.total_tokens)}`,
    ]);
  }

  const totalTokens = totals?.total_tokens ?? 0;
  const stats = totals
    ? [
        {
          key: "tokens",
          label: copy.cards.totalTokens,
          value: formatTokens(totals.total_tokens),
          icon: Hashtag,
        },
        {
          key: "cost",
          label: copy.cards.cost,
          value: formatCost(totals.total_cost_usd),
          icon: Wallet,
        },
        {
          key: "conversations",
          label: copy.cards.conversations,
          value: formatNumber(totals.conversations),
          icon: Comments,
        },
        {
          key: "activeDays",
          label: copy.cards.activeDays,
          value: formatNumber(totals.active_days),
          icon: Calendar,
        },
      ]
    : [];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-6 md:px-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <Select
          aria-label={copy.yearAriaLabel}
          className="w-48"
          value={String(year)}
          onChange={(key) => {
            if (key == null) return;
            yearChosen.current = true;
            setYear(Number(key));
          }}
        >
          <Select.Trigger>
            <Select.Value />
            {/* Options are still loading: the indicator becomes a spinner;
                otherwise it falls back to the chevron. */}
            {refreshing ? (
              <Select.Indicator>
                <Spinner size="sm" />
              </Select.Indicator>
            ) : (
              <Select.Indicator />
            )}
          </Select.Trigger>
          <Select.Popover>
            <Popover.Arrow />
            <ListBox>
              {yearOptions.map((candidate) => (
                <ListBox.Item
                  key={candidate}
                  id={String(candidate)}
                  textValue={String(candidate)}
                >
                  {`${candidate} ${copy.yearSuffix}`}
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
        <Button
          isPending={exporting}
          size="sm"
          variant="secondary"
          onPress={() => void exportCard()}
        >
          {({ isPending }) => (
            <>
              {isPending ? (
                <Spinner color="current" size="sm" />
              ) : (
                <ArrowDownToLine className="size-4" />
              )}
              {copy.share.button}
            </>
          )}
        </Button>
      </header>

      {status === "loading" ? (
        <Card className="items-center gap-2 p-10">
          <Spinner />
          <Typography color="muted" type="body-sm">
            {copy.loading}
          </Typography>
        </Card>
      ) : null}

      {status === "error" ? (
        <Card className="flex-col gap-3 p-6">
          <Typography className="text-danger" type="body-sm">
            {copy.loadError}
            {loadError ? ` (${loadError})` : ""}
          </Typography>
          <Button
            size="sm"
            variant="outline"
            onPress={() => {
              if (accessToken) void loadAll(accessToken);
            }}
          >
            {copy.retry}
          </Button>
        </Card>
      ) : null}

      {status === "ready" && !hasData ? (
        <Card className="p-10">
          <Card.Header>
            <Card.Title>{`${year} · ${copy.emptyTitle}`}</Card.Title>
            <Card.Description>{copy.emptyBody}</Card.Description>
          </Card.Header>
        </Card>
      ) : null}

      {status === "ready" && hasData && totals ? (
        <>
          {/* Share card preview — the export draws this design to canvas. */}
          <div
            ref={cardRef}
            className="bg-surface flex flex-col gap-4 rounded-3xl p-8"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="flex flex-col gap-1">
                <Typography type="h4">
                  {copy.share.cardTitle.replace("{year}", String(year))}
                </Typography>
                <Typography color="muted" type="body-xs">
                  {copy.share.cardCaption}
                </Typography>
              </div>
              <div className="flex flex-col items-end gap-1">
                <Typography className="text-accent" type="h3" weight="bold">
                  {formatTokens(totals.total_tokens)}
                </Typography>
                <Typography color="muted" type="body-xs">
                  {copy.cards.totalTokens}
                </Typography>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {[
                [copy.cards.cost, formatCost(totals.total_cost_usd)],
                [copy.cards.conversations, formatNumber(totals.conversations)],
                [copy.cards.activeDays, formatNumber(totals.active_days)],
              ].map(([label, value]) => (
                <div key={label} className="bg-default rounded-3xl p-3">
                  <Typography color="muted" type="body-xs">
                    {label}
                  </Typography>
                  <Typography
                    className="tabular-nums"
                    type="body"
                    weight="semibold"
                  >
                    {value}
                  </Typography>
                </div>
              ))}
            </div>
            {highlights.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Typography color="muted" type="body-xs">
                  {copy.highlightsTitle}
                </Typography>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  {highlights.map(([label, value]) => (
                    <Typography key={label} color="muted" type="body-sm">
                      {`${label}: `}
                      <span className="text-foreground">{value}</span>
                    </Typography>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {stats.map((card) => (
              <Card key={card.key} className="gap-1 p-4">
                <Card.Header className="flex-row items-center justify-between gap-2">
                  <Card.Title className="text-muted text-xs font-normal">
                    {card.label}
                  </Card.Title>
                  <card.icon
                    aria-hidden="true"
                    className="text-accent/70 size-4"
                  />
                </Card.Header>
                <Card.Content>
                  <Typography
                    className="tabular-nums"
                    type="h4"
                    weight="semibold"
                  >
                    {card.value}
                  </Typography>
                </Card.Content>
              </Card>
            ))}
          </div>

          <Card className="p-6">
            <Card.Header>
              <Card.Title>{copy.monthlyTitle}</Card.Title>
            </Card.Header>
            <Card.Content>
              <TrendChart
                ariaLabel={`${year} ${copy.monthlyTitle}`}
                data={trendData}
                emptyLabel={copy.monthlyTitle}
                labels={{
                  tokens: copy.cards.totalTokens,
                  cost: copy.cards.cost,
                  conversations: copy.cards.conversations,
                  input: copy.trend.input,
                  cached: copy.trend.cached,
                  output: copy.trend.output,
                }}
                metric="tokens"
              />
            </Card.Content>
          </Card>

          {sources.length > 0 ? (
            <Card className="p-6">
              <Card.Header>
                <Card.Title>{copy.sourcesTitle}</Card.Title>
              </Card.Header>
              <Card.Content className="flex flex-col gap-3">
                {/* One stacked bar for the year's source mix, then a row per
                    source: brand logo, display label, volume and share. */}
                <div
                  aria-hidden="true"
                  className="flex h-2 w-full overflow-hidden rounded-full"
                >
                  {sources.map((entry, index) => (
                    <div
                      key={entry.source}
                      style={{
                        background: seriesColor(index),
                        width: `${
                          totalTokens > 0
                            ? (entry.total_tokens / totalTokens) * 100
                            : 0
                        }%`,
                      }}
                    />
                  ))}
                </div>
                {sources.map((entry, index) => {
                  const share =
                    totalTokens > 0 ? entry.total_tokens / totalTokens : 0;

                  return (
                    <div key={entry.source} className="flex flex-col gap-1">
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <SourceIcon label={entry.source} size={14} />
                          <span className="truncate font-medium">
                            {sourceDisplayLabel(entry.source)}
                          </span>
                        </span>
                        <span className="text-foreground/60 tabular-nums text-xs">
                          {formatTokens(entry.total_tokens)} ·{" "}
                          {formatPercent(share)} ·{" "}
                          {formatCost(entry.total_cost_usd)}
                        </span>
                      </div>
                      <div
                        aria-hidden="true"
                        className="bg-default h-1.5 w-full overflow-hidden rounded-full"
                      >
                        <div
                          className="h-full rounded-full"
                          style={{
                            background: seriesColor(index),
                            width: `${share * 100}%`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </Card.Content>
            </Card>
          ) : null}

          {models.length > 0 ? (
            <Card className="p-6">
              <Card.Header>
                <Card.Title>{copy.modelsTitle}</Card.Title>
              </Card.Header>
              <Card.Content>
                <Table>
                  <Table.ScrollContainer>
                    <Table.Content aria-label={copy.modelsTitle}>
                      <Table.Header>
                        <Table.Column isRowHeader>
                          {copy.table.model}
                        </Table.Column>
                        <Table.Column>{copy.table.tokens}</Table.Column>
                        <Table.Column>{copy.table.cost}</Table.Column>
                        <Table.Column>{copy.table.share}</Table.Column>
                      </Table.Header>
                      <Table.Body>
                        {models.map((entry) => {
                          const share =
                            totalTokens > 0
                              ? entry.total_tokens / totalTokens
                              : 0;

                          return (
                            <Table.Row key={entry.model} id={entry.model}>
                              <Table.Cell>
                                <span className="flex min-w-0 items-center gap-1.5">
                                  <SourceIcon label={entry.model} size={14} />
                                  <span className="truncate font-medium">
                                    {entry.model}
                                  </span>
                                </span>
                              </Table.Cell>
                              <Table.Cell className="whitespace-nowrap tabular-nums">
                                {formatTokens(entry.total_tokens)}
                              </Table.Cell>
                              <Table.Cell className="whitespace-nowrap tabular-nums">
                                {formatCost(entry.total_cost_usd)}
                              </Table.Cell>
                              <Table.Cell>
                                <div className="flex items-center gap-2">
                                  <Meter
                                    aria-label={`${entry.model} ${formatPercent(share)}`}
                                    className="w-24 shrink-0"
                                    value={share * 100}
                                  >
                                    <Meter.Track className="h-1.5">
                                      <Meter.Fill className="bg-accent" />
                                    </Meter.Track>
                                  </Meter>
                                  <span className="text-foreground/60 tabular-nums text-xs">
                                    {formatPercent(share)}
                                  </span>
                                </div>
                              </Table.Cell>
                            </Table.Row>
                          );
                        })}
                      </Table.Body>
                    </Table.Content>
                  </Table.ScrollContainer>
                </Table>
              </Card.Content>
            </Card>
          ) : null}
        </>
      ) : null}
    </main>
  );
}
