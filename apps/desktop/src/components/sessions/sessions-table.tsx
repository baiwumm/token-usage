import type { SessionRow } from "@/lib/sessions";

import { ListUl } from "@gravity-ui/icons";
import { Button, Card, Chip, Spinner, Table, Typography } from "@heroui/react";

import { TablePagination } from "@/components/table-pagination";
import { ModelChips } from "@/components/sessions/model-chips";
import { SourceIcon } from "@/components/source-icon";
import {
  formatCost,
  formatCredits,
  formatDateTime,
  formatDuration,
  formatTokens,
} from "@/lib/format-tokens";
import { sourceDisplayLabel } from "@/lib/source-logos";

const PAGE_LABELS = {
  pageSummary: "第 {start} - {end} 条，共 {total} 条",
  pageSize: "每页条数",
  pageSizeItem: "每页 {count} 条",
  previous: "上一页",
  next: "下一页",
};

/**
 * Sessions list (web SessionsTable 移植, single-machine cut): same columns
 * minus the device one (local sidecar = this machine), fixed `ended_at` desc
 * order, the credits column auto-hidden until the window carries credits,
 * whole-row detail action and the stacked Card rows below `md` — the default
 * 400 px window is the mobile shape, a maximized window gets the table.
 * Refreshing shows the web DataTableCard-style overlay over the rows, and
 * pagination is the shared TablePagination footer (web 同款三栏).
 */
