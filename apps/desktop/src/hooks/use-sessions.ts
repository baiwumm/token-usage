// Sessions view hook (desktop-plan §12.13): reads the whole session sidecar
// through the Rust bridge (unlike the monitor's 512 KiB tail — the list needs
// full 90-day windows), parses it into upload-ruled rows and drives the
// filter / page / CSV-export state. Reads are read-only and on-demand (mount
// + manual refresh); parse failures degrade to an empty list, never an error
// wall, because the sidecar is best-effort telemetry.

import { invoke } from "@tauri-apps/api/core";
import { useCallback, useMemo, useState } from "react";

import {
  DEFAULT_PAGE_SIZE,
  PAGE_SIZE_OPTIONS,
  aggregateSessions,
  buildSessionsCsv,
  filterSessions,
  pageSessions,
  parseSessionRows,
  sessionRangeWindow,
  sessionSourceFacets,
  type SessionRange,
  type SessionRow,
} from "@/lib/sessions";
import { saveTextAs, type SaveResult } from "@/lib/save-file";

/** Same cap as the monitor's tail read — the too-large fallback window. */
const SESSION_TAIL_BYTES = 512 * 1024;

async function readWholeSidecar(): Promise<{
  text: string | null;
  partial: boolean;
}> {
  try {
    const text = await invoke<string | null>("read_tracker_file", {
      relPath: "session.queue.jsonl",
    });

    return { text: text ?? null, partial: false };
  } catch (error) {
    // Over the 8 MiB whole-file cap: fall back to the newest tail and flag
    // the list as partial rather than losing the view entirely.
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("too large")) return { text: null, partial: false };
    try {
      const text = await invoke<string | null>("read_tracker_tail", {
        relPath: "session.queue.jsonl",
        maxBytes: SESSION_TAIL_BYTES,
      });

      return { text: text ?? null, partial: true };
    } catch {
      return { text: null, partial: false };
    }
  }
}

export interface SessionsState {
  loading: boolean;
  refreshing: boolean;
  /** True when only the newest tail is shown (sidecar over the whole cap). */
  partial: boolean;
  rows: SessionRow[];
  totals: ReturnType<typeof aggregateSessions>;
  facets: ReturnType<typeof sessionSourceFacets>;
  range: SessionRange;
  source: string;
  offset: number;
  pageSize: number;
  page: ReturnType<typeof pageSessions>;
  hasNarrowingFilters: boolean;
  updatedAt: number | null;
  setRange: (range: SessionRange) => void;
  setSource: (source: string) => void;
  setOffset: (offset: number) => void;
  setPageSize: (pageSize: number) => void;
  clearFilters: () => void;
  refresh: () => Promise<void>;
  exportCsv: (deviceName: string) => Promise<SaveResult>;
}

export function useSessions(): SessionsState {
  const [rows, setRows] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [partial, setPartial] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [range, setRange] = useState<SessionRange>("today");
  const [source, setSource] = useState("");
  const [offset, setOffset] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const { text, partial: tailOnly } = await readWholeSidecar();
      const parsed = parseSessionRows(text);

      setRows(parsed);
      setPartial(tailOnly);
      setUpdatedAt(Date.now());
    } finally {
      setRefreshing(false);
      setLoading(false);
    }
  }, []);

  const window = useMemo(() => sessionRangeWindow(range), [range]);
  const filtered = useMemo(
    () => filterSessions(rows, window.fromMs, window.toMs, source),
    [rows, window.fromMs, window.toMs, source],
  );
  const totals = useMemo(() => aggregateSessions(filtered), [filtered]);
  const facets = useMemo(() => sessionSourceFacets(filtered), [filtered]);
  // Any filter change restarts paging unless the patch is the page itself.
  const page = useMemo(
    () => pageSessions(filtered, offset, pageSize),
    [filtered, offset, pageSize],
  );

  const changeRange = useCallback((next: SessionRange) => {
    setRange(next);
    setOffset(0);
  }, []);
  const changeSource = useCallback((next: string) => {
    setSource(next);
    setOffset(0);
  }, []);
  const changePageSize = useCallback((next: number) => {
    if (!PAGE_SIZE_OPTIONS.includes(next)) return;
    setPageSize(next);
    setOffset(0);
  }, []);
  const clearFilters = useCallback(() => {
    setRange("today");
    setSource("");
    setOffset(0);
  }, []);

  const exportCsv = useCallback(
    async (deviceName: string): Promise<SaveResult> => {
      const stamp = (ms: number) => {
        const date = new Date(ms);
        const pad = (n: number) => String(n).padStart(2, "0");

        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
      };
      const filename = `token-usage-sessions-${stamp(window.fromMs)}-${stamp(window.toMs - 1)}.csv`;

      return await saveTextAs(filename, buildSessionsCsv(filtered, deviceName));
    },
    [filtered, window.fromMs, window.toMs],
  );

  return {
    loading,
    refreshing,
    partial,
    rows,
    totals,
    facets,
    range,
    source,
    offset,
    pageSize,
    page,
    hasNarrowingFilters: range !== "today" || source !== "",
    updatedAt,
    setRange: changeRange,
    setSource: changeSource,
    setOffset,
    setPageSize: changePageSize,
    clearFilters,
    refresh,
    exportCsv,
  };
}
