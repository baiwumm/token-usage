"use client";

// Summary cards, heatmap grid, and the model/source/device panels. Pure
// presentational pieces fed by the dashboard payload (docs/cli-contract.md
// §2.10 / §2.7 shapes).

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type {
  DashboardDay,
  DashboardDevice,
  DashboardModel,
  DashboardSource,
  DashboardTotals,
  HeatmapPayload,
} from "@/lib/dashboard/api";

import { ChartColumn, Clock, ListCheck, Wallet } from "@gravity-ui/icons";
import dynamic from "next/dynamic";
import { Card, Chip, Table, Typography } from "@heroui/react";

import { DonutChart, seriesColor, Sparkline } from "./mini-charts";

// number-flow is a custom element; loading it client-only avoids its style
// handling during static prerendering (React 19 + custom element quirk).
const NumberFlow = dynamic(() => import("@number-flow/react"), { ssr: false });

export function formatTokens(value: number): string {
  return value.toLocaleString("en-US");
}

export function formatCost(value: number): string {
  return `$${value.toFixed(4)}`;
}

function formatRelativeDay(iso: string | null, never: string): string {
  if (!iso) return never;
  const day = iso.slice(0, 10);

  return day;
}

const CARD_ICONS = {
  totalTokens: ChartColumn,
  billableTokens: ChartColumn,
  cost: Wallet,
  conversations: ListCheck,
  activeDays: Clock,
} as const;

export function TotalsCards({
  totals,
  allTime,
  daily,
  copy,
}: {
  totals: DashboardTotals;
  allTime: DashboardTotals;
  daily: DashboardDay[];
  copy: DashboardCopy;
}) {
  // Last 14 days as the mini trend per card.
  const trend = daily.slice(-14).map((day) => ({
    label: day.date,
    value: day.total_tokens,
  }));
  const costTrend = daily.slice(-14).map((day) => ({
    label: day.date,
    value: day.total_cost_usd,
  }));

  const cards: Array<{
    label: string;
    icon: (typeof CARD_ICONS)[keyof typeof CARD_ICONS];
    value: React.ReactElement;
    sub?: string;
    spark?: Array<{ label: string; value: number }>;
  }> = [
    {
      label: copy.cards.totalTokens,
      icon: CARD_ICONS.totalTokens,
      value: <NumberFlow value={totals.total_tokens} />,
      sub: `${copy.cards.allTimeSuffix} ${formatTokens(allTime.total_tokens)}`,
      spark: trend,
    },
    {
      label: copy.cards.billableTokens,
      icon: CARD_ICONS.billableTokens,
      value: <NumberFlow value={totals.billable_total_tokens} />,
    },
    {
      label: copy.cards.cost,
      icon: CARD_ICONS.cost,
      value: (
        <NumberFlow
          format={{ style: "currency", currency: "USD" }}
          value={totals.total_cost_usd}
        />
      ),
      sub: `${copy.cards.allTimeSuffix} ${formatCost(allTime.total_cost_usd)}`,
      spark: costTrend,
    },
    {
      label: copy.cards.conversations,
      icon: CARD_ICONS.conversations,
      value: <NumberFlow value={totals.conversations} />,
    },
    {
      label: copy.cards.activeDays,
      icon: CARD_ICONS.activeDays,
      value: <NumberFlow value={totals.active_days} />,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="gap-1 p-4">
          <div className="flex items-center justify-between">
            <Typography color="muted" type="body-xs">
              {card.label}
            </Typography>
            <card.icon aria-hidden="true" className="text-primary/70 size-4" />
          </div>
          <Typography className="tabular-nums" type="h4" weight="semibold">
            {card.value}
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
        </Card>
      ))}
    </div>
  );
}

const HEATMAP_LEVELS = [
  "bg-content3",
  "bg-primary/25",
  "bg-primary/45",
  "bg-primary/70",
  "bg-primary",
] as const;

// The wire's weeks are 7-consecutive-day slices anchored at `from`, not
// weekday-aligned. Padding the head so the first cell sits on its own
// weekday (mon-start) restores a GitHub-style grid whose last column ends
// at `to`.
export function alignHeatmapWeeks(
  payload: HeatmapPayload,
): Array<Array<{ day: string | null; level: number; total_tokens: number }>> {
  const flat = payload.weeks.flat();
  const first = flat[0]?.day;
  // getUTCDay(): 0=Sun..6=Sat → mon-start index = (day + 6) % 7
  const pad =
    first != null ? (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7 : 0;
  const columns: Array<
    Array<{ day: string | null; level: number; total_tokens: number }>
  > = [];
  let row = 0;
  let col: Array<{ day: string | null; level: number; total_tokens: number }> =
    [];

  for (let index = 0; index < pad; index++) {
    col.push({ day: null, level: 0, total_tokens: 0 });
  }
  for (const cell of flat) {
    col.push({
      day: cell.day,
      level: cell.level,
      total_tokens: cell.total_tokens,
    });
    row += 1;
    if (row === 7) {
      columns.push(col);
      col = [];
      row = 0;
    }
  }
  if (col.length > 0) {
    while (col.length < 7) col.push({ day: null, level: 0, total_tokens: 0 });
    columns.push(col);
  }

  return columns;
}

export function Heatmap({
  payload,
  title,
  months,
  locale = "zh",
}: {
  payload: HeatmapPayload;
  title: string;
  months: string;
  locale?: "zh" | "en";
}) {
  const columns = alignHeatmapWeeks(payload);

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>
          {title}
          <Typography className="ml-2 inline" color="muted" type="body-xs">
            {months}
          </Typography>
        </Card.Title>
        <Card.Description>
          {payload.active_days} active days ·{" "}
          {formatCost(payload.total_cost_usd)}
        </Card.Description>
      </Card.Header>
      <Card.Content className="gap-3">
        <div className="flex gap-[3px] overflow-x-auto pb-1">
          {columns.map((column, columnIndex) => (
            <div key={columnIndex} className="flex flex-col gap-[3px]">
              {column.map((cell, cellIndex) => (
                <div
                  key={cellIndex}
                  className={`size-3 rounded-[3px] ${cell.day ? (HEATMAP_LEVELS[cell.level] ?? HEATMAP_LEVELS[0]) : "bg-transparent"}`}
                  title={
                    cell.day
                      ? `${cell.day} · ${formatTokens(cell.total_tokens)}`
                      : ""
                  }
                />
              ))}
            </div>
          ))}
        </div>
        <div className="text-foreground/50 flex items-center justify-end gap-1.5 text-xs">
          <span>{locale === "zh" ? "少" : "less"}</span>
          {HEATMAP_LEVELS.map((className) => (
            <div
              key={className}
              className={`size-3 rounded-[3px] ${className}`}
            />
          ))}
          <span>{locale === "zh" ? "多" : "more"}</span>
        </div>
      </Card.Content>
    </Card>
  );
}

