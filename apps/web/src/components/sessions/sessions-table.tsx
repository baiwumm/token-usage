"use client";

// Session list for /sessions (docs/ui-spec.md Sessions): DataTableCard with the
// desktop columns, the stacked card used on mobile, the empty states and the
// client-side pagination wiring. Filters live in the URL; this component only
// reports the new offset/size.

import type { Locale } from "@/lib/copy/locale";
import type { SessionsCopy } from "@/lib/copy/sessions";
import type { SessionItem, SessionsPayload } from "@/lib/dashboard/api";
import type { LoadStatus } from "@/lib/loadable";

import { ListUl } from "@gravity-ui/icons";
import { Button, Card, Chip, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { ModelChips } from "./model-chips";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { SourceIcon } from "@/components/source-icon";
import { sourceDisplayLabel } from "@/lib/sources";
import { useFormat } from "@/lib/format/format";

const UPGRADE_URL = "https://github.com/baiwumm/token-usage#readme";

function rowKey(session: SessionItem): string {
  return `${session.device_id}|${session.source}|${session.session_id}`;
}

export function SessionsTable({
  copy,
  locale,
  payload,
  status,
  refreshing,
  offset,
  pageSize,
  hasNarrowingFilters,
  onOffsetChange,
  onPageSizeChange,
  onViewDetail,
  onClearFilters,
  onRetry,
}: {
  copy: SessionsCopy;
  locale: Locale;
  payload: SessionsPayload | null;
  status: LoadStatus;
  refreshing: boolean;
  /** Offset the current page starts at (from the URL). */
  offset: number;
  pageSize: number;
  hasNarrowingFilters: boolean;
  onOffsetChange: (offset: number) => void;
  onPageSizeChange: (pageSize: number, offset: number) => void;
  onViewDetail: (session: SessionItem) => void;
  onClearFilters: () => void;
  onRetry: () => void;
}) {
  const { formatTokens, formatCost, formatDuration, formatDateTime } =
    useFormat();
  const router = useRouter();

  const totalPages =
    payload && payload.total > 0 ? Math.ceil(payload.total / pageSize) : 1;
  const currentPage = Math.min(
    totalPages,
    Math.floor((payload?.offset ?? 0) / pageSize) + 1,
  );

  const columns = useMemo<DataTableColumn<SessionItem>[]>(
    () => [
      {
        id: "endedAt",
        header: copy.list.endedAt,
        className: "whitespace-nowrap",
        cell: (session) => formatDateTime(session.ended_at),
      },
      {
        id: "source",
        header: copy.list.source,
        cell: (session) => (
          <Chip size="sm" variant="soft">
            <SourceIcon label={session.source} size={12} />
            {sourceDisplayLabel(session.source)}
          </Chip>
        ),
      },
      {
        id: "project",
        header: copy.list.project,
        className: "max-w-48 truncate",
        cell: (session) => session.project_key ?? copy.list.noProject,
      },
      {
        id: "device",
        header: copy.list.device,
        className: "max-w-40 truncate",
        cell: (session) => session.device_name,
      },
      {
        id: "duration",
        header: copy.list.duration,
        className: "whitespace-nowrap tabular-nums",
        cell: (session) => formatDuration(session.duration_ms),
      },
      {
        id: "tokens",
        header: copy.list.tokens,
        className: "whitespace-nowrap tabular-nums",
        cell: (session) => formatTokens(session.total_tokens),
      },
      {
        id: "cost",
        header: copy.list.cost,
        className: "whitespace-nowrap tabular-nums",
        cell: (session) => formatCost(Number(session.total_cost_usd)),
      },
      {
        id: "models",
        header: copy.list.models,
        cell: (session) => (
          <ModelChips models={session.models} source={session.source} />
        ),
      },
      {
        id: "detail",
        header: copy.list.detail,
        cell: (session) => (
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => onViewDetail(session)}
          >
            {copy.list.view}
          </Button>
        ),
      },
    ],
    [
      copy,
      formatCost,
      formatDateTime,
      formatDuration,
      formatTokens,
      onViewDetail,
    ],
  );

  const renderSessionRow = (session: SessionItem) => (
    <Card className="p-3">
      <Card.Content className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <Typography type="body-sm" weight="semibold">
            {formatDateTime(session.ended_at)}
          </Typography>
          <Chip size="sm" variant="soft">
            {session.source}
          </Chip>
        </div>
        <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="max-w-48 truncate">
            {session.project_key ?? copy.list.noProject}
          </span>
          <span className="max-w-40 truncate">{session.device_name}</span>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span className="tabular-nums">
            {formatTokens(session.total_tokens)}
          </span>
          <span className="tabular-nums">
            {formatCost(Number(session.total_cost_usd))}
          </span>
          <span className="text-muted tabular-nums">
            {formatDuration(session.duration_ms)}
          </span>
        </div>
        <div className="flex items-end justify-between gap-2">
          <ModelChips models={session.models} source={session.source} />
          <Button
            size="sm"
            variant="tertiary"
            onPress={() => onViewDetail(session)}
          >
            {copy.list.view}
          </Button>
        </div>
      </Card.Content>
    </Card>
  );

  const filterEmpty = (
    <div className="flex flex-col items-start gap-2 py-6">
      <Typography type="body-sm" weight="semibold">
        {copy.states.filterEmptyTitle}
      </Typography>
      <Typography color="muted" type="body-sm">
        {copy.states.filterEmptyBody}
      </Typography>
      <Button size="sm" variant="outline" onPress={onClearFilters}>
        {copy.clearFilters}
      </Button>
    </div>
  );

  const emptyState = (
    <div className="flex flex-col items-start gap-2 py-6">
      <ListUl aria-hidden="true" className="text-muted size-6" />
      <Typography type="body-sm" weight="semibold">
        {copy.states.emptyTitle}
      </Typography>
      <Typography className="max-w-2xl" color="muted" type="body-sm">
        {copy.states.emptyBody}
      </Typography>
      <div className="flex flex-wrap gap-2 pt-1">
        <Button size="sm" onPress={() => router.push("/device")}>
          {copy.states.emptyPair}
        </Button>
        <Button
          size="sm"
          variant="secondary"
          onPress={() =>
            window.open(UPGRADE_URL, "_blank", "noopener,noreferrer")
          }
        >
          {copy.states.emptyDocs}
        </Button>
      </div>
    </div>
  );

  return (
    <DataTableCard
      columns={columns}
      empty={hasNarrowingFilters ? filterEmpty : emptyState}
      error={{
        message: copy.states.loadError,
        onRetry,
        retryLabel: copy.states.retry,
      }}
      hint={copy.list.hint}
      pagination={
        payload
          ? {
              labels: copy.list,
              locale,
              onPageChange: (page) => onOffsetChange((page - 1) * pageSize),
              onPageSizeChange: (next) => {
                // Keep the current page anchored when the size changes;
                // an explicit offset skips the auto-reset.
                const page = Math.floor(offset / pageSize);

                onPageSizeChange(next, page * next);
              },
              page: currentPage,
              pageSize,
              total: payload.total,
            }
          : undefined
      }
      refreshing={refreshing}
      renderMobileRow={renderSessionRow}
      rowKey={rowKey}
      rows={payload?.sessions ?? []}
      status={status}
      tableLabel={copy.list.title}
      title={copy.list.title}
      onRowAction={(session) => onViewDetail(session)}
    />
  );
}
