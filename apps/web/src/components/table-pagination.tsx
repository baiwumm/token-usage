"use client";

// Shared table footer: range summary on the left, numbered pages in the
// middle, and a compact rows-per-page selector on the right. The caller owns
// page/page-size state (the sessions list also mirrors it into the URL).

import type { Locale } from "@/lib/copy/locale-config";

import { ListBox, Pagination, Select, Typography } from "@heroui/react";

import { formatMessage } from "@/lib/copy/message";
import { PAGE_SIZE_OPTIONS, pageItems } from "@/lib/ui/pagination";

export interface TablePaginationLabels {
  pageSummary: string;
  pageSize: string;
  pageSizeItem: string;
  previous: string;
  next: string;
}

export function TablePagination({
  page,
  total,
  pageSize,
  labels,
  locale,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: {
  page: number;
  total: number;
  pageSize: number;
  labels: TablePaginationLabels;
  locale: Locale;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: readonly number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = total === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const end = Math.min(currentPage * pageSize, total);

  return (
    <div className="grid w-full grid-cols-1 items-center gap-3 md:grid-cols-[1fr_auto_1fr]">
      <Typography className="min-w-0 tabular-nums" color="muted" type="body-xs">
        {formatMessage(labels.pageSummary, locale, { start, end, total })}
      </Typography>

      <Pagination className="w-auto! justify-self-center" size="sm">
        <Pagination.Content className="self-center">
          <Pagination.Item>
            <Pagination.Previous
              isDisabled={currentPage === 1}
              onPress={() => onPageChange(currentPage - 1)}
            >
              <Pagination.PreviousIcon />
              <span className="hidden sm:inline">{labels.previous}</span>
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
                  onPress={() => onPageChange(item)}
                >
                  {item}
                </Pagination.Link>
              </Pagination.Item>
            ),
          )}
          <Pagination.Item>
            <Pagination.Next
              isDisabled={currentPage === totalPages}
              onPress={() => onPageChange(currentPage + 1)}
            >
              <span className="hidden sm:inline">{labels.next}</span>
              <Pagination.NextIcon />
            </Pagination.Next>
          </Pagination.Item>
        </Pagination.Content>
      </Pagination>

      <Select
        aria-label={labels.pageSize}
        className="w-36 justify-self-end"
        value={String(pageSize)}
        variant="secondary"
        onChange={(key) => {
          if (key == null) return;
          onPageSizeChange(Number(key));
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {pageSizeOptions.map((option) => {
              const label = formatMessage(labels.pageSizeItem, locale, {
                count: option,
              });

              return (
                <ListBox.Item
                  key={option}
                  id={String(option)}
                  textValue={label}
                >
                  {label}
                  <ListBox.ItemIndicator />
                </ListBox.Item>
              );
            })}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
