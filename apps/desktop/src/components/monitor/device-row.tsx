import { Typography } from "@heroui/react";

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

  return (
    <Typography className="text-center text-muted tabular-nums" type="body">
      {identity} · tokenusage-cli {cliVersion ?? "未安装"} · {instance}
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
