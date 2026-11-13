// Sessions view hook (desktop-plan §12.13): reads the whole session sidecar
// through the Rust bridge (falling back to its HEAD when it exceeds the 8 MiB
// whole-file cap — the sidecar is written newest-first), parses it into
// upload-ruled rows and drives the filter / page / CSV-export state. Reads are
// read-only and on-demand (mount + manual refresh); parse failures degrade to
// an empty list, never an error wall, because the sidecar is best-effort
// telemetry.

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
  sessionModelFacets,
  sessionProjectFacets,
  sessionRangeWindow,
  sessionSourceFacets,
  withSelectedFacet,
  type SessionFacet,
  type SessionRange,
  type SessionRow,
} from "@/lib/sessions";
import { saveTextAs, type SaveResult } from "@/lib/save-file";

/** Newest-first fallback window when the sidecar exceeds the 8 MiB whole-read cap. */
const SESSION_HEAD_BYTES = 512 * 1024;

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
    // Over the 8 MiB whole-file cap: fall back to the newest rows. The CLI
    // rewrites the sidecar sorted by ended_at DESC, so the newest sessions are
    // at the START of the file — reading the tail (as append-only logs need)
    // would surface the oldest ones (0.4.1 review fix).
    const message = error instanceof Error ? error.message : String(error);

    if (!message.includes("too large")) return { text: null, partial: false };
    try {
      const text = await invoke<string | null>("read_tracker_head", {
        relPath: "session.queue.jsonl",
        maxBytes: SESSION_HEAD_BYTES,
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
  /** True when only the newest head is shown (sidecar over the whole cap). */
  partial: boolean;
  rows: SessionRow[];
  /** Whole sidecar has at least one parseable row, before window / filters. */
  hasAnySessions: boolean;
  totals: ReturnType<typeof aggregateSessions>;
  /** Each facet list is computed with the *other* filters applied. */
  sourceFacets: SessionFacet[];
  projectFacets: SessionFacet[];
  modelFacets: SessionFacet[];
  range: SessionRange;
  source: string;
  project: string;
  model: string;
  offset: number;
  pageSize: number;
  page: ReturnType<typeof pageSessions>;
  /** Only explicit filters count — a preset time range is its own empty state. */
  hasNarrowingFilters: boolean;
  updatedAt: number | null;
  setRange: (range: SessionRange) => void;
  setSource: (source: string) => void;
  setProject: (project: string) => void;
  setModel: (model: string) => void;
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
  const [project, setProject] = useState("");
  const [model, setModel] = useState("");
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
    () =>
      filterSessions(rows, window.fromMs, window.toMs, {
        source,
        project,
        model,
      }),
    [rows, window.fromMs, window.toMs, source, project, model],
  );
  const totals = useMemo(() => aggregateSessions(filtered), [filtered]);
  // Faceted search: every option list sees the window plus the *other* two
  // filters, so picking a project never collapses the project list itself.
  const { fromMs, toMs } = window;
  const sourceFacets = useMemo(
    () =>
      withSelectedFacet(
        sessionSourceFacets(
          filterSessions(rows, fromMs, toMs, { project, model }),
        ),
        source,
      ),
    [rows, fromMs, toMs, project, model, source],
  );
  const projectFacets = useMemo(
    () =>
      withSelectedFacet(
        sessionProjectFacets(
          filterSessions(rows, fromMs, toMs, { source, model }),
        ),
        project,
      ),
    [rows, fromMs, toMs, source, model, project],
  );
  const modelFacets = useMemo(
    () =>
      withSelectedFacet(
        sessionModelFacets(
          filterSessions(rows, fromMs, toMs, { source, project }),
        ),
        model,
      ),
    [rows, fromMs, toMs, source, project, model],
  );
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
  const changeProject = useCallback((next: string) => {
    setProject(next);
    setOffset(0);
  }, []);
  const changeModel = useCallback((next: string) => {
    setModel(next);
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
    setProject("");
    setModel("");
    setOffset(0);
  }, []);

  const exportCsv = useCallback(
    async (deviceName: string): Promise<SaveResult> => {
      const stamp = (ms: number) => {
        const date = new Date(ms);
        const pad = (n: number) => String(n).padStart(2, "0");

        return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
      };
      // 总计 reads the whole sidecar — a 1970 start date in the name would be
      // noise, so it is spelled out instead.
      const from = range === "all" ? "all" : stamp(window.fromMs);
      const filename = `token-usage-sessions-${from}-${stamp(window.toMs - 1)}.csv`;

      return await saveTextAs(filename, buildSessionsCsv(filtered, deviceName));
    },
    [filtered, range, window.fromMs, window.toMs],
  );

  return {
    loading,
    refreshing,
    partial,
    rows,
    hasAnySessions: rows.length > 0,
    totals,
    sourceFacets,
    projectFacets,
    modelFacets,
    range,
    source,
    project,
    model,
    offset,
    pageSize,
    page,
    hasNarrowingFilters: source !== "" || project !== "" || model !== "",
    updatedAt,
    setRange: changeRange,
    setSource: changeSource,
    setProject: changeProject,
    setModel: changeModel,
    setOffset,
    setPageSize: changePageSize,
    clearFilters,
    refresh,
    exportCsv,
  };
}
