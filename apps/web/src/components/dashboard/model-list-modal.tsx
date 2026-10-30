"use client";

// Shared "models of X" modal: lists one bucket's or one source's models with
// their token share. Rows come in as { model, tokens, cost? }; sorted by
// tokens descending. Used by the hero source chips and the detail table's
// model count column (docs/ui-spec.md 仪表盘).

import type { DashboardCopy } from "@/lib/copy/dashboard";

import { Modal, Table, Typography } from "@heroui/react";

import { SourceIcon } from "@/components/source-icon";
import { useFormat } from "@/lib/format/format";

export interface ModelListRow {
  model: string;
  tokens: number;
  /** Per-model cost when the caller has it (sources do, detail buckets
   * don't — the series payload only carries tokens per model). */
  cost?: number | null;
  /** Owning source id when the caller knows it — lets models without a
   *  vendor mark ("auto", "lite") fall back to the source logo. */
  source?: string;
}

export function ModelListModal({
  open,
  onOpenChange,
  title,
  rows,
  copy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  rows: ModelListRow[];
  copy: DashboardCopy;
}) {
  const { formatTokens, formatCost, formatPercent } = useFormat();
  const total = rows.reduce((sum, row) => sum + row.tokens, 0);
  const sorted = [...rows].sort(
    (first, second) => second.tokens - first.tokens,
  );
  // The cost column only appears when the caller actually has cost data.
  const hasCost = rows.some((row) => row.cost != null);

  return (
    <Modal.Backdrop isOpen={open} onOpenChange={onOpenChange}>
      {/* scroll=inside + a dialog max-height: short lists render fully with
            no scrollbar; only the 全部 ranking scrolls, header stays pinned. */}
      <Modal.Container scroll="inside" size="lg">
        <Modal.Dialog className="max-h-[85vh]">
          <Modal.CloseTrigger aria-label={copy.cost.close} />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            {sorted.length === 0 ? (
              <Typography color="muted" type="body-sm">
                {copy.cost.noData}
              </Typography>
            ) : (
              <Table>
                <Table.ScrollContainer>
                  {/* table-fixed + fixed-width numeric columns keeps the
                        table at the dialog width: long model names truncate
                        instead of stretching the table horizontally. */}
                  <Table.Content
                    aria-label={title}
                    className="w-full table-fixed"
                  >
                    <Table.Header>
                      <Table.Column isRowHeader id="model">
                        {copy.cost.columnName}
                      </Table.Column>
                      <Table.Column className="w-24 text-end" id="tokens">
                        {copy.cost.columnTokens}
                      </Table.Column>
                      <Table.Column className="w-16 text-end" id="share">
                        {copy.cost.columnShare}
                      </Table.Column>
                      {hasCost ? (
                        <Table.Column className="w-24 text-end" id="cost">
                          {copy.cost.columnCost}
                        </Table.Column>
                      ) : null}
                    </Table.Header>
                    <Table.Body>
                      {sorted.map((row) => (
                        <Table.Row key={row.model} id={row.model}>
                          <Table.Cell>
                            <span
                              className="flex min-w-0 items-center gap-1.5"
                              title={row.model}
                            >
                              <SourceIcon
                                label={row.model}
                                size={14}
                                source={row.source}
                              />
                              <span className="truncate font-medium">
                                {row.model}
                              </span>
                            </span>
                          </Table.Cell>
                          <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                            {formatTokens(row.tokens)}
                          </Table.Cell>
                          <Table.Cell className="text-muted whitespace-nowrap text-end tabular-nums">
                            {total > 0
                              ? formatPercent(row.tokens / total)
                              : "—"}
                          </Table.Cell>
                          {hasCost ? (
                            <Table.Cell className="whitespace-nowrap text-end tabular-nums">
                              {row.cost != null ? formatCost(row.cost) : "—"}
                            </Table.Cell>
                          ) : null}
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
