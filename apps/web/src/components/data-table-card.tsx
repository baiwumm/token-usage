"use client";

// Shared card for paginated data lists (docs/ui-spec.md 三态与响应式): header
// with an optional right-hand slot, a declarative HeroUI table, the shared
// footer pagination, and the loading / empty / error states every data surface
// must design. `rows` is always the current page — the caller owns sorting and
// paging, because the list pages keep their offset in the URL while the
// dashboard pages its own window.

import type { SortDescriptor } from "@heroui/react";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/copy/locale-config";
import type { LoadStatus } from "@/lib/loadable";

import {
  Button,
  Card,
  Skeleton,
  Spinner,
  Table,
  Typography,
} from "@heroui/react";

import { SectionError } from "@/components/section-states";
import {
  TablePagination,
  type TablePaginationLabels,
} from "@/components/table-pagination";

export interface DataTableColumn<T> {
  id: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** Renders a sortable header; the card only reports the click. */
  sortable?: boolean;
  className?: string;
}

export interface DataTableCardPagination {
  labels: TablePaginationLabels;
  locale: Locale;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}

export interface DataTableCardError {
  message: string;
  retryLabel: string;
  onRetry: () => void;
}

export interface DataTableCardProps<T> {
  title: ReactNode;
  hint?: ReactNode;
  /** Right-hand header slot (date pickers, tabs, buttons); absent = no slot. */
  extra?: ReactNode;
  /** Table.Content aria-label (react-aria requires one). */
  tableLabel: string;
  columns: readonly DataTableColumn<T>[];
  /** Current page: the caller owns sorting and slicing. */
  rows: readonly T[];
  rowKey: (row: T) => string;
  status: LoadStatus;
  error?: DataTableCardError;
  /** Ready with no rows: the caller phrases its own empty state. */
  empty: ReactNode;
  loadingRows?: number;
  /** Refetch over existing rows: keep the data, blur it behind a spinner. */
  refreshing?: boolean;
  sort?: {
    descriptor: SortDescriptor;
    onChange: (descriptor: SortDescriptor) => void;
  };
  /** Swaps the table for cards below md. */
  renderMobileRow?: (row: T) => ReactNode;
  /** Row activation (react-aria Table.Row onAction). */
  onRowAction?: (row: T) => void;
  pagination?: DataTableCardPagination;
  /** Replaces the default shell padding (e.g. "p-6"). */
  className?: string;
}

const MOBILE_SKELETON_ROWS = 3;

export function DataTableCard<T>({
  title,
  hint,
  extra,
  tableLabel,
  columns,
  rows,
  rowKey,
  status,
  error,
  empty,
  loadingRows = 6,
  refreshing = false,
  sort,
  renderMobileRow,
  onRowAction,
  pagination,
  className,
}: DataTableCardProps<T>) {
  const hasRows = rows.length > 0;
  const showSkeleton = status === "loading" && !hasRows;
  const showEmpty = status === "ready" && !hasRows;
  const showError = status === "error" && !hasRows;
  const showBody = hasRows || showSkeleton;
  const showOverlay = hasRows && (refreshing || status === "loading");
  // A failed refetch keeps its rows on screen and only flags them as stale.
  const staleError = status === "error" && hasRows ? error : undefined;

  return (
    <Card className={className ?? "p-4 md:p-6"}>
      <Card.Header className="flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-col gap-1">
          <Card.Title>{title}</Card.Title>
          {hint ? (
            <Typography color="muted" type="body-xs">
              {hint}
            </Typography>
          ) : null}
        </div>
        {extra ? (
          <div className="flex flex-wrap items-end gap-2">{extra}</div>
        ) : null}
      </Card.Header>

      <Card.Content className="gap-4">
        {showError && error ? (
          <SectionError
            message={error.message}
            retry={error.onRetry}
            retryLabel={error.retryLabel}
          />
        ) : null}

        {showEmpty ? empty : null}

        {staleError ? (
          <div className="bg-danger-soft flex flex-wrap items-center justify-between gap-2 rounded-2xl px-3 py-2">
            <Typography className="text-danger" type="body-sm">
              {staleError.message}
            </Typography>
            <Button size="sm" variant="outline" onPress={staleError.onRetry}>
              {staleError.retryLabel}
            </Button>
          </div>
        ) : null}

        {showBody ? (
          <div className="relative">
            {showOverlay ? (
              <div
                aria-hidden="true"
                className="bg-surface/60 absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[2px]"
              >
                <Spinner size="sm" />
              </div>
            ) : null}

            <div className={renderMobileRow ? "hidden md:block" : undefined}>
              <Table>
                <Table.ScrollContainer>
                  <Table.Content
                    aria-label={tableLabel}
                    sortDescriptor={sort?.descriptor}
                    onSortChange={sort?.onChange}
                  >
                    <Table.Header>
                      {columns.map((column, index) => {
                        const sortable =
                          sort != null && column.sortable === true;

                        return (
                          <Table.Column
                            key={column.id}
                            allowsSorting={sortable}
                            id={column.id}
                            isRowHeader={index === 0}
                          >
                            {({ sortDirection }) =>
                              sortable ? (
                                <Table.SortableColumnHeader
                                  sortDirection={sortDirection}
                                >
                                  {column.header}
                                </Table.SortableColumnHeader>
                              ) : (
                                column.header
                              )
                            }
                          </Table.Column>
                        );
                      })}
                    </Table.Header>
                    <Table.Body>
                      {showSkeleton
                        ? Array.from({ length: loadingRows }, (_, rowIndex) => (
                            <Table.Row
                              key={`skeleton-${rowIndex}`}
                              id={`skeleton-${rowIndex}`}
                            >
                              {columns.map((column, columnIndex) => (
                                <Table.Cell key={column.id}>
                                  <Skeleton
                                    className="h-4 rounded-3xl"
                                    style={{
                                      width: columnIndex === 0 ? "55%" : "78%",
                                    }}
                                  />
                                </Table.Cell>
                              ))}
                            </Table.Row>
                          ))
                        : rows.map((row) => (
                            <Table.Row
                              key={rowKey(row)}
                              id={rowKey(row)}
                              onAction={
                                onRowAction ? () => onRowAction(row) : undefined
                              }
                            >
                              {columns.map((column) => (
                                <Table.Cell
                                  key={column.id}
                                  className={column.className}
                                >
                                  {column.cell(row)}
                                </Table.Cell>
                              ))}
                            </Table.Row>
                          ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </div>

            {renderMobileRow ? (
              <div className="flex flex-col gap-3 md:hidden">
                {showSkeleton
                  ? Array.from({ length: MOBILE_SKELETON_ROWS }, (_, index) => (
                      <Skeleton
                        key={`mobile-skeleton-${index}`}
                        className="h-28 w-full rounded-3xl"
                      />
                    ))
                  : rows.map((row) => (
                      <div key={rowKey(row)}>{renderMobileRow(row)}</div>
                    ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {pagination && hasRows ? <TablePagination {...pagination} /> : null}
      </Card.Content>
    </Card>
  );
}
