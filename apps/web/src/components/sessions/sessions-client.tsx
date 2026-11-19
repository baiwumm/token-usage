"use client";

// Sessions at /sessions (docs/ui-spec.md Sessions, M5.6). Device-level
// metadata only — the API never returns prompts, bodies, titles, absolute
// paths or resume commands, and session_id stays an internal key.
//
// Device/source filters and the server-side offset live in the URL, as
// does a custom time window (2026-10-28); preset ranges stay session-only.
// Filter changes only refetch data (replaceState + popstate sync, no
// navigation).
//
// The page is split by concern: filters.ts owns the URL contract,
// filter-bar.tsx the controls, summary-cards.tsx the totals row,
// sessions-table.tsx the list, detail-dialog.tsx the drill-down.

import { toast } from "@heroui/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { SessionDetailModal } from "./detail-dialog";
import { SessionsFilterBar } from "./filter-bar";
import {
  mergeSessionFilters,
  parseFilters,
  serializeFilters,
  type Filters,
} from "./filters";
import { SummaryCards, SummaryCardsSkeleton } from "./summary-cards";
import { SessionsTable } from "./sessions-table";

import { useSessionBootstrap } from "@/lib/auth/session-bootstrap";
import { useLocale } from "@/lib/copy/locale";
import { formatMessage } from "@/lib/copy/message";
import { SESSIONS_COPY } from "@/lib/copy/sessions";
import { useUrlFilters } from "@/lib/dashboard/url-filters";
import { loadable, type Loadable, type LoadStatus } from "@/lib/loadable";
import {
  DashboardApiError,
  exportSessionsCsv,
  fetchSessions,
  type SessionItem,
  type SessionsPayload,
} from "@/lib/dashboard/api";
import { browserTimezone, rangeForSelection } from "@/lib/dashboard/ranges";

function isUnauthorized(error: unknown): boolean {
  return error instanceof DashboardApiError && error.status === 401;
}

// The payload is only valid for the query that produced it: when the window or
// a narrowing filter changes, the previous rows must not stand in for the new
// query (an empty previous page would flash its empty state instead of the
// initial skeleton). Manual refreshes keep the same key and stay non-destructive.
type SessionsState = Loadable<SessionsPayload> & { key?: string };

