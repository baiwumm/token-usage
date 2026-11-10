// Read-only view over `project.repos.state.json`, which the CLI writes after
// confirming a project's repository. Shape: `{version, confirmed: {key: url}}`.
// The desktop never guesses a URL: a project without a confirmed entry simply
// renders as its bare key (docs/desktop-plan.md §12.2).

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
