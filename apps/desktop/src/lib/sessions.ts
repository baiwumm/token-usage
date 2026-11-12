// Sessions view data layer (desktop-plan §12.13, web /sessions 移植轮): parses
// the CLI's local session sidecar (`session.queue.jsonl`) into the row shape
// the sessions page shows, applies the same admission rules as the CLI's
// upload mapping (session-upload.js mapSessionRow) so the local list matches
// the cloud page, and aggregates / paginates / exports locally.
//
// Privacy: only metadata fields survive parsing — the sidecar's title, the
// raw cwd (`project_ref`), resume identifiers and cache keys are dropped
// here and never reach the UI. Cost is the web sessions 口径: read-time
// per-model pricing at peak rates (no hour context on a session row, so
// DeepSeek off-peak does not apply — contract §2.11 注记), summed over the
// per-model rows.

import { computeRowCost } from "@/lib/pricing";

export interface SessionModelUsage {
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
}

export interface SessionRow {
  /** Stable identity: vendor `session_id`, else the 24-hex `session_hash`. */
  id: string;
  source: string;
  /** Basename only — the raw cwd (`project_ref`) never survives parsing. */
  projectKey: string;
  startedAt: string;
  endedAt: string;
  /** `ended_at − started_at` wall clock (web sessions 口径, not the
   *  collector's active-ms figure). */
  durationMs: number;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
  reasoningOutputTokens: number;
  totalTokens: number;
  /** Display-only vendor credits (0 when the source has none). */
  credits: number;
  /** Read-time peak-pricing estimate summed over the model rows. */
  costUsd: number;
  models: SessionModelUsage[];
}

/** Presets mirror the usage header (2026-11-12: 90D replaced by 总计). */
export type SessionRange = "today" | "7d" | "30d" | "all";

export const SESSION_RANGE_PRESETS: readonly SessionRange[] = [
  "today",
  "7d",
  "30d",
  "all",
];

export const DEFAULT_PAGE_SIZE = 20;
export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export const CSV_COLUMNS = [
  "ended_at",
  "started_at",
  "source",
  "project_key",
  "device_name",
  "duration_ms",
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
  "billable_total_tokens",
  "credits",
  "total_cost_usd",
  "models",
] as const;

/** Account-level sources the cloud page never shows (contract §2.4). */
const ACCOUNT_LEVEL_SOURCES = new Set(["cursor", "trae-cn"]);
const COUNTER_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
] as const;

/** CSV export cap — the wire's own 10,000-row ceiling, kept for parity. */
const MAX_SESSIONS = 10_000;

function safeInt(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);

  return Number.isSafeInteger(n) && n >= 0 ? n : null;
}

// Counter field locations on a sidecar row: session rows nest the five
// counters under `tokens` (top level mirrors `total_tokens` only), while
// `model_usage` rows carry them flat. Both shapes admit the same fold.
function readTokenCounters(
  row: Record<string, unknown>,
): Omit<SessionModelUsage, "model"> | null {
  const nested =
    row.tokens !== null &&
    typeof row.tokens === "object" &&
    !Array.isArray(row.tokens)
      ? (row.tokens as Record<string, unknown>)
      : {};
  const counters = {} as Record<(typeof COUNTER_FIELDS)[number], number>;

  for (const field of COUNTER_FIELDS) {
    const raw = nested[field] ?? row[field];
    const value = safeInt(raw === undefined || raw === null ? 0 : raw);

    if (value === null) return null;
    counters[field] = value;
  }
  const total = safeInt(
    row.total_tokens === undefined || row.total_tokens === null
      ? 0
      : row.total_tokens,
  );

  if (total === null) return null;
  const entry = {
    inputTokens: counters.input_tokens,
    cachedInputTokens: counters.cached_input_tokens,
    cacheCreationInputTokens: counters.cache_creation_input_tokens,
    outputTokens: counters.output_tokens,
    reasoningOutputTokens: counters.reasoning_output_tokens,
    totalTokens: total,
  };

  foldReasoningIntoOutput(entry);

  const identity =
    entry.inputTokens +
    entry.cachedInputTokens +
    entry.cacheCreationInputTokens +
    entry.outputTokens;

  if (entry.totalTokens !== identity) return null;

  return entry;
}

// zcode/opencode report reasoning outside output_tokens (vendor semantics:
// total = identity + reasoning), but the contract identity folds it inside
// output. Verbatim CLI upload rule: absorb reasoning into output only when
// total ≠ identity but total = identity + reasoning; total itself never
// moves. Vendors that already include reasoning in output have
// total === identity, so the fold is a no-op for them.
function foldReasoningIntoOutput(
  tokens: Omit<SessionModelUsage, "model">,
): void {
  const identity =
    tokens.inputTokens +
    tokens.cachedInputTokens +
    tokens.cacheCreationInputTokens +
    tokens.outputTokens;

  if (
    tokens.totalTokens !== identity &&
    tokens.totalTokens === identity + tokens.reasoningOutputTokens
  ) {
    tokens.outputTokens += tokens.reasoningOutputTokens;
  }
}

