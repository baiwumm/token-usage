// Per-device capture freshness for /sync-runs (2026-11-07 信息架构调整): the
// heartbeat question "is each device still reporting?" answered from the run
// rows the page already loads. Pure module — thresholds and grouping live
// here so the unit tests can pin them; the card only renders.

import type { SyncRunItem } from "@/lib/dashboard/api";

export type FreshnessStatus = "ok" | "lagging" | "stalled" | "failing" | "none";

// Thresholds against the hourly collection cadence: silence up to a day
// stays green (machines sleep overnight), a week of silence means the
// capture task is dead. A failed latest run always wins — a fresh failure
// is the news regardless of when the last success was.
export const FRESH_OK_MAX_MS = 24 * 60 * 60 * 1000;
export const FRESH_STALLED_MIN_MS = 7 * FRESH_OK_MAX_MS;

export interface DeviceFreshness {
  deviceId: string;
  deviceName: string;
  /** Most recent run of any result (ISO), null when the window has none. */
  lastRunAt: string | null;
  /** Whether that most recent run failed. */
  lastRunFailed: boolean;
  /** Most recent run that delivered data (result != error), ISO. */
  lastSuccessAt: string | null;
  /** error_code of the most recent run when it failed. */
  lastErrorCode: string | null;
  /** Telemetry of the most recent run — surfaces version skew across devices. */
  cliVersion: string | null;
  os: string | null;
  status: FreshnessStatus;
}

export function freshnessStatus(
  lastSuccessAgeMs: number | null,
  lastRunFailed: boolean,
): FreshnessStatus {
  if (lastRunFailed) return "failing";
  if (lastSuccessAgeMs == null) return "none";
  if (lastSuccessAgeMs <= FRESH_OK_MAX_MS) return "ok";
  if (lastSuccessAgeMs <= FRESH_STALLED_MIN_MS) return "lagging";

  return "stalled";
}

/**
 * Builds one row per device from the newest runs (the API returns them
 * sorted by started_at desc) plus the account device roster, so a device
 * without runs in the window still appears as "none" instead of vanishing.
 */
export function buildDeviceFreshness(
  runs: SyncRunItem[],
  roster: Array<{ device_id: string; device_name: string }>,
  now: number = Date.now(),
): DeviceFreshness[] {
  const byDevice = new Map<string, DeviceFreshness>();

  for (const run of runs) {
    const known = byDevice.get(run.device_id);

    if (!known) {
      // First sighting of the device in a newest-first list = its latest run.
      byDevice.set(run.device_id, {
        deviceId: run.device_id,
        deviceName: run.device_name,
        lastRunAt: run.started_at,
        lastRunFailed: run.result === "error",
        lastErrorCode: run.result === "error" ? (run.error_code ?? null) : null,
        lastSuccessAt: run.result !== "error" ? run.started_at : null,
        cliVersion: run.cli_version || null,
        os: run.os || null,
        status: "none",
      });

      continue;
    }

    if (known.lastSuccessAt == null && run.result !== "error") {
      known.lastSuccessAt = run.started_at;
    }
  }

  const rows: DeviceFreshness[] = [];
  const seen = new Set<string>();

  // Roster order first (the account device list), then any run-only devices.
  for (const device of roster) {
    seen.add(device.device_id);
    rows.push(
      byDevice.get(device.device_id) ?? {
        deviceId: device.device_id,
        deviceName: device.device_name,
        lastRunAt: null,
        lastRunFailed: false,
        lastSuccessAt: null,
        lastErrorCode: null,
        cliVersion: null,
        os: null,
        status: "none",
      },
    );
  }
  for (const row of byDevice.values()) {
    if (!seen.has(row.deviceId)) rows.push(row);
  }

  for (const row of rows) {
    row.status = freshnessStatus(
      row.lastSuccessAt == null
        ? null
        : Math.max(0, now - Date.parse(row.lastSuccessAt)),
      row.lastRunFailed,
    );
  }

  return rows;
}
