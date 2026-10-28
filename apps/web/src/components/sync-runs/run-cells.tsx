"use client";

// Result and volume cells for the sync-run list (docs/cli-contract.md §2.12):
// a result chip (plus the empty-run marker and the error code) and the ingested
// volume with the parsed-file / bucket counters underneath.

import type { SyncRunsCopy } from "@/lib/copy/sync-runs";
import type { SyncRunItem } from "@/lib/dashboard/api";

import { Chip, Typography } from "@heroui/react";

import { useFormat } from "@/lib/format/format";

function resultChipColor(
  result: string,
): "success" | "warning" | "danger" | undefined {
  if (result === "ok") return "success";
  if (result === "partial") return "warning";
  if (result === "error") return "danger";

  return undefined;
}

export function RunResultCell({
  run,
  copy,
}: {
  run: SyncRunItem;
  copy: SyncRunsCopy;
}) {
  const color = resultChipColor(run.result);

  return (
    <div className="flex flex-col items-start gap-1">
      <div className="flex flex-wrap items-center gap-1.5">
        <Chip color={color} size="sm" variant="soft">
          {copy.result[run.result as keyof typeof copy.result] ?? run.result}
        </Chip>
        {run.empty ? (
          <Chip className="text-muted" size="sm" variant="soft">
            {copy.emptyChip}
          </Chip>
        ) : null}
      </div>
      {run.result === "error" && run.error_code ? (
        <Typography color="muted" type="body-xs">
          {run.error_code}
        </Typography>
      ) : null}
    </div>
  );
}

export function RunVolumeCell({
  run,
  copy,
}: {
  run: SyncRunItem;
  copy: SyncRunsCopy;
}) {
  const { formatTokens, formatNumber } = useFormat();

  return (
    <div className="flex flex-col">
      <Typography className="whitespace-nowrap tabular-nums" type="body-sm">
        {formatTokens(run.tokens_ingested)}
      </Typography>
      <Typography
        className="whitespace-nowrap tabular-nums"
        color="muted"
        type="body-xs"
      >
        {formatNumber(run.parsed_files)} {copy.list.filesUnit} ·{" "}
        {formatNumber(run.buckets_uploaded)} {copy.list.bucketsUnit}
      </Typography>
    </div>
  );
}
