"use client";

// Sortable, client-paged detail card for the dashboard's daily / hourly /
// monthly views (docs/ui-spec.md 仪表盘 7). Server data is already bucketed;
// this card sorts the current window and pages it 10 rows at a time, while the
// shared DataTableCard owns the shell, pagination and the three states.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { LoadStatus } from "@/lib/loadable";
import type { CalendarDate } from "@internationalized/date";
import type { Key, SortDescriptor } from "@heroui/react";

import {
  Calendar,
  DateField,
  DatePicker,
  Tabs,
  Typography,
} from "@heroui/react";
import { parseDate } from "@internationalized/date";
import { memo, useMemo, useState } from "react";

import { ModelListModal } from "./model-list-modal";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { useFormat } from "@/lib/format/format";

export interface DetailRow {
  id: string;
  time: string;
  tokens: number;
  input: number;
  cached: number;
  output: number;
  billable: number;
  cost: number;
  conversations: number;
  models: number;
  /**
   * Vendor credits for the bucket (docs/cli-contract.md §2.4) — display-only,
   * never merged into the token columns. Rows without credit-based providers
   * carry 0 and render as an em dash.
   */
  credits: number;
  /** Tokens per model name for the bucket; powers the count-column modal. */
  modelTokens: Record<string, number>;
}

export type DetailView = "daily" | "hourly" | "monthly";

const DEFAULT_PAGE_SIZE = 10;

