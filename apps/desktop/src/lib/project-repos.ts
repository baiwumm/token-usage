// Read-only view over `project.repos.state.json`, which the CLI writes after
// confirming a project's repository. Shape: `{version, confirmed: {key: url}}`.
// The desktop never guesses a URL: a project without a confirmed entry simply
// renders as its bare key (docs/desktop-plan.md §12.2).
//
// The two sides key projects differently: the queue's `project_key` is the
// directory basename (`token-usage`), while the confirmed map is keyed by the
// CLI's repo identity (`baiwumm/token-usage`). Matching therefore runs through
// an alias index that accepts both forms — still exact matching, never a guess.

import type { ProjectUsage } from "@/lib/queue-lines";

export type RepoUrls = Record<string, string>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Same allowlist as the Rust `open_url` command. */
export function isHttpUrl(value: string): boolean {
  const lower = value.toLowerCase();

  return (
    (lower.startsWith("https://") || lower.startsWith("http://")) &&
    !/[\s\u0000-\u001f]/.test(value)
  );
}

/**
 * `project_key → repository URL` from the CLI's confirmed map. Missing file,
 * corrupt JSON, or non-http entries all degrade to "no link" rather than
 * failing the monitor.
 */
export function parseProjectRepoMap(text: string | null): RepoUrls {
  if (text === null) return {};
  let parsed: unknown;

  try {
    parsed = JSON.parse(text);
  } catch {
    return {};
  }
  if (!isRecord(parsed) || !isRecord(parsed.confirmed)) return {};

  const urls: RepoUrls = {};

  for (const [key, value] of Object.entries(parsed.confirmed)) {
    if (!key || typeof value !== "string" || !isHttpUrl(value)) continue;
    urls[key] = value;
  }

  return urls;
}

/** Last path segment of a `owner/name` key (or of a repository URL). */
export function repoName(ref: string): string {
  const trimmed = ref.trim().replace(/\/+$/, "");

  if (!trimmed) return "";
  try {
    if (/^https?:\/\//i.test(trimmed)) {
      const segments = new URL(trimmed).pathname.split("/").filter(Boolean);

      return segments.at(-1) ?? "";
    }
  } catch {
    return "";
  }

  return trimmed.split("/").filter(Boolean).at(-1) ?? "";
}

/**
 * Lowercased alias → URL index. Both the confirmed key (`baiwumm/token-usage`)
 * and its repository name (`token-usage`) resolve to the same URL, so a queue
 * row keyed by the directory basename can find its confirmed repository. First
 * write wins, so a duplicate name never silently re-points an existing alias.
 */
export function repoAliasIndex(urls: RepoUrls): Map<string, string> {
  const index = new Map<string, string>();

  for (const [key, url] of Object.entries(urls)) {
    for (const alias of [key, repoName(key)]) {
      const normalized = alias.trim().toLowerCase();

      if (!normalized || index.has(normalized)) continue;
      index.set(normalized, url);
    }
  }

  return index;
}

/** Confirmed repository URL for a queue project key, or null. */
export function resolveProjectRepo(
  projectKey: string,
  aliasIndex: Map<string, string>,
): string | null {
  return aliasIndex.get(projectKey.trim().toLowerCase()) ?? null;
}

export interface ProjectRepoUsage extends ProjectUsage {
  /** Confirmed repository URL, or null when the project has no mapping. */
  repoUrl: string | null;
  /** Raw queue keys folded into this row (drives the detail drill-down). */
  memberKeys: string[];
}

/**
 * Fold queue project rows that point at the same confirmed repository into one
 * row — a window can hold both `token-usage` and `baiwumm/token-usage` for
 * one work tree, and showing two rows for one repository reads like a bug.
 * Groups without a confirmed URL stay keyed by their raw project key. Display
 * names prefer the bare basename, then the repository name, then the raw key;
 * shares are recomputed against the window total so the card keeps its
 * "share of everything" scale. Cost / newest bucket / per-source splits fold
 * along (sums + max) so detail dialogs read the same numbers as the row.
 */
export function mergeProjectsByRepo(
  projects: readonly ProjectUsage[],
  urls: RepoUrls,
  totalTokens: number,
): ProjectRepoUsage[] {
  const aliasIndex = repoAliasIndex(urls);
  const groups = new Map<
    string,
    {
      tokens: number;
      conversations: number;
      costUsd: number;
      lastActiveMs: number | null;
      sourceTokens: Record<string, number>;
      repoUrl: string | null;
      keys: string[];
    }
  >();

  for (const project of projects) {
    const repoUrl = resolveProjectRepo(project.projectKey, aliasIndex);
    const groupKey = repoUrl ? `repo:${repoUrl}` : `key:${project.projectKey}`;
    const group = groups.get(groupKey);

    if (group) {
      group.tokens += project.tokens;
      group.conversations += project.conversations;
      group.costUsd += project.totalCostUsd;
      if (
        project.lastActiveMs !== null &&
        (group.lastActiveMs === null ||
          project.lastActiveMs > group.lastActiveMs)
      ) {
        group.lastActiveMs = project.lastActiveMs;
      }
      for (const [source, tokens] of Object.entries(project.sourceTokens)) {
        group.sourceTokens[source] = (group.sourceTokens[source] ?? 0) + tokens;
      }
      group.keys.push(project.projectKey);
    } else {
      groups.set(groupKey, {
        tokens: project.tokens,
        conversations: project.conversations,
        costUsd: project.totalCostUsd,
        lastActiveMs: project.lastActiveMs,
        sourceTokens: { ...project.sourceTokens },
        repoUrl,
        keys: [project.projectKey],
      });
    }
  }

  return [...groups.values()]
    .map((group) => {
      const bare = group.keys.find((key) => !key.includes("/"));

      return {
        projectKey:
          bare ??
          (group.repoUrl ? repoName(group.repoUrl) : (group.keys[0] ?? "")),
        tokens: group.tokens,
        conversations: group.conversations,
        share: totalTokens > 0 ? Math.min(1, group.tokens / totalTokens) : 0,
        totalCostUsd: group.costUsd,
        lastActiveMs: group.lastActiveMs,
        sourceTokens: group.sourceTokens,
        repoUrl: group.repoUrl,
        memberKeys: group.keys,
      };
    })
    .sort(
      (a, b) => b.tokens - a.tokens || a.projectKey.localeCompare(b.projectKey),
    );
}
