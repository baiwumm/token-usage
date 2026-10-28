"use client";

// Devices section: the paired-device table (contract §2.7) plus the rename /
// restore / revoke row actions. Presentational only — the orchestrator owns the
// device list, the busy flags and the fetch flows.

import type { SettingsCopy } from "@/lib/copy/settings";
import type { AccountDeviceRow } from "@/lib/dashboard/api";
import type { LoadStatus } from "@/lib/loadable";

import { ArrowRotateLeft, Pencil, TrashBin } from "@gravity-ui/icons";
import { Button, Chip, Tooltip, Typography } from "@heroui/react";
import { useMemo, type ReactNode } from "react";

import { defaultNameFor } from "./device-helpers";

import {
  DataTableCard,
  type DataTableColumn,
} from "@/components/data-table-card";
import { useFormat } from "@/lib/format/format";

// Icon-only table actions carry their label in a tooltip (docs/ui-spec.md).
function ActionTooltip({
  children,
  label,
}: {
  children: ReactNode;
  label: string;
}) {
  return (
    <Tooltip delay={0}>
      {children}
      <Tooltip.Content showArrow placement="bottom">
        <Tooltip.Arrow />
        <Typography type="body-xs">{label}</Typography>
      </Tooltip.Content>
    </Tooltip>
  );
}

export function DevicesTable({
  copy,
  rows,
  status,
  onRename,
  onRestore,
  onRetry,
  onRevoke,
}: {
  copy: SettingsCopy;
  rows: AccountDeviceRow[];
  status: LoadStatus;
  onRename: (device: AccountDeviceRow) => void;
  onRestore: (device: AccountDeviceRow) => void;
  onRetry: () => void;
  onRevoke: (device: AccountDeviceRow) => void;
}) {
  const { formatDate, formatTokens } = useFormat();
  const deviceColumns = useMemo<DataTableColumn<AccountDeviceRow>[]>(
    () => [
      {
        id: "device",
        header: copy.columnDevice,
        className: "font-medium",
        cell: (device) => device.device_name,
      },
      {
        id: "platform",
        header: copy.columnPlatform,
        cell: (device) => (
          <Chip size="sm" variant="secondary">
            {device.platform}
          </Chip>
        ),
      },
      {
        id: "joined",
        header: copy.columnJoined,
        cell: (device) => formatDate(device.created_at),
      },
      {
        id: "usage",
        header: `${copy.columnUsage}（${copy.usageWindowLabel}）`,
        className: "tabular-nums",
        cell: (device) => formatTokens(device.total_tokens ?? 0),
      },
      {
        id: "actions",
        header: copy.columnActions,
        cell: (device) => (
          <div className="flex gap-2">
            <ActionTooltip label={copy.renameAction}>
              <Button
                isIconOnly
                aria-label={copy.renameAction}
                size="sm"
                variant="secondary"
                onPress={() => {
                  onRename(device);
                }}
              >
                <Pencil aria-hidden="true" className="size-4" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label={copy.restoreAction}>
              <Button
                isIconOnly
                aria-label={copy.restoreAction}
                isDisabled={!defaultNameFor(device)}
                size="sm"
                variant="tertiary"
                onPress={() => {
                  onRestore(device);
                }}
              >
                <ArrowRotateLeft aria-hidden="true" className="size-4" />
              </Button>
            </ActionTooltip>
            <ActionTooltip label={copy.revokeAction}>
              <Button
                isIconOnly
                aria-label={copy.revokeAction}
                size="sm"
                variant="danger-soft"
                onPress={() => {
                  onRevoke(device);
                }}
              >
                <TrashBin aria-hidden="true" className="size-4" />
              </Button>
            </ActionTooltip>
          </div>
        ),
      },
    ],
    [copy, formatDate, formatTokens, onRename, onRestore, onRevoke],
  );

  return (
    <DataTableCard
      className="p-6"
      columns={deviceColumns}
      empty={
        <div className="flex flex-col gap-1 py-4">
          <Typography type="body-sm" weight="semibold">
            {copy.emptyTitle}
          </Typography>
          <Typography color="muted" type="body-sm">
            {copy.emptyBody}
          </Typography>
        </div>
      }
      error={{
        message: copy.loadError,
        onRetry,
        retryLabel: copy.retry,
      }}
      hint={copy.devicesHint}
      rowKey={(device) => device.id}
      rows={rows}
      status={status}
      tableLabel={copy.devicesHeading}
      title={copy.devicesHeading}
    />
  );
}