// Memoized: detail rows only change when their view's request settles; the
// dashboard's per-request slot updates then skip this table entirely.
function DetailTableImpl({
  rows,
  copy,
  locale,
  status,
  refreshing,
  onRetry,
  detailView,
  onDetailViewChange,
  hourlyDay,
  onHourlyDayChange,
  rangePickerMax,
}: {
  rows: DetailRow[];
  copy: DashboardCopy;
  locale: "zh" | "en";
  status: LoadStatus;
  refreshing: boolean;
  onRetry: () => void;
  detailView: DetailView;
  onDetailViewChange: (view: DetailView) => void;
  hourlyDay: string;
  onHourlyDayChange: (day: string) => void;
  rangePickerMax: CalendarDate;
}) {
  const { formatTokens, formatCost, formatNumber, formatCredits } = useFormat();
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "time",
    direction: "descending",
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [modelsRow, setModelsRow] = useState<DetailRow | null>(null);

  const sorted = useMemo(() => {
    const column = sortDescriptor.column as keyof DetailRow;
    const direction = sortDescriptor.direction === "descending" ? -1 : 1;

    return [...rows].sort((first, second) => {
      if (column === "time") {
        // Sort by the raw bucket key (day / hour / month); the rendered time
        // is locale-formatted and does not compare chronologically.
        return first.id.localeCompare(second.id) * direction;
      }
      const left = Number(first[column] ?? 0);
      const right = Number(second[column] ?? 0);

      return (left - right) * direction;
    });
  }, [rows, sortDescriptor]);

  // The credits column only appears when the window actually has credit-based
  // usage (docs/ui-spec.md: no cost data → no cost column, same pattern).
  const showCredits = useMemo(
    () => rows.some((row) => row.credits > 0),
    [rows],
  );

  const columns = useMemo<DataTableColumn<DetailRow>[]>(
    () => [
      {
        id: "time",
        header: copy.detail.columnTime,
        sortable: true,
        className: "font-medium",
        cell: (row) => row.time,
      },
      {
        id: "tokens",
        header: copy.detail.columnTokens,
        sortable: true,
        className: "tabular-nums",
        cell: (row) => formatTokens(row.tokens),
      },
      {
        id: "input",
        header: copy.detail.columnInput,
        sortable: true,
        className: "text-foreground/70 tabular-nums",
        cell: (row) => formatTokens(row.input),
      },
      {
        id: "cached",
        header: copy.detail.columnCached,
        sortable: true,
        className: "text-foreground/70 tabular-nums",
        cell: (row) => formatTokens(row.cached),
      },
      {
        id: "output",
        header: copy.detail.columnOutput,
        sortable: true,
        className: "text-foreground/70 tabular-nums",
        cell: (row) => formatTokens(row.output),
      },
      {
        id: "billable",
        header: copy.detail.columnBillable,
        sortable: true,
        className: "tabular-nums",
        cell: (row) => formatTokens(row.billable),
      },
      {
        id: "cost",
        header: copy.detail.columnCost,
        sortable: true,
        className: "tabular-nums",
        cell: (row) => formatCost(row.cost),
      },
      {
        id: "conversations",
        header: copy.detail.columnConversations,
        sortable: true,
        className: "tabular-nums",
        cell: (row) => formatNumber(row.conversations),
      },
      {
        id: "models",
        header: copy.detail.columnModels,
        sortable: true,
        className: "tabular-nums",
        cell: (row) =>
          Object.keys(row.modelTokens).length > 0 ? (
            <button
              aria-label={copy.detail.viewModels}
              className="cursor-pointer underline-offset-2 hover:text-accent hover:underline"
              type="button"
              onClick={() => setModelsRow(row)}
            >
              {formatNumber(row.models)}
            </button>
          ) : (
            formatNumber(row.models)
          ),
      },
      ...(showCredits
        ? [
            {
              id: "credits",
              header: copy.detail.columnCredits,
              sortable: true,
              className: "tabular-nums",
              cell: (row: DetailRow) =>
                row.credits > 0 ? formatCredits(row.credits) : "—",
            } satisfies DataTableColumn<DetailRow>,
          ]
        : []),
    ],
    [copy, formatCost, formatNumber, formatTokens, formatCredits, showCredits],
  );

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  return (
    <>
      <DataTableCard
        className="p-6"
        columns={columns}
        empty={
          <Typography color="muted" type="body-sm">
            {copy.detail.empty}
          </Typography>
        }
        error={{
          message: copy.detail.loadError,
          onRetry,
          retryLabel: copy.detail.retry,
        }}
        extra={
          <>
            {detailView === "hourly" ? (
              <DatePicker
                aria-label={copy.detail.dayLabel}
                className="w-40"
                maxValue={rangePickerMax}
                value={parseDate(hourlyDay)}
                onChange={(value) => {
                  if (value && value.compare(rangePickerMax) <= 0) {
                    onHourlyDayChange(value.toString());
                  }
                }}
              >
                <DateField.Group
                  fullWidth
                  className="rounded-3xl h-8"
                  variant="secondary"
                >
                  <DateField.Input>
                    {(segment) => <DateField.Segment segment={segment} />}
                  </DateField.Input>
                  <DateField.Suffix>
                    <DatePicker.Trigger>
                      <DatePicker.TriggerIndicator />
                    </DatePicker.Trigger>
                  </DateField.Suffix>
                </DateField.Group>
                <DatePicker.Popover>
                  <Calendar
                    aria-label={copy.detail.dayLabel}
                    maxValue={rangePickerMax}
                  >
                    <Calendar.Header>
                      <Calendar.YearPickerTrigger>
                        <Calendar.YearPickerTriggerHeading />
                        <Calendar.YearPickerTriggerIndicator />
                      </Calendar.YearPickerTrigger>
                      <Calendar.NavButton slot="previous" />
                      <Calendar.NavButton slot="next" />
                    </Calendar.Header>
                    <Calendar.Grid>
                      <Calendar.GridHeader>
                        {(day) => (
                          <Calendar.HeaderCell>{day}</Calendar.HeaderCell>
                        )}
                      </Calendar.GridHeader>
                      <Calendar.GridBody>
                        {(date) => <Calendar.Cell date={date} />}
                      </Calendar.GridBody>
                    </Calendar.Grid>
                    <Calendar.YearPickerGrid>
                      <Calendar.YearPickerGridBody>
                        {({ year }) => <Calendar.YearPickerCell year={year} />}
                      </Calendar.YearPickerGridBody>
                    </Calendar.YearPickerGrid>
                  </Calendar>
                </DatePicker.Popover>
              </DatePicker>
            ) : null}
            <Tabs
              selectedKey={detailView}
              onSelectionChange={(key: Key) =>
                onDetailViewChange(String(key) as DetailView)
              }
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label={copy.detail.title} className="p-0.5">
                  <Tabs.Tab className="h-7 min-w-12 px-2.5 text-xs" id="daily">
                    {copy.detail.daily}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab className="h-7 min-w-12 px-2.5 text-xs" id="hourly">
                    {copy.detail.hourly}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                  <Tabs.Tab
                    className="h-7 min-w-12 px-2.5 text-xs"
                    id="monthly"
                  >
                    {copy.detail.monthly}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          </>
        }
        pagination={{
          labels: copy.detail,
          locale,
          page: currentPage,
          pageSize,
          total: sorted.length,
          onPageChange: setPage,
          onPageSizeChange: (next) => {
            setPageSize(next);
            setPage(1);
          },
        }}
        refreshing={refreshing}
        rowKey={(row) => row.id}
        rows={visible}
        sort={{
          descriptor: sortDescriptor,
          onChange: (descriptor) => {
            setSortDescriptor(descriptor);
            setPage(1);
          },
        }}
        status={status}
        tableLabel={copy.detail.title}
        title={copy.detail.title}
      />

      <ModelListModal
        copy={copy}
        open={modelsRow != null}
        rows={
          modelsRow
            ? Object.entries(modelsRow.modelTokens).map(([model, tokens]) => ({
                model,
                tokens,
              }))
            : []
        }
        title={modelsRow?.time ?? ""}
        onOpenChange={(open) => {
          if (!open) setModelsRow(null);
        }}
      />
    </>
  );
}

export const DetailTable = memo(DetailTableImpl);