function basenameKey(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().replace(/[\\/]+$/, "");

  if (!trimmed || trimmed === "." || trimmed === "..") return "";
  const base = trimmed.split(/[\\/]/).pop() ?? "";

  return base === "." || base === ".." ? "" : base;
}

function readModels(row: Record<string, unknown>): SessionModelUsage[] {
  const usageRows = Array.isArray(row.model_usage) ? row.model_usage : [];
  let valid = usageRows.length > 0 && usageRows.length <= 32;
  const models: SessionModelUsage[] = [];
  let sum = 0;

  if (valid) {
    for (const usage of usageRows) {
      if (usage === null || typeof usage !== "object" || Array.isArray(usage)) {
        valid = false;
        break;
      }
      const source = usage as Record<string, unknown>;
      const model =
        typeof source.model === "string" && source.model.trim()
          ? source.model.trim()
          : "unknown";
      const entry = readTokenCounters(source);

      if (!entry) {
        valid = false;
        break;
      }
      sum += entry.totalTokens;
      models.push({ model, ...entry });
    }
    if (valid) {
      const total = safeInt(row.total_tokens) ?? -1;

      if (sum !== total) valid = false;
    }
  }

  return valid ? models : [];
}

function sessionCostUsd(source: string, models: SessionModelUsage[]): number {
  let cost = 0;

  for (const model of models) {
    cost += computeRowCost({
      source,
      model: model.model,
      input_tokens: model.inputTokens,
      cached_input_tokens: model.cachedInputTokens,
      cache_creation_input_tokens: model.cacheCreationInputTokens,
      output_tokens: model.outputTokens,
      reasoning_output_tokens: model.reasoningOutputTokens,
      // No `hour_start`: isDeepSeekOffPeak sees NaN and stays on peak rates —
      // exactly the web sessions caliber (contract §2.11 计价口径注记).
    });
  }

  return cost;
}

/** Parse sidecar JSONL text into deduped, upload-ruled session rows. */
export function parseSessionRows(text: string | null): SessionRow[] {
  if (text === null || text === "") return [];

  const byId = new Map<string, SessionRow>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);

      if (parsed === null || typeof parsed !== "object") continue;
      const row = parsed as Record<string, unknown>;
      const source = String(row.source ?? "")
        .trim()
        .toLowerCase();

      if (!source || ACCOUNT_LEVEL_SOURCES.has(source)) continue;
      const sessionId =
        typeof row.session_id === "string" && row.session_id.trim()
          ? row.session_id.trim()
          : typeof row.session_hash === "string" && row.session_hash.trim()
            ? row.session_hash.trim()
            : null;

      if (!sessionId) continue;
      const startedMs = Date.parse(String(row.started_at ?? ""));
      const endedMs = Date.parse(String(row.ended_at ?? ""));

      if (!Number.isFinite(startedMs) || !Number.isFinite(endedMs)) continue;
      if (endedMs < startedMs) continue;
      const tokens = readTokenCounters(row);

      if (!tokens) continue;
      const models = readModels(row);
      const creditsRaw = Number(row.credits);
      const credits =
        Number.isFinite(creditsRaw) && creditsRaw > 0
          ? Math.round(creditsRaw * 1e6) / 1e6
          : 0;
      const next: SessionRow = {
        id: sessionId,
        source,
        projectKey: basenameKey(row.project_key ?? row.project_ref),
        startedAt: new Date(startedMs).toISOString(),
        endedAt: new Date(endedMs).toISOString(),
        durationMs: endedMs - startedMs,
        ...tokens,
        credits,
        costUsd: sessionCostUsd(source, models),
        models,
      };
      const current = byId.get(sessionId);

      if (current && Date.parse(current.endedAt) >= endedMs) continue;
      byId.set(sessionId, next);
    } catch {
      // Torn tail write or foreign content — the view stays best-effort.
      continue;
    }
  }

  // The cloud page sorts `ended_at` desc, ties by `source` then `session_id`
  // ascending (contract §2.11); the local list mirrors that order.
  return [...byId.values()].sort(
    (first, second) =>
      Date.parse(second.endedAt) - Date.parse(first.endedAt) ||
      first.source.localeCompare(second.source) ||
      first.id.localeCompare(second.id),
  );
}

export interface SessionsTotals {
  sessions: number;
  totalTokens: number;
  totalCostUsd: number;
  credits: number;
  durationMs: number;
}

/** Facet filters of the sessions bar; empty string = "全部". */
export interface SessionFilters {
  source?: string;
  project?: string;
  model?: string;
}

/** Inclusive `from`, exclusive `to` — the wire's half-open `[from, to)` window. */
export function filterSessions(
  rows: SessionRow[],
  fromMs: number,
  toMs: number,
  filters: SessionFilters = {},
): SessionRow[] {
  const source = filters.source ?? "";
  const project = filters.project ?? "";
  const model = filters.model ?? "";

  return rows.filter((row) => {
    const endedMs = Date.parse(row.endedAt);

    if (endedMs < fromMs || endedMs >= toMs) return false;
    if (source !== "" && row.source !== source) return false;
    if (project !== "" && row.projectKey !== project) return false;
    if (model !== "" && !row.models.some((entry) => entry.model === model)) {
      return false;
    }

    return true;
  });
}

