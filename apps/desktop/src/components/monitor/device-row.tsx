import { Typography } from "@heroui/react";
import { Fragment } from "react";

interface DeviceRowProps {
  hostname: string | null;
  machineId: string | null;
}

/**
 * Quiet footer: device identity + copyright. The CLI version lives on the
 * actions card chip and the paired instance on the web entries, so repeating
 * either here only added noise (operator review 2026-11-10).
 */
export function DeviceRow({ hostname, machineId }: DeviceRowProps) {
  const identity =
    machineId && hostname
      ? `${hostname} #${machineId.slice(0, 8)}`
      : (hostname ?? "未知设备");
  const parts = [identity, "© 2026 Token Usage"];

  // Each segment stays whole (a host like token-usage.baiwumm.com would
  // otherwise break at its hyphen in a 400 px window); the separators sit
  // outside the nowrap spans, so lines wrap only between segments.
  return (
    <Typography className="text-center text-muted tabular-nums" type="body">
      {parts.map((part, index) => (
        <Fragment key={part}>
          {index > 0 ? " · " : null}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </Typography>
  );
}
