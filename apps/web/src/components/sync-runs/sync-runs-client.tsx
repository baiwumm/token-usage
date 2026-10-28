"use client";

// Sync runs at /sync-runs (docs/cli-contract.md §2.12). One row per collector
// sync — empty runs included, doubling as the collector's heartbeat. Aggregate
// telemetry only: counters, enums and versions, never paths or titles.
//
// Device/trigger/result filters and the server-side offset live in the URL;
// the time range is session-only (mirrors sessions, 2026-10-26). Filter
// changes only refetch data (replaceState + popstate sync, no navigation).
//
// The page is split by concern: filters.ts owns the URL contract,
// filter-bar.tsx the controls, summary-cards.tsx the today/last-run row,
// runs-table.tsx the list (with run-cells.tsx for its two composite cells).

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SyncRunsFilterBar } from "./filter-bar";
import {
  mergeSyncRunFilters,
  parseFilters,
  serializeFilters,
  type Filters,
} from "./filters";
import { SyncRunsTable } from "./runs-table";
import { SummaryCards, SummaryCardsSkeleton } from "./summary-cards";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { SYNC_RUNS_COPY } from "@/lib/copy/sync-runs";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable } from "@/lib/loadable";
import {
  DashboardApiError,
  fetchAccountDevices,
  fetchSyncRuns,
  type SyncRunsPayload,
} from "@/lib/dashboard/api";
import {
  browserTimezone,
  rangeForPreset,
  rangeForSelection,
} from "@/lib/dashboard/ranges";

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

