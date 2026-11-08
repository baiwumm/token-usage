// Parser + aggregator for the CLI's local queue baseline
// (`~/.tokenusage/tracker/queue.jsonl`). Each line is one hourly bucket
// snapshot `{source, model, hour_start, ...token splits, project_key?}` and
// the file is the reconciliation baseline (AGENTS.md constraint 8): for the
// same bucket key `(hour_start, source, model, project_key)` the LAST line
// wins — lines are full bucket values, not deltas. The desktop monitor reads
// the file read-only and aggregates with the same last-wins rule so its
// numbers reconcile with `tokenusage reconcile` and the web dashboard.
//
// NOTE: the file may contain a torn tail line while the CLI appends; parsing
// is line-tolerant (bad lines skipped, never fatal).

export interface QueueBucketRow {
  source: string;
  model: string;
  hourStart: string;
  projectKey: string;
  totalTokens: number;
  billableTotalTokens: number | null;
  conversationCount: number;
}

export interface SourceUsage {
  source: string;
  tokens: number;
  conversations: number;
  share: number;
}

export interface UsageWindow {
  totalTokens: number;
  conversations: number;
  sources: SourceUsage[];
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function parseQueueLine(line: string): QueueBucketRow | null {
  const trimmed = line.trim();

  if (!trimmed) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed);

    if (parsed === null || typeof parsed !== "object") return null;
    const row = parsed as Record<string, unknown>;

    if (
      typeof row.source !== "string" ||
      typeof row.model !== "string" ||
      typeof row.hour_start !== "string" ||
      Number.isNaN(Date.parse(row.hour_start))
    ) {
      return null;
    }
    const billable =
      typeof row.billable_total_tokens === "number" &&
      Number.isFinite(row.billable_total_tokens)
        ? row.billable_total_tokens
        : null;

    return {
      source: row.source,
      model: row.model,
      hourStart: row.hour_start,
      projectKey: typeof row.project_key === "string" ? row.project_key : "",
      totalTokens: asNumber(row.total_tokens),
      billableTotalTokens: billable,
      conversationCount: asNumber(row.conversation_count),
    };
  } catch {
    // Torn tail write or foreign content — the queue stays best-effort.
    return null;
  }
}

/**
 * Last-wins bucket map over the whole file, then a window filter. Buckets
 * outside `[windowStartMs, nowMs)` are dropped AFTER dedup — mirroring the
 * reconcile baseline semantics (dedup on the full file, windows filter the
 * deduplicated set).
 */
export function aggregateQueue(
  text: string,
  windowStartMs: number,
  nowMs: number,
): UsageWindow {
  const buckets = new Map<string, QueueBucketRow>();

  for (const line of text.split(/\r?\n/)) {
    const row = parseQueueLine(line);

    if (!row) continue;
    buckets.set(rowKey(row), row); // Map.set overwrites → last line wins
  }

  let totalTokens = 0;
  let conversations = 0;
  const bySource = new Map<string, { tokens: number; conversations: number }>();

  for (const row of buckets.values()) {
    const startMs = Date.parse(row.hourStart);

    if (
      !Number.isFinite(startMs) ||
      startMs < windowStartMs ||
      startMs > nowMs
    ) {
      continue;
    }
    totalTokens += row.totalTokens;
    conversations += row.conversationCount;
    const entry = bySource.get(row.source) ?? { tokens: 0, conversations: 0 };

    entry.tokens += row.totalTokens;
    entry.conversations += row.conversationCount;
    bySource.set(row.source, entry);
  }

  const sources: SourceUsage[] = [...bySource.entries()]
    .map(([source, entry]) => ({
      source,
      tokens: entry.tokens,
      conversations: entry.conversations,
      share:
        totalTokens > 0
          ? Math.min(1, Math.max(0, entry.tokens / totalTokens))
          : 0,
    }))
    .sort((a, b) => b.tokens - a.tokens || a.source.localeCompare(b.source));

  return { totalTokens, conversations, sources };
}

function rowKey(row: QueueBucketRow): string {
  return [row.hourStart, row.source, row.model, row.projectKey].join("|");
}

/**
 * Rolling local-day helpers. "今日" uses the OS local timezone (the tray is a
 * per-machine view; web keeps its own browser-timezone choice separately).
 */
export function localDayStartMs(nowMs: number): number {
  const day = new Date(nowMs);

  day.setHours(0, 0, 0, 0);

  return day.getTime();
}

export const SEVEN_DAY_MS = 7 * 24 * 60 * 60 * 1000;
