// Numbered-pagination window: 1 … (p-1 p p+1) … last, collapsing to a plain
// run of seven or fewer pages. Shared by the sessions list and the dashboard
// detail table.

export type PageItem = number | "ellipsis";

export function pageItems(page: number, totalPages: number): PageItem[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, index) => index + 1);
  }
  const items: PageItem[] = [1];

  if (page > 3) items.push("ellipsis");
  const start = Math.max(2, page - 1);
  const end = Math.min(totalPages - 1, page + 1);

  for (let value = start; value <= end; value += 1) items.push(value);
  if (page < totalPages - 2) items.push("ellipsis");
  items.push(totalPages);

  return items;
}