export function SessionsTable({
  rows,
  total,
  creditsInWindow,
  hasNarrowingFilters,
  offset,
  pageSize,
  loading,
  refreshing,
  onOffsetChange,
  onPageSizeChange,
  onViewDetail,
  onClearFilters,
  onOpenDocs,
}: {
  rows: SessionRow[];
  total: number;
  creditsInWindow: boolean;
  hasNarrowingFilters: boolean;
  offset: number;
  pageSize: number;
  loading: boolean;
  refreshing: boolean;
  onOffsetChange: (offset: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onViewDetail: (session: SessionRow) => void;
  onClearFilters: () => void;
  onOpenDocs: () => void;
}) {
  const hasRows = rows.length > 0;
  const showOverlay = hasRows && refreshing;

  return (
    <Card className="border-border">
      <Card.Header>
        <Card.Title>会话</Card.Title>
        <Card.Description>
          按结束时间倒序；仅显示本机会话元数据。credits-only 来源（如
          qoder-cn）只计积分，不产生 token 与费用，这类会话为 0 属正常。
        </Card.Description>
      </Card.Header>
      <Card.Content className="gap-3">
        {hasRows ? (
          <div className="relative">
            {showOverlay ? (
              <div
                aria-hidden="true"
                className="bg-surface/60 absolute inset-0 z-10 flex items-center justify-center rounded-xl backdrop-blur-[2px]"
              >
                <Spinner size="sm" />
              </div>
            ) : null}

            {/* Table shape for maximized windows (≥md, web ≥md table). */}
            <div className="hidden md:block">
              <Table aria-label="会话">
                <Table.ScrollContainer>
                  {/* Auto layout, not `table-fixed`: fixed columns clipped the
                      detail button (its min width outgrew the 4rem column, so
                      it spilled past the table edge and read as a cut-off
                      cell) — operator feedback 2026-11-12. Widths below stay
                      as preferences; content decides the real minimum. */}
                  <Table.Content className="w-full min-w-[40rem]">
                    <Table.Header>
                      <Table.Column isRowHeader id="endedAt">
                        结束时间
                      </Table.Column>
                      <Table.Column className="w-24" id="source">
                        来源
                      </Table.Column>
                      <Table.Column className="w-32" id="project">
                        项目
                      </Table.Column>
                      <Table.Column className="w-20" id="duration">
                        时长
                      </Table.Column>
                      <Table.Column className="w-20 text-end" id="tokens">
                        Token
                      </Table.Column>
                      {creditsInWindow ? (
                        <Table.Column className="w-20 text-end" id="credits">
                          积分
                        </Table.Column>
                      ) : null}
                      <Table.Column className="w-20 text-end" id="cost">
                        成本
                      </Table.Column>
                      <Table.Column id="models">模型</Table.Column>
                      <Table.Column className="w-24" id="detail">
                        详情
                      </Table.Column>
                    </Table.Header>
                    <Table.Body>
                      {rows.map((session) => (
                        <Table.Row
                          key={sessionKey(session)}
                          id={sessionKey(session)}
                          onAction={() => onViewDetail(session)}
                        >
                          <Table.Cell>
                            <span className="whitespace-nowrap tabular-nums">
                              {formatDateTime(session.endedAt)}
                            </span>
                          </Table.Cell>
                          <Table.Cell>
                            <Chip size="sm" variant="soft">
                              <SourceIcon size={12} source={session.source} />
                              {sourceDisplayLabel(session.source)}
                            </Chip>
                          </Table.Cell>
                          <Table.Cell>
                            <span
                              className="block max-w-32 truncate"
                              title={session.projectKey || undefined}
                            >
                              {session.projectKey || "未标注"}
                            </span>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="whitespace-nowrap tabular-nums">
                              {formatDuration(session.durationMs)}
                            </span>
                          </Table.Cell>
                          <Table.Cell>
                            <span className="whitespace-nowrap text-end tabular-nums">
                              {formatTokens(session.totalTokens)}
                            </span>
                          </Table.Cell>
                          {creditsInWindow ? (
                            <Table.Cell>
                              <span className="whitespace-nowrap text-end tabular-nums">
                                {session.credits > 0
                                  ? `${formatCredits(session.credits)} 积分`
                                  : "—"}
                              </span>
                            </Table.Cell>
                          ) : null}
                          <Table.Cell>
                            <span className="whitespace-nowrap text-end tabular-nums">
                              {formatCost(session.costUsd)}
                            </span>
                          </Table.Cell>
                          <Table.Cell>
                            <ModelChips models={session.models} />
                          </Table.Cell>
                          <Table.Cell>
                            <Button
                              size="sm"
                              variant="tertiary"
                              onPress={() => onViewDetail(session)}
                            >
                              查看
                            </Button>
                          </Table.Cell>
                        </Table.Row>
                      ))}
                    </Table.Body>
                  </Table.Content>
                </Table.ScrollContainer>
              </Table>
            </div>

            {/* Stacked Card rows below md — the 400 px default window. */}
            <ul className="flex flex-col gap-2 md:hidden">
              {rows.map((session) => (
                <li key={sessionKey(session)}>
                  <Card className="p-3">
                    <Card.Content className="gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <Typography type="body-sm" weight="semibold">
                          {formatDateTime(session.endedAt)}
                        </Typography>
                        <Chip size="sm" variant="soft">
                          <SourceIcon size={12} source={session.source} />
                          {sourceDisplayLabel(session.source)}
                        </Chip>
                      </div>
                      <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
                        <span className="max-w-48 truncate">
                          {session.projectKey || "未标注"}
                        </span>
                        <span className="tabular-nums">
                          {formatDuration(session.durationMs)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                        <span className="tabular-nums">
                          {formatTokens(session.totalTokens)}
                        </span>
                        {creditsInWindow && session.credits > 0 ? (
                          <span className="text-muted tabular-nums">
                            {formatCredits(session.credits)} 积分
                          </span>
                        ) : null}
                        <span className="tabular-nums">
                          {formatCost(session.costUsd)}
                        </span>
                      </div>
                      <div className="flex items-end justify-between gap-2">
                        <ModelChips models={session.models} />
                        <Button
                          size="sm"
                          variant="tertiary"
                          onPress={() => onViewDetail(session)}
                        >
                          查看
                        </Button>
                      </div>
                    </Card.Content>
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        ) : loading ? (
          <div className="flex flex-col gap-2 py-6">
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="h-10 animate-pulse rounded-xl bg-default"
              />
            ))}
          </div>
        ) : hasNarrowingFilters ? (
          <div className="flex flex-col items-start gap-2 py-6">
            <Typography type="body-sm" weight="semibold">
              当前筛选没有会话
            </Typography>
            <Typography className="text-muted" type="body-sm">
              换一个时间范围或来源，或清除筛选。
            </Typography>
            <Button size="sm" variant="outline" onPress={onClearFilters}>
              清除筛选
            </Button>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-2 py-6">
            <ListUl aria-hidden="true" className="text-muted size-6" />
            <Typography type="body-sm" weight="semibold">
              等待新版采集器
            </Typography>
            <Typography className="text-muted max-w-2xl" type="body-sm">
              会话列表只读取本机采集器写入的会话元数据，不会从小时用量推导。升级
              CLI 并执行 sync 后，会话会出现在这里。
            </Typography>
            <Button size="sm" variant="secondary" onPress={onOpenDocs}>
              升级文档
            </Button>
          </div>
        )}

        {hasRows ? (
          <TablePagination
            labels={PAGE_LABELS}
            page={Math.floor(offset / pageSize) + 1}
            pageSize={pageSize}
            total={total}
            onPageChange={(page) => onOffsetChange((page - 1) * pageSize)}
            onPageSizeChange={(next) => {
              // Keep the current page anchored when the size changes.
              const page = Math.floor(offset / pageSize);

              onPageSizeChange(next);
              onOffsetChange(page * next);
            }}
          />
        ) : null}
      </Card.Content>
    </Card>
  );
}

function sessionKey(session: SessionRow): string {
  return `${session.source}|${session.id}`;
}
