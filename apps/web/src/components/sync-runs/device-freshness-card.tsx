"use client";

// 设备采集状态 strip on /sync-runs (2026-11-07 信息架构调整): one row per
// device answering "is this collector still reporting?" — the write-path
// health the former /service-status page never covered. Rows derive from a
// 7-day sync-runs window plus the account device roster (device-freshness.ts).

import type { DeviceFreshness, FreshnessStatus } from "./device-freshness";
import type { SyncRunsCopy } from "@/lib/copy/sync-runs";

import { Card, Chip, Skeleton, Typography } from "@heroui/react";

import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { useFormat } from "@/lib/format/format";

// Placeholder row count for the first-load skeleton. The real row count is
// the device roster, unknown until the payload lands; two matches this
// deployment's typical shape the same way the summary skeleton fixes widths.
const FRESHNESS_SKELETON_ROWS = 2;

const STATUS_CHIP_COLOR: Record<
  FreshnessStatus,
  "success" | "warning" | "danger" | "default"
> = {
  ok: "success",
  lagging: "warning",
  stalled: "danger",
  failing: "danger",
  none: "default",
};

// Live-status dot inside the chip: a solid dot with a radiating ping layer,
// both on bg-current so the color follows the chip's own soft-variant text
// (--chip-fg). The ripple is the status-page "alive" cue; "none" keeps a
// static dot — no signal, nothing alive to indicate.
function StatusChipLabel({
  status,
  label,
}: {
  status: FreshnessStatus;
  label: string;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="relative flex size-2">
        {status !== "none" ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75 motion-reduce:animate-none" />
        ) : null}
        <span className="relative inline-flex size-2 rounded-full bg-current" />
      </span>
      {label}
    </span>
  );
}

export function DeviceFreshnessCard({
  copy,
  rows,
}: {
  copy: SyncRunsCopy;
  rows: DeviceFreshness[] | null;
}) {
  const [locale] = useLocale();
  const { formatRelativeTime } = useFormat();

  if (!rows || rows.length === 0) return null;

  const subText = (row: DeviceFreshness): string => {
    switch (row.status) {
      case "ok":
      case "lagging":
      case "stalled":
        return row.lastSuccessAt
          ? formatMessage(copy.freshness.lastSuccess, locale, {
              time: formatRelativeTime(row.lastSuccessAt),
            })
          : copy.freshness.noRuns;
      case "failing":
        return row.lastErrorCode
          ? formatMessage(copy.freshness.errorCode, locale, {
              code: row.lastErrorCode,
            })
          : copy.freshness.lastFailed;
      case "none":
        return copy.freshness.noRuns;
    }
  };

  return (
    <Card>
      <Card.Header>
        <Card.Title>{copy.freshness.title}</Card.Title>
        <Card.Description>{copy.freshness.hint}</Card.Description>
      </Card.Header>
      <Card.Content className="gap-1">
        {rows.map((row) => {
          const telemetry = [row.cliVersion, row.os]
            .filter(Boolean)
            .join(" · ");

          return (
            <div
              key={row.deviceId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
            >
              <Chip
                color={STATUS_CHIP_COLOR[row.status]}
                size="sm"
                variant="soft"
              >
                <StatusChipLabel
                  label={copy.freshness[row.status]}
                  status={row.status}
                />
              </Chip>
              <span className="text-sm font-medium">{row.deviceName}</span>
              <Typography
                className="min-w-0 flex-1 basis-40"
                color="muted"
                type="body-xs"
              >
                {subText(row)}
              </Typography>
              {telemetry ? (
                <Typography
                  className="text-foreground/50 shrink-0 font-mono text-xs"
                  type="body-xs"
                >
                  {telemetry}
                </Typography>
              ) : null}
            </div>
          );
        })}
      </Card.Content>
    </Card>
  );
}

// First-load placeholder (mirrors SummaryCardsSkeleton's rule): the card shell
// and the static header copy are real, only the per-device rows — chip, name,
// freshness line, telemetry — are skeleton bars, so the strip keeps the final
// layout's height instead of popping in when the payload lands.
export function DeviceFreshnessCardSkeleton({ copy }: { copy: SyncRunsCopy }) {
  return (
    <Card>
      <Card.Header>
        <Card.Title>{copy.freshness.title}</Card.Title>
        <Card.Description>{copy.freshness.hint}</Card.Description>
      </Card.Header>
      <Card.Content className="gap-1">
        {Array.from({ length: FRESHNESS_SKELETON_ROWS }, (_, index) => (
          <div
            key={index}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5"
          >
            <Skeleton className="h-6 w-14 rounded-full" />
            <Skeleton className="h-3.5 w-24 rounded-full" />
            <Skeleton className="h-3 min-w-0 flex-1 basis-40 rounded-full" />
            <Skeleton className="h-3 w-28 shrink-0 rounded-full" />
          </div>
        ))}
      </Card.Content>
    </Card>
  );
}
