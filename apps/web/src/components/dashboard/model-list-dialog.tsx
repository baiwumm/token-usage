"use client";

// Shared "models of X" modal: lists one bucket's or one source's models with
// their token share. Rows come in as { model, tokens, cost? }; sorted by
// tokens descending. Used by the hero source chips and the detail table's
// model count column (docs/ui-spec.md 仪表盘), rendering the shared
// BreakdownTable shell.

import type { DashboardCopy } from "@/lib/copy/dashboard";

import { Modal, Typography } from "@heroui/react";

import { BreakdownTable } from "./breakdown-table";

import { SourceIcon } from "@/components/source-icon";

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
  const total = rows.reduce((sum, row) => sum + row.tokens, 0);
  const sorted = [...rows].sort(
    (first, second) => second.tokens - first.tokens,
  );

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
              <BreakdownTable
                ariaLabel={title}
                labels={{
                  name: copy.cost.columnName,
                  tokens: copy.cost.columnTokens,
                  share: copy.cost.columnShare,
                  cost: copy.cost.columnCost,
                  credits: copy.detail.columnCredits,
                }}
                rows={sorted.map((row) => ({
                  id: row.model,
                  label: row.model,
                  icon: (
                    <SourceIcon
                      label={row.model}
                      size={14}
                      source={row.source}
                    />
                  ),
                  tokens: row.tokens,
                  share: total > 0 ? row.tokens / total : undefined,
                  // Cost stays hidden unless the caller has it at all.
                  cost: row.cost ?? undefined,
                }))}
              />
            )}
          </Modal.Body>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