export function SessionsClient() {
  const [locale] = useLocale();
  const copy = SESSIONS_COPY[locale];

  const { accessToken, redirectToLogin } = useSessionBootstrap("/sessions");
  const searchParams = useSearchParams();
  const [filters, applyFilters] = useUrlFilters<Filters>({
    basePath: "/sessions",
    parse: parseFilters,
    serialize: serializeFilters,
    merge: mergeSessionFilters,
    initialParams: searchParams,
  });
  const [state, setState] = useState<SessionsState>(loadable);
  const [facets, setFacets] = useState<SessionsPayload["facets"]>({
    sources: [],
    devices: [],
  });
  const [knownDevices, setKnownDevices] = useState<Record<string, string>>({});
  const [detail, setDetail] = useState<SessionItem | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);
  const requestId = useRef(0);

  // Custom windows carry the zone their day keys came from (heatmap deep
  // link); presets and plain visits resolve in the browser zone.
  const timezone = filters.tz || browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );
  const queryKey = useMemo(
    () =>
      `${range.fromIso}|${range.toIso}|${filters.deviceId}|${filters.source}`,
    [range.fromIso, range.toIso, filters.deviceId, filters.source],
  );
  // Rows from another query are not rendered at all, so a filter change goes
  // straight to the initial skeleton instead of the old empty state.
  const stateMatchesQuery = state.key === queryKey;
  const payload = stateMatchesQuery ? state.data : null;
  const status: LoadStatus = stateMatchesQuery ? state.status : "loading";

  const load = useCallback(
    async (token: string) => {
      const id = requestId.current + 1;
      const key = queryKey;

      requestId.current = id;
      setRefreshing(true);
      // Same query (manual refresh / paging): keep the rows and overlay a
      // spinner. New query: drop them so the initial skeleton can show.
      setState((previous) =>
        previous.key === key && previous.data != null
          ? previous
          : { status: "loading", data: null, key },
      );

      try {
        const payload = await fetchSessions(token, {
          fromIso: range.fromIso,
          toIso: range.toIso,
          deviceId: filters.deviceId || null,
          source: filters.source || null,
          limit: filters.pageSize,
          offset: filters.offset,
        });

        if (requestId.current !== id) return;
        setState({ status: "ready", data: payload, key });
        setRefreshing(false);
        setLastUpdatedAt(Date.now());
        setFacets(payload.facets);
        setKnownDevices((previous) => {
          const next = { ...previous };

          for (const device of payload.facets.devices) {
            next[device.device_id] = device.device_name;
          }

          return next;
        });
      } catch (error) {
        if (requestId.current !== id) return;
        if (isUnauthorized(error)) {
          // The login redirect returns early, so the refresh overlay must be
          // cleared here too — otherwise the Spinner stays on top of the old
          // page while the navigation settles (mirrors wrapped-client).
          setRefreshing(false);
          redirectToLogin();

          return;
        }
        // A failed refresh of the same query keeps the previous page on screen
        // and flags it as stale; a failure for a new query has no valid rows to
        // keep, so it falls through to the full error state.
        setState((previous) => ({
          status: "error",
          data: previous.key === key ? previous.data : null,
          key,
        }));
        setRefreshing(false);
      }
    },
    [
      filters.deviceId,
      filters.offset,
      filters.pageSize,
      filters.source,
      queryKey,
      range.fromIso,
      range.toIso,
      redirectToLogin,
    ],
  );

  useEffect(() => {
    if (!accessToken) return;
    void load(accessToken);
  }, [accessToken, load]);

  // Filters can shrink the result set below the current page; snap back to
  // the last valid page instead of showing an empty page.
  useEffect(() => {
    if (status !== "ready" || !payload) return;
    const { total, offset } = payload;

    if (total === 0 && offset > 0) {
      applyFilters({ offset: 0 });

      return;
    }
    if (total > 0 && offset >= total) {
      applyFilters({
        offset: Math.floor((total - 1) / filters.pageSize) * filters.pageSize,
      });
    }
  }, [status, payload, applyFilters, filters.pageSize]);

  const retry = useCallback(() => {
    if (accessToken) void load(accessToken);
  }, [accessToken, load]);

  const exportCsv = useCallback(async () => {
    if (!accessToken || exporting) return;

    setExporting(true);
    try {
      const result = await exportSessionsCsv(accessToken, {
        fromIso: range.fromIso,
        toIso: range.toIso,
        deviceId: filters.deviceId || null,
        source: filters.source || null,
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = result.filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Firefox needs the object URL alive until the download starts.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (result.truncated) {
        toast(
          formatMessage(copy.exportTruncated, locale, {
            total: result.total,
            count: result.exported,
          }),
        );
      } else {
        toast.success(
          formatMessage(copy.exported, locale, { count: result.exported }),
        );
      }
    } catch (error) {
      if (isUnauthorized(error)) {
        redirectToLogin();

        return;
      }
      toast(copy.exportFailed);
    } finally {
      setExporting(false);
    }
  }, [
    accessToken,
    copy.exportFailed,
    copy.exportTruncated,
    copy.exported,
    exporting,
    filters.deviceId,
    filters.source,
    locale,
    range.fromIso,
    range.toIso,
    redirectToLogin,
  ]);

  // Preset time ranges are not "filters": an empty window gets its own
  // "view all" state, while explicit filters get "clear filters" (ui-spec).
  const hasTimeWindow =
    filters.range !== "all" || Boolean(filters.from) || Boolean(filters.to);
  const hasNarrowingFilters =
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.deviceId) ||
    Boolean(filters.source);

  const clearFilters = useCallback(() => {
    applyFilters({
      range: "all",
      from: "",
      to: "",
      tz: "",
      deviceId: "",
      source: "",
    });
  }, [applyFilters]);

  const deviceOptions = useMemo(() => {
    const list = [...facets.devices];

    if (
      filters.deviceId &&
      !list.some((device) => device.device_id === filters.deviceId)
    ) {
      list.unshift({
        device_id: filters.deviceId,
        device_name: knownDevices[filters.deviceId] ?? filters.deviceId,
        sessions: 0,
      });
    }

    return list;
  }, [facets.devices, filters.deviceId, knownDevices]);

  const sourceOptions = useMemo(() => {
    const list = [...facets.sources];

    if (
      filters.source &&
      !list.some((entry) => entry.source === filters.source)
    ) {
      list.unshift({ source: filters.source, sessions: 0 });
    }

    return list;
  }, [facets.sources, filters.source]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <SessionsFilterBar
        canExport={(payload?.total ?? 0) > 0}
        copy={copy}
        deviceOptions={deviceOptions}
        exporting={exporting}
        filters={filters}
        lastUpdatedAt={lastUpdatedAt}
        loading={status === "loading"}
        locale={locale}
        refreshing={refreshing}
        sourceOptions={sourceOptions}
        onApply={applyFilters}
        onExport={() => void exportCsv()}
        onRetry={retry}
      />

      <div className="flex flex-col gap-5">
        {status === "loading" && !payload ? (
          <SummaryCardsSkeleton copy={copy} />
        ) : null}

        {payload ? <SummaryCards copy={copy} payload={payload} /> : null}

        <SessionsTable
          copy={copy}
          hasNarrowingFilters={hasNarrowingFilters}
          hasTimeWindow={hasTimeWindow}
          locale={locale}
          offset={filters.offset}
          pageSize={filters.pageSize}
          payload={payload}
          refreshing={refreshing}
          status={status}
          timezone={timezone}
          onClearFilters={clearFilters}
          onOffsetChange={(offset) => applyFilters({ offset })}
          onPageSizeChange={(pageSize, offset) =>
            applyFilters({ pageSize, offset })
          }
          onRetry={retry}
          onViewDetail={setDetail}
        />
      </div>

      <SessionDetailModal
        copy={copy}
        session={detail}
        timezone={timezone}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </main>
  );
}
