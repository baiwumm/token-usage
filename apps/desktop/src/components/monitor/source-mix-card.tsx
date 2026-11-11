import type { SourceUsage } from "@/lib/queue-lines";

import { Button, Card, Modal, Typography, cn } from "@heroui/react";
import { useMemo, useState } from "react";

import { DonutChart } from "@/components/mini-charts";
import { BreakdownTable } from "@/components/monitor/breakdown-table";
import { SourceIcon } from "@/components/source-icon";
import { formatPercent, formatTokens } from "@/lib/format-tokens";
import { groupSourceUsage, sourceDisplayLabel } from "@/lib/source-logos";

/**
 * 来源构成 card (web 来源 panel 同款移植): a canonical-source donut with
 * click-to-toggle distribution rows — hidden rows drop out of the ring and
 * the share denominator recomputes — and a full-list table modal beyond the
 * first five rows. Credits-only sources (0 tokens) never enter the mix.
 */
export function SourceMixCard({ sources }: { sources: SourceUsage[] }) {
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const [allOpen, setAllOpen] = useState(false);

  const rows = useMemo(
    () => groupSourceUsage(sources).filter((row) => row.tokens > 0),
    [sources],
  );

  const visible = rows.filter((row) => !hidden.has(row.source));
  const visibleTotal = visible.reduce((sum, row) => sum + row.tokens, 0);

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

  const shareOf = (row: (typeof rows)[number]) =>
    visibleTotal > 0 && !hidden.has(row.source) ? row.tokens / visibleTotal : 0;

  // Compact rows: the label truncates first, while the token and share
  // columns stay on one line (long full-digit token counts ellipsize instead
  // of wrapping into a second row).
  const renderRows = (list: typeof rows) => (
    <div className="flex flex-col gap-1.5">
      {list.map((row) => {
        const isHidden = hidden.has(row.source);

        return (
          <button
            key={row.source}
            aria-pressed={!isHidden}
            className={cn(
              "grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-lg px-1 py-0.5 text-start text-sm transition-opacity",
              isHidden ? "text-muted opacity-40" : "hover:bg-default/60",
            )}
            type="button"
            onClick={() => toggle(row.source)}
          >
            <span className="flex min-w-0 items-center gap-2">
              <SourceIcon size={14} source={row.source} />
              <span className={cn("truncate", isHidden && "line-through")}>
                {sourceDisplayLabel(row.source)}
              </span>
            </span>
            <span className="text-foreground/60 tabular-nums truncate text-xs">
              {formatTokens(row.tokens)}
            </span>
            <span className="text-foreground/60 tabular-nums w-12 text-end whitespace-nowrap text-xs">
              {isHidden ? "—" : formatPercent(shareOf(row))}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>来源构成</Card.Title>
        <Card.Description>占比按 Token。点击来源可隐藏/显示。</Card.Description>
      </Card.Header>
      <Card.Content className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
        {rows.length === 0 ? (
          <Typography color="muted" type="body-sm">
            窗口内暂无数据
          </Typography>
        ) : (
          <>
            <DonutChart
              centerLabel="总 Tokens"
              centerValue={formatTokens(visibleTotal)}
              entries={visible.map((row) => ({
                name: sourceDisplayLabel(row.source),
                value: row.tokens,
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
                  查看全部（{rows.length}）
                </Button>
              ) : null}
              {hidden.size > 0 ? (
                <button
                  className="text-muted self-start text-xs hover:text-foreground"
                  type="button"
                  onClick={() => setHidden(new Set())}
                >
                  恢复显示全部来源
                </button>
              ) : null}
            </div>
            <Modal.Backdrop isOpen={allOpen} onOpenChange={setAllOpen}>
              <Modal.Container scroll="inside" size="lg">
                <Modal.Dialog className="max-h-[85vh]">
                  <Modal.CloseTrigger aria-label="关闭" />
                  <Modal.Header>
                    <Modal.Heading>来源构成</Modal.Heading>
                  </Modal.Header>
                  <Modal.Body>
                    <BreakdownTable
                      ariaLabel="来源构成"
                      labels={{
                        name: "名称",
                        tokens: "Token",
                        share: "占比",
                        cost: "成本",
                        credits: "积分",
                      }}
                      renderLabel={(row) => {
                        const isHidden = hidden.has(row.id);

                        return (
                          <button
                            aria-pressed={!isHidden}
                            className={cn(
                              "flex min-w-0 cursor-pointer items-center gap-1.5 text-start transition-opacity",
                              isHidden && "opacity-40",
                            )}
                            title={row.label}
                            type="button"
                            onClick={() => toggle(row.id)}
                          >
                            <SourceIcon size={14} source={row.id} />
                            <span
                              className={cn(
                                "truncate font-medium",
                                isHidden && "line-through",
                              )}
                            >
                              {sourceDisplayLabel(row.id)}
                            </span>
                          </button>
                        );
                      }}
                      rows={rows.map((row) => ({
                        id: row.source,
                        label: sourceDisplayLabel(row.source),
                        tokens: row.tokens,
                        // A hidden source leaves the denominator, so its share
                        // is meaningless until it is shown again (em dash).
                        share: hidden.has(row.source)
                          ? undefined
                          : shareOf(row),
                        cost:
                          row.totalCostUsd > 0 ? row.totalCostUsd : undefined,
                      }))}
                    />
                  </Modal.Body>
                </Modal.Dialog>
              </Modal.Container>
            </Modal.Backdrop>
          </>
        )}
      </Card.Content>
    </Card>
  );
}
