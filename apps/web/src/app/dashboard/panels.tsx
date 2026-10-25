"use client";

// Summary cards, heatmap grid, and the model/source/device panels. Pure
// presentational pieces fed by the dashboard payload and account series
// (docs/cli-contract.md §2.6 / §2.7 / §2.10).

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type {
  AccountSummary,
  DashboardDay,
  DashboardDevice,
  DashboardTotals,
  ModelBreakdownModel,
  ModelBreakdownSource,
} from "@/lib/dashboard/api";

import {
  ChartColumn,
  CircleInfo,
  Clock,
  Layers,
  ListCheck,
  ListUl,
  Wallet,
} from "@gravity-ui/icons";
import { Button, Card, Chip, Meter, Tooltip, Typography } from "@heroui/react";
import { useMemo } from "react";

import { DonutChart, seriesColor, Sparkline } from "./mini-charts";
import { SourceIcon } from "./source-icon";

import { FlowNumber } from "@/components/flow-number";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

const CARD_ICONS = {
  billableTokens: ChartColumn,
  cost: Wallet,
  conversations: ListCheck,
  activeDays: Clock,
} as const;

/**
 * Hero card for the range's total tokens (docs/ui-spec.md 仪表盘): big centered
 * count, approximate cost with an unpriced-models note, the range window, a
 * source-share stacked bar and one share chip per source.
 */
