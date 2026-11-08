import { Typography } from "@heroui/react";

/** Window header: brand lockup plus a pause chip when collection is off. */
export function MonitorHeader({ paused }: { paused: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span aria-hidden="true" className="grid size-8 shrink-0 select-none">
          <img
            alt=""
            className="col-start-1 row-start-1 size-8 rounded-lg dark:hidden"
            height={32}
            src="/logo.svg"
            width={32}
          />
          <img
            alt=""
            className="col-start-1 row-start-1 hidden size-8 rounded-lg dark:block"
            height={32}
            src="/logo-dark.svg"
            width={32}
          />
        </span>
        <Typography type="h6" weight="semibold">
          Token Usage
        </Typography>
      </div>
      {paused ? (
        <span className="rounded-full border border-border bg-surface px-2.5 py-1 text-xs text-muted tabular-nums">
          采集已暂停
        </span>
      ) : null}
    </div>
  );
}
