"use client";

// Sync-run list for /sync-runs (docs/cli-contract.md §2.12): DataTableCard with
// the desktop columns, the stacked card used on mobile, the empty states and
// the pagination wiring. Filters live in the URL; this component only reports
// the new offset/size.

import type { Locale } from "@/lib/copy/locale";
import type { SyncRunsCopy } from "@/lib/copy/sync-runs";
import type { SyncRunItem, SyncRunsPayload } from "@/lib/dashboard/api";
import type { LoadStatus } from "@/lib/loadable";

import { ListUl } from "@gravity-ui/icons";
import { Button, Card, Chip, Typography } from "@heroui/react";
import { useRouter } from "next/navigation";
import { useMemo } from "react";

import { RunResultCell, RunVolumeCell } from "./run-cells";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { useFormat } from "@/lib/format/format";

const UPGRADE_URL = "https://github.com/baiwumm/token-usage#readme";

function rowKey(run: SyncRunItem): string {
  return `${run.device_id}|${run.run_id}`;
}

export function SyncRunsTable({
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
  onClearFilters,
  onRetry,
}: {
  copy: SyncRunsCopy;
  locale: Locale;
  payload: SyncRunsPayload | null;
  status: LoadStatus;
  refreshing: boolean;
  /** Offset the current page starts at (from the URL). */
  offset: number;
  pageSize: number;
  hasNarrowingFilters: boolean;
  onOffsetChange: (offset: number) => void;
  onPageSizeChange: (pageSize: number, offset: number) => void;
  onClearFilters: () => void;
  onRetry: () => void;
}) {
  const { formatDateTime, formatDuration } = useFormat();
  const router = useRouter();

  const totalPages =
    payload && payload.total > 0 ? Math.ceil(payload.total / pageSize) : 1;
  const currentPage = Math.min(
    totalPages,
    Math.floor((payload?.offset ?? 0) / pageSize) + 1,
  );

  const columns = useMemo<DataTableColumn<SyncRunItem>[]>(
    () => [
      {
        id: "startedAt",
        header: copy.list.startedAt,
        className: "whitespace-nowrap",
        cell: (run) => formatDateTime(run.started_at),
      },
      {
        id: "device",
        header: copy.list.device,
        className: "max-w-40 truncate",
        cell: (run) => run.device_name,
      },
      {
        id: "trigger",
        header: copy.list.trigger,
        cell: (run) => (
          <Chip size="sm" variant="soft">
            {copy.trigger[run.trigger as keyof typeof copy.trigger] ??
              run.trigger}
          </Chip>
        ),
      },
      {
        id: "result",
        header: copy.list.result,
        cell: (run) => <RunResultCell copy={copy} run={run} />,
      },
      {
        id: "duration",
        header: copy.list.duration,
        className: "whitespace-nowrap tabular-nums",
        cell: (run) => formatDuration(run.duration_ms),
      },
      {
        id: "volume",
        header: copy.list.volume,
        cell: (run) => <RunVolumeCell copy={copy} run={run} />,
      },
    ],
    [copy, formatDateTime, formatDuration],
  );

  const renderMobileRun = (run: SyncRunItem) => (
    <Card className="p-3">
      <Card.Content className="gap-2">
        <div className="flex items-center justify-between gap-2">
          <Typography type="body-sm" weight="semibold">
            {formatDateTime(run.started_at)}
          </Typography>
          <div className="flex items-center gap-1.5">
            <Chip size="sm" variant="soft">
              {copy.trigger[run.trigger as keyof typeof copy.trigger] ??
                run.trigger}
            </Chip>
            {run.empty ? (
              <Chip className="text-muted" size="sm" variant="soft">
                {copy.emptyChip}
              </Chip>
            ) : null}
          </div>
        </div>
        <div className="text-muted flex flex-wrap gap-x-3 gap-y-1 text-xs">
          <span className="max-w-40 truncate">{run.device_name}</span>
          <span>
            {copy.result[run.result as keyof typeof copy.result] ?? run.result}
            {run.result === "error" && run.error_code
              ? ` · ${run.error_code}`
              : ""}
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="tabular-nums">
            {formatDuration(run.duration_ms)}
          </span>
          <span className="tabular-nums">
            {run.parsed_files} {copy.list.filesUnit} · {run.buckets_uploaded}{" "}
            {copy.list.bucketsUnit}
          </span>
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
          {copy.states.emptyUpgrade}
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
      renderMobileRow={renderMobileRun}
      rowKey={rowKey}
      rows={payload?.runs ?? []}
      status={status}
      tableLabel={copy.list.title}
      title={copy.list.title}
    />
  );
}