/**
 * Day-granular preset windows like the web: `[startOfDay(today−N+1), tomorrow)`.
 * 总计 spans everything the sidecar holds, so it starts at the epoch.
 */
export function sessionRangeWindow(
  range: SessionRange,
  nowMs: number = Date.now(),
): { fromMs: number; toMs: number } {
  const day = new Date(nowMs);

  day.setHours(0, 0, 0, 0);
  const dayStart = day.getTime();
  const days = range === "today" ? 1 : range === "7d" ? 7 : 30;

  return {
    fromMs: range === "all" ? 0 : dayStart - (days - 1) * 86_400_000,
    toMs: dayStart + 86_400_000,
  };
}

export function aggregateSessions(rows: SessionRow[]): SessionsTotals {
  let totalTokens = 0;
  let totalCostUsd = 0;
  let credits = 0;
  let durationMs = 0;

  for (const row of rows) {
    totalTokens += row.totalTokens;
    totalCostUsd += row.costUsd;
    credits += row.credits;
    durationMs += row.durationMs;
  }

  return {
    sessions: rows.length,
    totalTokens,
    totalCostUsd,
    credits,
    durationMs,
  };
}

/** One select option: the facet key plus how many sessions it covers. */
export interface SessionFacet {
  key: string;
  sessions: number;
}

function sortFacets(counts: Map<string, number>): SessionFacet[] {
  return [...counts.entries()]
    .map(([key, sessions]) => ({ key, sessions }))
    .sort(
      (first, second) =>
        second.sessions - first.sessions || first.key.localeCompare(second.key),
    );
}

/** Distinct sources of the window, `sessions` desc then id (facet order). */
export function sessionSourceFacets(rows: SessionRow[]): SessionFacet[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    counts.set(row.source, (counts.get(row.source) ?? 0) + 1);
  }

  return sortFacets(counts);
}

/** Distinct project basenames (rows without a project never facet). */
export function sessionProjectFacets(rows: SessionRow[]): SessionFacet[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.projectKey === "") continue;
    counts.set(row.projectKey, (counts.get(row.projectKey) ?? 0) + 1);
  }

  return sortFacets(counts);
}

/** Models the window touched; a session counts once per model it used. */
export function sessionModelFacets(rows: SessionRow[]): SessionFacet[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    for (const model of new Set(row.models.map((entry) => entry.model))) {
      if (model === "") continue;
      counts.set(model, (counts.get(model) ?? 0) + 1);
    }
  }

  return sortFacets(counts);
}

export interface SessionsPage {
  rows: SessionRow[];
  total: number;
  offset: number;
}

export function pageSessions(
  rows: SessionRow[],
  offset: number,
  pageSize: number,
): SessionsPage {
  const safeOffset = Number.isFinite(offset)
    ? Math.max(0, Math.min(Math.trunc(offset), Math.max(0, rows.length - 1)))
    : 0;

  return {
    rows: rows.slice(safeOffset, safeOffset + pageSize),
    total: rows.length,
    offset: safeOffset,
  };
}

// CSV export — the web format=csv shape (contract §2.11): UTF-8 BOM, CRLF,
// RFC4180 quoting, formula-injection guard on `= + - @` / tab leading cells.

function csvCell(value: string): string {
  const guarded = /^[=+\-@\t]/.test(value) ? `'${value}` : value;

  return `"${guarded.replaceAll('"', '""')}"`;
}

function sixDecimals(value: number): string {
  return value.toFixed(6);
}

export function buildSessionsCsv(
  rows: SessionRow[],
  deviceName: string,
): string {
  const capped = rows.slice(0, MAX_SESSIONS);
  const lines: string[] = [CSV_COLUMNS.join(",")];

  for (const row of capped) {
    const cells: string[] = [
      row.endedAt,
      row.startedAt,
      row.source,
      row.projectKey,
      deviceName,
      String(row.durationMs),
      String(row.inputTokens),
      String(row.cachedInputTokens),
      String(row.cacheCreationInputTokens),
      String(row.outputTokens),
      String(row.reasoningOutputTokens),
      String(row.totalTokens),
      // Locally billable is always the null → total fallback (the CLI
      // uploads null); keep the column but leave it empty, like the server.
      "",
      row.credits > 0 ? sixDecimals(row.credits) : "",
      sixDecimals(row.costUsd),
      JSON.stringify(
        row.models.map((model) => ({
          model: model.model,
          total_tokens: model.totalTokens,
          total_cost_usd: sixDecimals(
            // Per-model cost shares the session's read-time pricing pass;
            // split proportionally so the column never disagrees with the row.
            row.totalTokens > 0
              ? (row.costUsd * model.totalTokens) / row.totalTokens
              : 0,
          ),
        })),
      ),
    ];

    lines.push(cells.map(csvCell).join(","));
  }

  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