export function SyncRunsClient() {
  const [locale] = useLocale();
  const copy = SYNC_RUNS_COPY[locale];

  const { accessToken, redirectToLogin } = useSessionBootstrap("/sync-runs");
  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/sync-runs",
    parse: parseFilters,
    serialize: serializeFilters,
    merge: mergeSyncRunFilters,
  });
  const [state, setState] = useState<Loadable<SyncRunsPayload>>(loadable);
  const [todayState, setTodayState] =
    useState<Loadable<SyncRunsPayload>>(loadable);
  const [lastRunAt, setLastRunAt] = useState<string | null>(null);
  const [knownDevices, setKnownDevices] = useState<Record<string, string>>({});
  const [accountDevices, setAccountDevices] = useState<
    Array<{ device_id: string; device_name: string }>
  >([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  const timezone = browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );
  const todayRange = useMemo(
    () => rangeForPreset("today", timezone),
    [timezone],
  );

  const load = useCallback(
    async (token: string) => {
      const id = requestId.current + 1;

      requestId.current = id;
      setRefreshing(true);
      setState((previous) =>
        previous.data == null ? { status: "loading", data: null } : previous,
      );
      setTodayState((previous) =>
        previous.data == null ? { status: "loading", data: null } : previous,
      );

      try {
        // The today block and the device facet ride along on every load —
        // small payloads, and keeping them parallel keeps the code flat.
        const [payload, todayPayload, devices] = await Promise.all([
          fetchSyncRuns({
            fromIso: range.fromIso,
            toIso: range.toIso,
            deviceId: filters.deviceId || null,
            trigger: filters.trigger || null,
            result: filters.result || null,
            limit: filters.pageSize,
            offset: filters.offset,
          }),
          fetchSyncRuns({
            fromIso: todayRange.fromIso,
            toIso: todayRange.toIso,
          }),
          fetchAccountDevices(token, {
            from: range.fromDay,
            to: range.toDay,
          }),
        ]);

        if (requestId.current !== id) return;
        setState({ status: "ready", data: payload });
        setTodayState({ status: "ready", data: todayPayload });
        setRefreshing(false);
        setLastUpdatedAt(Date.now());
        setAccountDevices(
          (devices.devices ?? []).map((device) => ({
            device_id: device.id,
            device_name: device.device_name,
          })),
        );

        // "Last run": today's newest row, else the newest run of the past
        // week (one tiny probe so the card stays honest on quiet days).
        if (todayPayload.totals.runs > 0) {
          setLastRunAt(todayPayload.runs[0]?.started_at ?? null);
        } else {
          const week = await fetchSyncRuns({
            fromIso: rangeForPreset("7d", timezone).fromIso,
            toIso: todayRange.toIso,
            limit: 1,
          });

          if (requestId.current !== id) return;
          setLastRunAt(week.runs[0]?.started_at ?? null);
        }

        setKnownDevices((previous) => {
          const next = { ...previous };

          for (const run of payload.runs) {
            next[run.device_id] = run.device_name;
          }

          return next;
        });
      } catch (error) {
        if (requestId.current !== id) return;
        if (isUnauthorized(error)) {
          redirectToLogin();

          return;
        }
        // A failed refresh keeps the previous page on screen and flags it as
        // stale (DataTableCard shows the error bar); only an empty slot falls
        // through to the full error state.
        setState((previous) => ({ status: "error", data: previous.data }));
        setRefreshing(false);
      }
    },
    [
      filters.deviceId,
      filters.offset,
      filters.pageSize,
      filters.result,
      filters.trigger,
      range.fromDay,
      range.fromIso,
      range.toDay,
      range.toIso,
      redirectToLogin,
      todayRange,
      timezone,
    ],
  );

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken, load]);

  // Filters can shrink the result set below the current page; snap back to
  // the last valid page instead of showing an empty page.
  useEffect(() => {
    if (state.status !== "ready" || !state.data) return;
    const { total, offset } = state.data;

    if (total === 0 && offset > 0) {
      applyFilters({ offset: 0 });

      return;
    }
    if (total > 0 && offset >= total) {
      applyFilters({
        offset: Math.floor((total - 1) / filters.pageSize) * filters.pageSize,
      });
    }
  }, [state, applyFilters, filters.pageSize]);

  const retry = useCallback(() => {
    if (accessToken) void load(accessToken);
  }, [accessToken, load]);

  const hasNarrowingFilters =
    filters.range !== "30d" ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.deviceId) ||
    Boolean(filters.trigger) ||
    Boolean(filters.result);

  const clearFilters = useCallback(() => {
    applyFilters({
      range: "30d",
      from: "",
      to: "",
      deviceId: "",
      trigger: "",
      result: "",
    });
  }, [applyFilters]);

  const deviceOptions = useMemo(() => {
    const byId = new Map<string, { device_id: string; device_name: string }>();

    for (const device of accountDevices) {
      byId.set(device.device_id, device);
    }
    for (const [deviceId, deviceName] of Object.entries(knownDevices)) {
      if (!byId.has(deviceId)) {
        byId.set(deviceId, { device_id: deviceId, device_name: deviceName });
      }
    }

    const list = [...byId.values()];

    if (
      filters.deviceId &&
      !list.some((device) => device.device_id === filters.deviceId)
    ) {
      list.unshift({
        device_id: filters.deviceId,
        device_name: knownDevices[filters.deviceId] ?? filters.deviceId,
      });
    }

    return list;
  }, [accountDevices, filters.deviceId, knownDevices]);

  const payload = state.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <SyncRunsFilterBar
        copy={copy}
        deviceOptions={deviceOptions}
        filters={filters}
        hasNarrowingFilters={hasNarrowingFilters}
        lastUpdatedAt={lastUpdatedAt}
        loading={state.status === "loading"}
        locale={locale}
        range={range}
        refreshing={refreshing}
        timezone={timezone}
        onApply={applyFilters}
        onClear={clearFilters}
        onRetry={retry}
      />

      <div className="flex flex-col gap-5">
        {state.status === "loading" && !payload ? (
          <SummaryCardsSkeleton copy={copy} />
        ) : null}

        {todayState.data ? (
          <SummaryCards
            copy={copy}
            lastRunAt={lastRunAt}
            todayRuns={todayState.data}
          />
        ) : null}

        <SyncRunsTable
          copy={copy}
          hasNarrowingFilters={hasNarrowingFilters}
          locale={locale}
          offset={filters.offset}
          pageSize={filters.pageSize}
          payload={payload}
          refreshing={refreshing}
          status={state.status}
          onClearFilters={clearFilters}
          onOffsetChange={(offset) => applyFilters({ offset })}
          onPageSizeChange={(pageSize, offset) =>
            applyFilters({ pageSize, offset })
          }
          onRetry={retry}
        />
      </div>
    </main>
  );
}
