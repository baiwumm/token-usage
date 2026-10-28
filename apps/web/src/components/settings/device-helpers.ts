// Device-section helpers shared by the settings orchestrator and the device
// table: the usage-window query, the §2.7 creation snapshot that decides
// whether the restore action is live, and the §2.8/§2.9 error mapping.

import type { SettingsCopy } from "@/lib/copy/settings";
import type { AccountDeviceRow } from "@/lib/dashboard/api";

const USAGE_WINDOW_DAYS = 364;

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function usageWindow(): { from: string; to: string } {
  const now = new Date();
  const to = new Date(now);
  const from = new Date(now);

  from.setUTCDate(from.getUTCDate() - USAGE_WINDOW_DAYS);

  return { from: dayKey(from), to: dayKey(to) };
}

export function friendlyDeviceError(code: string, copy: SettingsCopy): string {
  if (code === "device_name_taken") return copy.errorDeviceNameTaken;

  return copy.errorGeneric;
}

// The creation snapshot (§2.7) decides whether the restore action is live; the
// button always renders so the actions column stays aligned across rows.
export function defaultNameFor(device: AccountDeviceRow): string | null {
  return device.default_device_name &&
    device.default_device_name !== device.device_name
    ? device.default_device_name
    : null;
}
