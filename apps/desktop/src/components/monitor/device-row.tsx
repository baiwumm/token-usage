import { Typography } from "@heroui/react";
import { Fragment } from "react";

interface DeviceRowProps {
  hostname: string | null;
  machineId: string | null;
  cliVersion: string | null;
  dashboardUrl: string | null;
}

/** Quiet footer: device identity + CLI version + paired instance. */
export function DeviceRow({
  hostname,
  machineId,
  cliVersion,
  dashboardUrl,
}: DeviceRowProps) {
  const identity =
    machineId && hostname
      ? `${hostname} #${machineId.slice(0, 8)}`
      : (hostname ?? "未知设备");
  const instance = dashboardUrl ? safeHost(dashboardUrl) : "未配对";
  const parts = [
    identity,
    `tokenusage-cli ${cliVersion ?? "未安装"}`,
    instance,
  ];

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

function safeHost(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
