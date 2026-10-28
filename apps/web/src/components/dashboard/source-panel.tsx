"use client";

// Source mix panel: a donut of the canonical sources with click-to-toggle
// distribution rows (juejin 工具分布 style) and a full-list modal.

import type { DashboardCopy } from "@/lib/copy/dashboard";
import type { ModelBreakdownSource } from "@/lib/dashboard/api";

import { Button, Card, Modal, Typography } from "@heroui/react";
import { useMemo, useState } from "react";

import { canonicalSourceRows } from "./aggregate";

import { DonutChart } from "@/components/mini-charts";
import { SourceIcon } from "@/components/source-icon";
import { formatMessage } from "@/lib/copy/message";
import { useLocale } from "@/lib/copy/locale";
import { useFormat } from "@/lib/format/format";

export function SourcePanel({
  sources,
  copy,
}: {
  sources: ModelBreakdownSource[];
  copy: DashboardCopy;
}) {
  const { formatTokens, formatPercent } = useFormat();
  const [locale] = useLocale();
  // Click-to-toggle distribution (juejin 工具分布 style): hidden canonical
  // sources drop out of the donut, the share denominator recomputes, and the
  // full list (beyond the first five rows) opens in a modal.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [allOpen, setAllOpen] = useState(false);

  const rows = useMemo(() => canonicalSourceRows(sources), [sources]);

  const visible = rows.filter((row) => !hidden.has(row.id));
  const visibleTotal = visible.reduce((sum, row) => sum + row.totalTokens, 0);

  const toggle = (id: string) => {
    setHidden((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  };

  const renderRows = (list: typeof rows) => (
    <div className="flex flex-col gap-1.5">
      {list.map((row) => {
        const isHidden = hidden.has(row.id);
        const share =
          visibleTotal > 0 && !isHidden ? row.totalTokens / visibleTotal : 0;

        return (
          <button
            key={row.id}
            aria-pressed={!isHidden}
            className={`flex w-full items-center justify-between gap-2 rounded-lg px-1 py-0.5 text-sm transition-opacity ${
              isHidden ? "text-muted opacity-40" : "hover:bg-default/60"
            }`}
            type="button"
            onClick={() => toggle(row.id)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <SourceIcon label={row.id} size={14} />
              <span className={`truncate ${isHidden ? "line-through" : ""}`}>
                {row.label}
              </span>
            </span>
            <span className="text-foreground/60 tabular-nums text-xs">
              {formatTokens(row.totalTokens)} ·{" "}
              {isHidden ? "—" : formatPercent(share)}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Card className="p-6">
      <Card.Header>
        <Card.Title>{copy.panels.sourcesTitle}</Card.Title>
        <Card.Description>{copy.panels.sourcesHint}</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        {rows.length === 0 ? (
          <Typography color="muted" type="body-sm">
            —
          </Typography>
        ) : (
          <>
            <DonutChart
              centerLabel={copy.cards.totalTokens}
              centerValue={formatTokens(visibleTotal)}
              entries={visible.map((row) => ({
                name: row.label,
                value: row.totalTokens,
              }))}
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              {renderRows(rows.slice(0, 5))}
              {rows.length > 5 ? (
                <Button
                  className="mt-1 w-full"
                  size="sm"
                  variant="ghost"
                  onPress={() => setAllOpen(true)}
                >
                  {formatMessage(copy.panels.sourcesViewAll, locale, {
                    count: rows.length,
                  })}
                </Button>
              ) : null}
              {hidden.size > 0 ? (
                <button
                  className="text-muted self-start text-xs hover:text-foreground"
                  type="button"
                  onClick={() => setHidden(new Set())}
                >
                  {copy.panels.resetHidden}
                </button>
              ) : null}
            </div>
            <Modal.Backdrop isOpen={allOpen} onOpenChange={setAllOpen}>
              <Modal.Container>
                <Modal.Dialog>
                  <Modal.CloseTrigger aria-label={copy.cost.close} />
                  <Modal.Header>
                    <Modal.Heading>{copy.panels.sourcesTitle}</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <div className="max-h-[60vh] overflow-y-auto">
                      {renderRows(rows)}
                    </div>
                  </Modal.Body>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </>
        )}
      </Card.Content>
      <Card.Footer>
        <Typography color="muted" type="body-xs">
          {copy.panels.sharedNote}
        </Typography>
      </Card.Footer>
    </Card>
  );
}