export function TotalTokensHero({
  summary,
  breakdown,
  copy,
  locale,
  fromDay,
  toDay,
}: {
  summary: AccountSummary;
  breakdown: ModelBreakdownSource[];
  copy: DashboardCopy;
  locale: "zh" | "en";
  fromDay: string;
  toDay: string;
}) {
  const { formatTokens, formatCost, formatPercent, formatDate } = useFormat();

  const sources = useMemo(
    () =>
      [...breakdown].sort(
        (first, second) =>
          second.totals.total_tokens - first.totals.total_tokens,
      ),
    [breakdown],
  );
  const totalTokens = summary.totals.total_tokens;
  const hasUnpriced = sources.some((source) =>
    source.models.some((model) => model.pricing.status === "unpriced"),
  );
  const totalModels = sources.reduce(
    (sum, source) => sum + source.models.length,
    0,
  );

  return (
    <Card className="p-6">
      <Card.Content className="flex flex-col items-center gap-3">
        <Typography color="muted" type="body-xs">
          {copy.cards.totalTokens}
        </Typography>
        <Typography className="tabular-nums" type="h1" weight="bold">
          <FlowNumber text={formatTokens(totalTokens)} />
        </Typography>
        <div className="flex items-center gap-1.5">
          <Typography className="text-success tabular-nums" type="body-sm">
            {hasUnpriced ? "≥ " : ""}
            <FlowNumber text={formatCost(summary.totals.total_cost_usd)} />
          </Typography>
          <Tooltip>
            <Button
              aria-label={copy.cards.heroCostNote}
              className="size-5 p-0"
              size="sm"
              variant="ghost"
            >
              <CircleInfo aria-hidden="true" className="text-muted size-3.5" />
            </Button>
            <Tooltip.Content showArrow placement="bottom">
              {copy.cards.heroCostNote}
            </Tooltip.Content>
          </Tooltip>
        </div>
        {hasUnpriced ? (
          <Typography color="muted" type="body-xs">
            {copy.cards.heroCostApprox}
          </Typography>
        ) : (
          <Typography color="muted" type="body-xs">
            {copy.cards.heroCostNote}
          </Typography>
        )}
        <Typography color="muted" type="body-xs">
          {formatDate(`${fromDay}T12:00:00Z`, { dateStyle: "medium" })} —{" "}
          {formatDate(`${toDay}T12:00:00Z`, { dateStyle: "medium" })}
        </Typography>

        {sources.length > 0 ? (
          <>
            <div
              aria-hidden="true"
              className="flex h-2 w-full overflow-hidden rounded-full"
            >
              {sources.map((source, index) => (
                <div
                  key={source.source}
                  style={{
                    background: seriesColor(index),
                    width: `${
                      totalTokens > 0
                        ? (source.totals.total_tokens / totalTokens) * 100
                        : 0
                    }%`,
                  }}
                />
              ))}
            </div>
            <div className="grid w-full grid-cols-2 gap-2 pt-2 sm:grid-cols-4 lg:grid-cols-6">
              <div className="border-border/60 flex flex-col gap-1 rounded-xl border p-3">
                <span className="text-muted flex items-center gap-1.5 text-xs font-medium">
                  <Layers
                    aria-hidden="true"
                    className="text-muted size-3.5 shrink-0"
                  />
                  {copy.cards.heroAll}
                </span>
                <span className="tabular-nums text-sm font-semibold">
                  {formatPercent(totalTokens > 0 ? 1 : 0)}
                </span>
                <span className="text-muted text-xs">
                  {formatMessage(copy.cards.heroModelsCount, locale, {
                    count: totalModels,
                  })}
                </span>
              </div>
              {sources.map((source, index) => (
                <div
                  key={source.source}
                  className="border-border/60 flex flex-col gap-1 rounded-xl border p-3"
                >
                  <span className="text-muted flex min-w-0 items-center gap-1.5 text-xs font-medium">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: seriesColor(index) }}
                    />
                    <span className="truncate">{source.source}</span>
                  </span>
                  <span className="tabular-nums text-sm font-semibold">
                    {formatPercent(
                      totalTokens > 0
                        ? source.totals.total_tokens / totalTokens
                        : 0,
                    )}
                  </span>
                  <span className="text-muted text-xs">
                    {formatMessage(copy.cards.heroModelsCount, locale, {
                      count: source.models.length,
                    })}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </Card.Content>
    </Card>
  );
}

export function KpiCards({
  summary,
  allTime,
  daily,
  copy,
  onOpenCost,
}: {
  summary: AccountSummary;
  allTime: DashboardTotals | null;
  daily: DashboardDay[];
  copy: DashboardCopy;
  onOpenCost: () => void;
}) {
  const { formatTokens, formatCost, formatNumber } = useFormat();
  const costTrend = daily.slice(-14).map((day) => ({
    label: day.date,
    value: day.total_cost_usd,
  }));

  const cards: Array<{
    key: string;
    label: string;
    icon: (typeof CARD_ICONS)[keyof typeof CARD_ICONS];
    value: string;
    sub?: string;
    spark?: Array<{ label: string; value: number }>;
    action?: () => void;
  }> = [
    {
      key: "billable",
      label: copy.cards.billableTokens,
      icon: CARD_ICONS.billableTokens,
      value: formatTokens(summary.totals.billable_total_tokens),
    },
    {
      key: "cost",
      label: copy.cards.cost,
      icon: CARD_ICONS.cost,
      value: formatCost(summary.totals.total_cost_usd),
      sub: allTime
        ? `${copy.cards.allTimeSuffix} ${formatCost(allTime.total_cost_usd)}`
        : undefined,
      spark: costTrend,
      action: onOpenCost,
    },
    {
      key: "conversations",
      label: copy.cards.conversations,
      icon: CARD_ICONS.conversations,
      value: formatNumber(summary.totals.conversation_count),
    },
    {
      key: "days",
      label: copy.cards.activeDays,
      icon: CARD_ICONS.activeDays,
      value: formatNumber(summary.days),
    },
  ];

  const rolling = [
    {
      key: "rolling-7d",
      label: copy.cards.rolling7d,
      value: formatTokens(summary.rolling.last_7d.totals.billable_total_tokens),
      sub: `${formatNumber(summary.rolling.last_7d.totals.conversation_count)} · ${formatNumber(summary.rolling.last_7d.active_days)} ${copy.cards.activeDays}`,
    },
    {
      key: "rolling-30d",
      label: copy.cards.rolling30d,
      value: formatTokens(
        summary.rolling.last_30d.totals.billable_total_tokens,
      ),
      sub: `${formatNumber(summary.rolling.last_30d.totals.conversation_count)} · ${formatNumber(summary.rolling.last_30d.active_days)} ${copy.cards.activeDays}`,
    },
    {
      key: "avg",
      label: copy.cards.avgPerActiveDay,
      value: formatTokens(summary.rolling.last_30d.avg_per_active_day ?? 0),
      sub: copy.cards.perActiveDay,
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.key} className="gap-1 p-4">
            <Card.Header className="flex-row items-center justify-between gap-2">
              <Card.Title className="text-muted text-xs font-normal">
                {card.label}
              </Card.Title>
              <card.icon aria-hidden="true" className="text-accent/70 size-4" />
            </Card.Header>
            <Card.Content className="gap-1">
              <Typography className="tabular-nums" type="h4" weight="semibold">
                <FlowNumber text={card.value} />
              </Typography>
              <div className="flex items-end justify-between gap-2">
                {card.sub ? (
                  <Typography color="muted" type="body-xs">
                    {card.sub}
                  </Typography>
                ) : (
                  <span />
                )}
                {card.spark ? <Sparkline values={card.spark} /> : null}
              </div>
              {card.action ? (
                <Button
                  className="text-muted -ml-2 h-7 justify-start px-2 text-xs"
                  size="sm"
                  variant="ghost"
                  onPress={card.action}
                >
                  {copy.cards.openCostAnalysis}
                </Button>
              ) : null}
            </Card.Content>
          </Card>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {rolling.map((card) => (
          <Card key={card.key} className="gap-1 p-4">
            <Card.Header className="flex-row items-center justify-between gap-2">
              <Card.Title className="text-muted text-xs font-normal">
                {card.label}
              </Card.Title>
              <Typography color="muted" type="body-xs">
                {copy.cards.rollingHint}
              </Typography>
            </Card.Header>
            <Card.Content className="gap-1">
              <Typography className="tabular-nums" type="h5" weight="semibold">
                <FlowNumber text={card.value} />
              </Typography>
              <Typography color="muted" type="body-xs">
                {card.sub}
              </Typography>
            </Card.Content>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function TopModels({
  models,
  copy,
  onViewAll,
}: {
  models: ModelBreakdownModel[];
  copy: DashboardCopy;
  onViewAll: () => void;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();
  const totalTokens = models.reduce(
    (sum, entry) => sum + entry.totals.total_tokens,
    0,
  );

  const top = useMemo(() => {
    // The input is a flat list across sources; the same model name can come
    // from several sources (e.g. step-5-preview on zcode and opencode).
    // Merge same-name rows so the list (and its React keys) stay unique.
    const byModel = new Map<string, ModelBreakdownModel>();

    for (const entry of models) {
      const prev = byModel.get(entry.model);

      if (!prev) {
        byModel.set(entry.model, entry);
        continue;
      }
      byModel.set(entry.model, {
        ...prev,
        totals: {
          ...prev.totals,
          total_tokens: prev.totals.total_tokens + entry.totals.total_tokens,
          billable_total_tokens:
            prev.totals.billable_total_tokens +
            entry.totals.billable_total_tokens,
          total_cost_usd: (
            Number(prev.totals.total_cost_usd) +
            Number(entry.totals.total_cost_usd)
          ).toFixed(6),
        },
      });
    }

    return [...byModel.values()]
      .sort((a, b) => b.totals.total_tokens - a.totals.total_tokens)
      .slice(0, 8);
  }, [models]);

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

export function SourcePanel({
  sources,
  copy,
}: {
  sources: ModelBreakdownSource[];
  copy: DashboardCopy;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();
  const totalTokens = sources.reduce(
    (sum, entry) => sum + entry.totals.total_tokens,
    0,
  );

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.panels.sourcesTitle}</Card.Title>
        <Card.Description>{copy.panels.sourcesHint}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        {sources.length === 0 ? (
          <Typography color="muted" type="body-sm">
            —
          </Typography>
        ) : (
          <>
            <DonutChart
              centerLabel={copy.cards.totalTokens}
              centerValue={formatTokens(totalTokens)}
              entries={sources.map((entry) => ({
                name: entry.source,
                value: entry.totals.total_tokens,
              }))}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {sources.map((entry) => (
                <div
                  key={entry.source}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <SourceIcon label={entry.source} size={14} />
                    <span className="truncate">{entry.source}</span>
                  </span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    {formatTokens(entry.totals.total_tokens)} ·{" "}
                    {formatPercent(
                      totalTokens > 0
                        ? entry.totals.total_tokens / totalTokens
                        : 0,
                    )}{" "}
                    · {formatCost(entry.totals.total_cost_usd)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card.Content>
      <Card.Footer>
        <Typography color="muted" type="body-xs">
          {copy.panels.sharedNote}
        </Typography>
      </Card.Footer>
    </Card>
  );
}

export function DevicePanel({
  devices,
  copy,
  selectedDeviceId,
  onSelectDevice,
}: {
  devices: DashboardDevice[];
  copy: DashboardCopy;
  selectedDeviceId: string | null;
  onSelectDevice: (deviceId: string | null) => void;
}) {
  const { formatTokens, formatCost, formatDate } = useFormat();
  const active = devices.filter((device) => device.active);

  return (
    <Card className="p-6">
      <Card.Header className="flex-row items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <Card.Title>{copy.panels.devicesTitle}</Card.Title>
          <Card.Description>{copy.panels.devicesHint}</Card.Description>
        </div>
        {selectedDeviceId ? (
          <Button
            size="sm"
            variant="ghost"
            onPress={() => onSelectDevice(null)}
          >
            {copy.clearFilters}
          </Button>
        ) : null}
      </Card.Header>
      <Card.Content className="flex flex-col gap-1">
        {active.length === 0 ? (
          <Typography color="muted" type="body-sm">
            —
          </Typography>
        ) : (
          active.map((device) => {
            const selected = device.device_id === selectedDeviceId;

            return (
              <Button
                key={device.device_id}
                aria-pressed={selected}
                className={`h-auto w-full justify-start rounded-xl px-3 py-2.5 text-start ${
                  selected ? "bg-default" : ""
                }`}
                variant="ghost"
                onPress={() =>
                  onSelectDevice(selected ? null : device.device_id)
                }
              >
                <span className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1">
                  <span className="flex min-w-0 items-center gap-2">
                    <ListUl
                      aria-hidden="true"
                      className="text-muted size-4 shrink-0"
                    />
                    <span className="truncate text-sm font-medium">
                      {device.device_name}
                    </span>
                    <Chip size="sm" variant="secondary">
                      {device.platform}
                    </Chip>
                    {selected ? (
                      <Chip color="accent" size="sm" variant="soft">
                        {copy.panels.selected}
                      </Chip>
                    ) : null}
                  </span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    <FlowNumber text={formatTokens(device.total_tokens)} /> ·{" "}
                    <FlowNumber text={formatCost(device.total_cost_usd)} />
                  </span>
                  <span className="text-muted col-span-2 text-xs">
                    {copy.panels.lastReport}:{" "}
                    {device.last_used_at || device.last_hour
                      ? formatDate(device.last_used_at ?? device.last_hour, {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })
                      : copy.panels.never}
                  </span>
                </span>
              </Button>
            );
          })
        )}
      </Card.Content>
    </Card>
  );
}