export function ModelPanel({
  models,
  copy,
}: {
  models: DashboardModel[];
  copy: DashboardCopy;
}) {
  const max = Math.max(1, ...models.map((entry) => entry.total_tokens));

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.panels.modelsTitle}</Card.Title>
      </Card.Header>
      <Card.Content className="flex flex-col gap-2">
        {models.length === 0 ? (
          <Typography color="muted" type="body-sm">
            —
          </Typography>
        ) : (
          models.map((entry) => (
            <div key={entry.model} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2 text-sm">
                <span className="truncate font-medium">{entry.model}</span>
                <span className="text-foreground/60 tabular-nums text-xs">
                  {formatTokens(entry.total_tokens)} ·{" "}
                  {formatCost(entry.total_cost_usd)}
                </span>
              </div>
              <div className="bg-content3 h-1.5 rounded-full">
                <div
                  className="bg-primary h-1.5 rounded-full"
                  style={{
                    width: `${Math.max(2, (entry.total_tokens / max) * 100)}%`,
                  }}
                />
              </div>
            </div>
          ))
        )}
      </Card.Content>
    </Card>
  );
}

export function SourcePanel({
  sources,
  copy,
}: {
  sources: DashboardSource[];
  copy: DashboardCopy;
}) {
  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.panels.sourcesTitle}</Card.Title>
      </Card.Header>
      <Card.Content className="flex items-center gap-5">
        {sources.length === 0 ? (
          <Typography color="muted" type="body-sm">
            —
          </Typography>
        ) : (
          <>
            <DonutChart
              centerLabel="Tokens"
              centerValue={formatTokens(
                sources.reduce((acc, entry) => acc + entry.total_tokens, 0),
              )}
              entries={sources.map((entry) => ({
                name: entry.source,
                value: entry.total_tokens,
              }))}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {sources.map((entry, index) => (
                <div
                  key={entry.source}
                  className="flex items-center justify-between gap-2 text-sm"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-full"
                      style={{ background: seriesColor(index) }}
                    />
                    <span className="truncate">{entry.source}</span>
                  </span>
                  <span className="text-foreground/60 tabular-nums text-xs">
                    {formatTokens(entry.total_tokens)}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </Card.Content>
      <Card.Content>
        <Typography color="muted" type="body-xs">
          {copy.panels.sharedNote}
        </Typography>
      </Card.Content>
    </Card>
  );
}

export function DevicePanel({
  devices,
  copy,
}: {
  devices: DashboardDevice[];
  copy: DashboardCopy;
}) {
  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.panels.devicesTitle}</Card.Title>
        <Card.Description>{copy.panels.devicesHint}</Card.Description>
      </Card.Header>
      <Card.Content>
        <Table>
          <Table.ScrollContainer>
            <Table.Content aria-label={copy.panels.devicesTitle}>
              <Table.Header>
                <Table.Column isRowHeader>
                  {copy.panels.columnDevice}
                </Table.Column>
                <Table.Column>{copy.panels.columnStatus}</Table.Column>
                <Table.Column>{copy.panels.columnLastUsed}</Table.Column>
                <Table.Column>{copy.panels.columnTokens}</Table.Column>
              </Table.Header>
              <Table.Body>
                {devices.map((device) => (
                  <Table.Row key={device.device_id}>
                    <Table.Cell className="font-medium">
                      {device.device_name}
                      <span className="text-foreground/40 ml-2 text-xs">
                        {device.platform}
                      </span>
                    </Table.Cell>
                    <Table.Cell>
                      <Chip
                        color={device.active ? "success" : "danger"}
                        size="sm"
                        variant="soft"
                      >
                        {device.active
                          ? copy.panels.statusActive
                          : copy.panels.statusRevoked}
                      </Chip>
                    </Table.Cell>
                    <Table.Cell>
                      {formatRelativeDay(
                        device.last_used_at,
                        copy.panels.never,
                      )}
                    </Table.Cell>
                    <Table.Cell className="tabular-nums">
                      {formatTokens(device.total_tokens)}
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Content>
          </Table.ScrollContainer>
        </Table>
      </Card.Content>
    </Card>
  );
}
