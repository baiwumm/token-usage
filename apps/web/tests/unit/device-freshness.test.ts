// Unit tests for the sync-runs freshness strip rules (device-freshness.ts):
// recency thresholds (24h green / 7d red), the failed-run override, the
// partial-counts-as-success rule and the roster merge for silent devices.

import { describe, expect, it } from "vitest";

import {
  buildDeviceFreshness,
  freshnessStatus,
  FRESH_OK_MAX_MS,
  FRESH_STALLED_MIN_MS,
} from "@/components/sync-runs/device-freshness";
import type { SyncRunItem } from "@/lib/dashboard/api";

const NOW = Date.parse("2026-11-07T12:00:00.000Z");

function run(overrides: Partial<SyncRunItem>): SyncRunItem {
  return {
    device_id: "device-a",
    device_name: "Work PC",
    run_id: "run-1",
    started_at: "2026-11-07T11:00:00.000Z",
    ended_at: "2026-11-07T11:00:05.000Z",
    duration_ms: 5000,
    trigger: "scheduled",
    result: "ok",
    error_code: null,
    empty: false,
    parsed_files: 3,
    buckets_uploaded: 3,
    tokens_ingested: 1000,
    credits_ingested: 0,
    sessions_uploaded: 1,
    sessions_skipped: 0,
    queue_bytes: 128,
    cli_version: "0.5.1",
    os: "win32",
    ...overrides,
  };
}

describe("freshnessStatus thresholds", () => {
	it("keeps silence within a day green (machines sleep overnight)", () => {
		expect(freshnessStatus(0, false)).toBe("ok");
		expect(freshnessStatus(FRESH_OK_MAX_MS, false)).toBe("ok");
	});

	it("flags a day-to-week gap as lagging, past a week as stalled", () => {
		expect(freshnessStatus(FRESH_OK_MAX_MS + 1, false)).toBe("lagging");
		expect(freshnessStatus(FRESH_STALLED_MIN_MS, false)).toBe("lagging");
		expect(freshnessStatus(FRESH_STALLED_MIN_MS + 1, false)).toBe("stalled");
	});

	it("has no verdict without a success", () => {
		expect(freshnessStatus(null, false)).toBe("none");
	});

	it("a failed latest run wins over any recency", () => {
		expect(freshnessStatus(0, true)).toBe("failing");
		expect(freshnessStatus(FRESH_STALLED_MIN_MS + 1, true)).toBe("failing");
	});
});

describe("buildDeviceFreshness", () => {
	it("takes the latest fields from the first sighting of a desc-sorted list", () => {
		const rows = buildDeviceFreshness(
			[
				run({
					run_id: "run-new",
					started_at: "2026-11-07T11:00:00.000Z",
					result: "error",
					error_code: "ingest_500",
					cli_version: "0.5.1",
					os: "win32",
				}),
				run({
					run_id: "run-old",
					started_at: "2026-11-07T10:00:00.000Z",
					result: "ok",
					cli_version: "0.5.0",
				}),
			],
			[{ device_id: "device-a", device_name: "Work PC" }],
			NOW,
		);

		expect(rows).toHaveLength(1);
		expect(rows[0].lastRunAt).toBe("2026-11-07T11:00:00.000Z");
		expect(rows[0].lastRunFailed).toBe(true);
		expect(rows[0].lastErrorCode).toBe("ingest_500");
		// The success before the failure still anchors the freshness line.
		expect(rows[0].lastSuccessAt).toBe("2026-11-07T10:00:00.000Z");
		expect(rows[0].cliVersion).toBe("0.5.1");
		expect(rows[0].status).toBe("failing");
	});

	it("counts partial runs as success", () => {
		const rows = buildDeviceFreshness(
			[run({ result: "partial" })],
			[{ device_id: "device-a", device_name: "Work PC" }],
			NOW,
		);

		expect(rows[0].lastSuccessAt).toBe("2026-11-07T11:00:00.000Z");
		expect(rows[0].status).toBe("ok");
	});

	it("keeps roster devices without runs visible as none", () => {
		const rows = buildDeviceFreshness(
			[],
			[
				{ device_id: "device-a", device_name: "Work PC" },
				{ device_id: "device-b", device_name: "Home PC" },
			],
			NOW,
		);

		expect(rows).toHaveLength(2);
		expect(rows.every((row) => row.status === "none")).toBe(true);
		expect(rows[1].deviceName).toBe("Home PC");
	});

	it("appends run-only devices after the roster", () => {
		const rows = buildDeviceFreshness(
			[run({ device_id: "device-x", device_name: "Stray" })],
			[{ device_id: "device-a", device_name: "Work PC" }],
			NOW,
		);

		expect(rows.map((row) => row.deviceId)).toEqual(["device-a", "device-x"]);
	});

	it("clamps clock skew so a future timestamp never reads negative", () => {
		const rows = buildDeviceFreshness(
			[run({ started_at: "2026-11-07T13:00:00.000Z" })],
			[{ device_id: "device-a", device_name: "Work PC" }],
			NOW,
		);

		expect(rows[0].status).toBe("ok");
	});
});
