// Recent sessions from the CLI's local sidecar (`session.queue.jsonl`), read
// from the tail by the Rust bridge. Metadata only: the card shows time, model,
// project and tokens — never the agent-authored title, the raw prompt or the
// absolute project path (desktop-plan §12.4).

export interface RecentSession {
  /** Stable identity for React keys and fragment dedupe. */
  id: string;
  source: string;
  model: string;
  projectKey: string;
  /** ISO timestamp; rows without one are dropped. */
  endedAt: string;
  tokens: number;
}

const DEFAULT_LIMIT = 5;

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function readTokens(row: Record<string, unknown>): number {
  if (
    typeof row.total_tokens === "number" &&
    Number.isFinite(row.total_tokens)
  ) {
    return Math.max(0, row.total_tokens);
  }
  const tokens = row.tokens;

  if (tokens !== null && typeof tokens === "object") {
    const total = (tokens as { total_tokens?: unknown }).total_tokens;

    if (typeof total === "number" && Number.isFinite(total)) {
      return Math.max(0, total);
    }
  }

  return 0;
}

/**
 * Newest `limit` sessions from a (possibly partial) sidecar tail. The sidecar
 * may hold several rows for one `session_hash` (fragment merge), so the newest
 * row per identity wins; junk/torn lines are skipped instead of failing the
 * card.
 */
export function parseRecentSessions(
  text: string | null,
  limit: number = DEFAULT_LIMIT,
): RecentSession[] {
  if (text === null || text === "") return [];

  const byId = new Map<string, RecentSession>();

  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (!trimmed) continue;
    try {
      const parsed: unknown = JSON.parse(trimmed);

      if (parsed === null || typeof parsed !== "object") continue;
      const row = parsed as Record<string, unknown>;
      const source = readString(row.source);
      const endedAt = readString(row.ended_at) ?? readString(row.started_at);

      if (source === null || endedAt === null) continue;
      const endedMs = Date.parse(endedAt);

      if (!Number.isFinite(endedMs)) continue;
      const id =
        readString(row.session_hash) ??
        `${source}|${readString(row.model) ?? "unknown"}|${endedAt}`;
      const next: RecentSession = {
        id,
        source,
        model: readString(row.model) ?? "unknown",
        projectKey: readString(row.project_key) ?? "",
        endedAt,
        tokens: readTokens(row),
      };
      const current = byId.get(id);

      if (current && Date.parse(current.endedAt) >= endedMs) continue;
      byId.set(id, next);
    } catch {
      // Torn tail write or foreign content — the card stays best-effort.
      continue;
    }
  }

  return [...byId.values()]
    .sort((a, b) => Date.parse(b.endedAt) - Date.parse(a.endedAt))
    .slice(0, Math.max(0, limit));
}
