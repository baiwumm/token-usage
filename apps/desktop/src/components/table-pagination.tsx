import { ListBox, Pagination, Select, Typography } from "@heroui/react";

import { PAGE_SIZE_OPTIONS } from "@/lib/sessions";

export interface TablePaginationLabels {
  pageSummary: string;
  pageSize: string;
  pageSizeItem: string;
  previous: string;
  next: string;
}

/** Numbered page window with ellipses (web lib/ui/pagination pageItems 同款). */
function pageItems(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, index) => index + 1);
  }
  if (current <= 4) return [1, 2, 3, 4, 5, "ellipsis", total];
  if (current >= total - 3) {
    return [1, "ellipsis", total - 4, total - 3, total - 2, total - 1, total];
  }

  return [1, "ellipsis", current - 1, current, current + 1, "ellipsis", total];
}

/**
 * Shared table footer (web TablePagination 单语移植): range summary on the
 * left, numbered pages in the middle, and a fixed-width rows-per-page
 * selector on the right — the `w-36` trigger never wraps, which is exactly
 * the wrap bug the first D11 acceptance round flagged.
 */
export function TablePagination({
  page,
  total,
  pageSize,
  labels,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = PAGE_SIZE_OPTIONS,
}: {
  page: number;
  total: number;
  pageSize: number;
  labels: TablePaginationLabels;
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
      <Typography className="text-muted min-w-0 tabular-nums" type="body-xs">
        {labels.pageSummary
          .replace("{start}", String(start))
          .replace("{end}", String(end))
          .replace("{total}", String(total))}
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
          const next = Number(key);

          if (pageSizeOptions.includes(next)) onPageSizeChange(next);
        }}
      >
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            {pageSizeOptions.map((option) => (
              <ListBox.Item
                key={String(option)}
                id={String(option)}
                textValue={labels.pageSizeItem.replace(
                  "{count}",
                  String(option),
                )}
              >
                {labels.pageSizeItem.replace("{count}", String(option))}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    </div>
  );
}
