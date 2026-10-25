"use client";

// Sortable + paginated detail table for the dashboard's daily / hourly /
// monthly views (docs/ui-spec.md 仪表盘 6). Server data is already bucketed;
// this component only sorts the current window and pages it 20 rows at a time.

import type { DashboardCopy } from "@/lib/copy/dashboard";

import {
  Pagination,
  Table,
  Typography,
  type SortDescriptor,
} from "@heroui/react";
import { useMemo, useState } from "react";

import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

export interface DetailRow {
  id: string;
  time: string;
  tokens: number;
  input: number;
  cached: number;
  cacheCreation: number;
  output: number;
  billable: number;
  cost: number;
  conversations: number;
  models: number;
}

const PAGE_SIZE = 20;

function pageItems(
  page: number,
  totalPages: number,
): Array<number | "ellipsis"> {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const items: Array<number | "ellipsis"> = [1];

  if (page > 3) items.push("ellipsis");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  for (let value = start; value <= end; value += 1) items.push(value);
  if (page < totalPages - 2) items.push("ellipsis");
  items.push(totalPages);

  return items;
}

export function DetailTable({
  rows,
  copy,
  locale,
}: {
  rows: DetailRow[];
  copy: DashboardCopy;
  locale: "zh" | "en";
}) {
  const { formatTokensExact, formatCost, formatNumber } = useFormat();
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "time",
    direction: "descending",
  });
  const [page, setPage] = useState(1);

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

  // zcode/codex never report cache writes — hide the column when the whole
  // window is zero instead of shipping a dead column.
  const hasCacheCreation = rows.some((row) => row.cacheCreation > 0);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = sorted.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  );
  const start = sorted.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const end = Math.min(currentPage * PAGE_SIZE, sorted.length);

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
              {hasCacheCreation ? (
                <Table.Column allowsSorting id="cacheCreation">
                  {({ sortDirection }) => (
                    <Table.SortableColumnHeader sortDirection={sortDirection}>
                      {copy.detail.columnCacheCreation}
                    </Table.SortableColumnHeader>
                  )}
                </Table.Column>
              ) : null}
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
                    {formatTokensExact(row.tokens)}
                  </Table.Cell>
                  <Table.Cell className="text-foreground/70 tabular-nums">
                    {formatTokensExact(row.input)}
                  </Table.Cell>
                  <Table.Cell className="text-foreground/70 tabular-nums">
                    {formatTokensExact(row.cached)}
                  </Table.Cell>
                  {hasCacheCreation ? (
                    <Table.Cell className="text-foreground/70 tabular-nums">
                      {formatTokensExact(row.cacheCreation)}
                    </Table.Cell>
                  ) : null}
                  <Table.Cell className="text-foreground/70 tabular-nums">
                    {formatTokensExact(row.output)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatTokensExact(row.billable)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatCost(row.cost)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatNumber(row.conversations)}
                  </Table.Cell>
                  <Table.Cell className="tabular-nums">
                    {formatNumber(row.models)}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>

      <Pagination className="w-full" size="sm">
        <Pagination.Summary>
          {formatMessage(copy.detail.pageSummary, locale, {
            start,
            end,
            total: sorted.length,
          })}
        </Pagination.Summary>
        <Pagination.Content>
          <Pagination.Item>
            <Pagination.Previous
              isDisabled={currentPage === 1}
              onPress={() => setPage((value) => Math.max(1, value - 1))}
            >
              <Pagination.PreviousIcon />
              <span className="hidden sm:inline">{copy.detail.previous}</span>
            </Pagination.Previous>
          </Pagination.Item>
          {pageItems(currentPage, totalPages).map((item, index) =>
            item === "ellipsis" ? (
              <Pagination.Item key={`ellipsis-${index}`}>
                <Pagination.Ellipsis />
              </Pagination.Item>
            ) : (
              <Pagination.Item key={item}>
                <Pagination.Link
                  isActive={item === currentPage}
                  onPress={() => setPage(item)}
                >
                  {item}
                </Pagination.Link>
              </Pagination.Item>
            ),
          )}
          <Pagination.Item>
            <Pagination.Next
              isDisabled={currentPage === totalPages}
              onPress={() =>
                setPage((value) => Math.min(totalPages, value + 1))
              }
            >
              <span className="hidden sm:inline">{copy.detail.next}</span>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>
    </div>
  );
}
