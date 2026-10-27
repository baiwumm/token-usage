"use client";

// Sortable + paginated detail table for the dashboard's daily / hourly /
// monthly views (docs/ui-spec.md 仪表盘 6). Server data is already bucketed;
// this component only sorts the current window and pages it 10 rows at a time.

import type { DashboardCopy } from "@/lib/copy/dashboard";

import { Table, Typography, type SortDescriptor } from "@heroui/react";
import { memo, useMemo, useState } from "react";

import { ModelListModal } from "./model-list-modal";

import { TablePagination } from "@/components/table-pagination";
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
  /** Tokens per model name for the bucket; powers the count-column modal. */
  modelTokens: Record<string, number>;
}

const DEFAULT_PAGE_SIZE = 10;

// Memoized: detail rows only change when their view's request settles; the
// dashboard's per-request slot updates then skip this table entirely.
function DetailTableImpl({
  rows,
  copy,
  locale,
}: {
  rows: DetailRow[];
  copy: DashboardCopy;
  locale: "zh" | "en";
}) {
  const { formatTokens, formatCost, formatNumber } = useFormat();
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

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  if (rows.length === 0) {
    return (
      <Typography color="muted" type="body-sm">
        {copy.detail.empty}
      </Typography>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Table>
        <Table.ScrollContainer>
          <Table.Content
            aria-label={copy.detail.title}
            sortDescriptor={sortDescriptor}
            onSortChange={(descriptor) => {
              setSortDescriptor(descriptor);
              setPage(1);
            }}
          >
            <Table.Header>
              <Table.Column allowsSorting isRowHeader id="time">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnTime}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="tokens">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnTokens}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="input">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnInput}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="cached">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnCached}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>

              <Table.Column allowsSorting id="output">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnOutput}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="billable">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnBillable}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="cost">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnCost}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="conversations">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnConversations}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
              <Table.Column allowsSorting id="models">
                {({ sortDirection }) => (
                  <Table.SortableColumnHeader sortDirection={sortDirection}>
                    {copy.detail.columnModels}
                  </Table.SortableColumnHeader>
                )}
              </Table.Column>
            </Table.Header>
            <Table.Body>
              {visible.map((row) => (
                <Table.Row key={row.id} id={row.id}>
                  <Table.Cell className="font-medium">{row.time}</Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatTokens(row.tokens)}
                  </Table.Cell>
                  <Table.Cell className="text-foreground/70 tabular-nums">
                    {formatTokens(row.input)}
                  </Table.Cell>
                  <Table.Cell className="text-foreground/70 tabular-nums">
                    {formatTokens(row.cached)}
                  </Table.Cell>

                  <Table.Cell className="text-foreground/70 tabular-nums">
                    {formatTokens(row.output)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatTokens(row.billable)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatCost(row.cost)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatNumber(row.conversations)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {Object.keys(row.modelTokens).length > 0 ? (
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
                    )}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

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

      <TablePagination
        labels={copy.detail}
        locale={locale}
        page={currentPage}
        pageSize={pageSize}
        total={sorted.length}
        onPageChange={setPage}
        onPageSizeChange={(next) => {
          setPageSize(next);
          setPage(1);
        }}
      />
    </div>
  );
}

export const DetailTable = memo(DetailTableImpl);
