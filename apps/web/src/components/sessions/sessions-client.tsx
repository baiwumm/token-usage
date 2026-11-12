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
import { loadable, type Loadable } from "@/lib/loadable";
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
  const [state, setState] = useState<Loadable<SessionsPayload>>(loadable);
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

  const timezone = browserTimezone();
  const range = useMemo(
    () => rangeForSelection(filters.range, timezone, filters.from, filters.to),
    [filters.range, filters.from, filters.to, timezone],
  );

  const load = useCallback(
    async (token: string) => {
      const id = requestId.current + 1;

      requestId.current = id;
      setRefreshing(true);
      setState((previous) =>
        previous.data == null ? { status: "loading", data: null } : previous,
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
        setState({ status: "ready", data: payload });
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
      filters.source,
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

  const hasNarrowingFilters =
    filters.range !== "all" ||
    Boolean(filters.from) ||
    Boolean(filters.to) ||
    Boolean(filters.deviceId) ||
    Boolean(filters.source);

  const clearFilters = useCallback(() => {
    applyFilters({
      range: "all",
      from: "",
      to: "",
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

  const payload = state.data;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <SessionsFilterBar
        canExport={(payload?.total ?? 0) > 0}
        copy={copy}
        deviceOptions={deviceOptions}
        exporting={exporting}
        filters={filters}
        lastUpdatedAt={lastUpdatedAt}
        loading={state.status === "loading"}
        locale={locale}
        refreshing={refreshing}
        sourceOptions={sourceOptions}
        onApply={applyFilters}
        onExport={() => void exportCsv()}
        onRetry={retry}
      />

      <div className="flex flex-col gap-5">
        {state.status === "loading" && !payload ? (
          <SummaryCardsSkeleton copy={copy} />
        ) : null}

        {payload ? <SummaryCards copy={copy} payload={payload} /> : null}

        <SessionsTable
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
          onViewDetail={setDetail}
        />
      </div>

      <SessionDetailModal
        copy={copy}
        session={detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      />
    </main>
  );
}
