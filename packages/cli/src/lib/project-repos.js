"use strict";

// Detected repository URLs for projects (docs/cli-contract.md §2.4 `projects`,
// contract v3, 2026-11-06). The CLI only ever reports public GitHub / Gitee
// remotes it already canonicalised, and only the entries that differ from what
// this device last had confirmed — the server stores one row per
// (user, device, project_key), so sending the full map on every sync would
// rewrite rows for unchanged projects.
//
// Wire rules mirrored from the contract (the server validates and drops
// non-conforming entries instead of failing the batch):
//   • https://github.com/<owner>/<repo> or https://gitee.com/<owner>/<repo>
//   • exactly two path segments of [A-Za-z0-9._-], no credentials/port/query
//   • `null` clears this device's previously reported value for the project

const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const { functionUrlFor, fetchFunctionResponse } = require("./function-url");

const INGEST_SLUG = "token-usage-ingest";
const STATE_VERSION = 1;
const MAX_PROJECTS_PER_BATCH = 200;
const REPO_HOSTS = new Set(["github.com", "gitee.com"]);
const PATH_SEGMENT = /^[A-Za-z0-9._-]{1,100}$/;

/**
 * Canonicalise a git remote into the contract's only accepted shape.
 * Returns null for anything that is not a public GitHub / Gitee repository
 * (self-hosted GitLab, enterprise hosts, local paths, credentials, ports).
 */
function normalizeRepoUrl(value) {
  if (typeof value !== "string") return null;
  let raw = value.trim();
  if (!raw) return null;

  const scp = raw.match(/^[A-Za-z0-9._-]+@([^:/\\]+):(.+)$/);
  if (scp) {
    raw = `https://${scp[1]}/${scp[2]}`;
  } else if (/^ssh:\/\//i.test(raw)) {
    try {
      const parsed = new URL(raw);
      raw = `https://${parsed.hostname}${parsed.pathname}`;
    } catch {
      return null;
    }
  } else if (/^git:\/\//i.test(raw)) {
    raw = `https://${raw.slice("git://".length)}`;
  }

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.username || parsed.password || parsed.port) return null;
  if (parsed.search || parsed.hash) return null;

  const host = parsed.hostname.toLowerCase();
  if (!REPO_HOSTS.has(host)) return null;

  const segments = parsed.pathname.split("/").filter((segment) => segment.length > 0);
  if (segments.length !== 2) return null;

  const owner = segments[0];
  let repo = segments[1];
  if (/\.git$/i.test(repo)) repo = repo.slice(0, -4);
  if (!PATH_SEGMENT.test(owner) || !PATH_SEGMENT.test(repo)) return null;
  if (owner === "." || owner === ".." || repo === "." || repo === "..") return null;

  const canonical = `https://${host}/${owner}/${repo}`;
  return canonical.length <= 200 ? canonical : null;
}

function emptyState() {
  return { version: STATE_VERSION, confirmed: {} };
}

function loadProjectRepoState(filePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!parsed || typeof parsed !== "object") return emptyState();
    const confirmed = {};
    for (const [key, value] of Object.entries(
      parsed.confirmed && typeof parsed.confirmed === "object" ? parsed.confirmed : {},
    )) {
      if (typeof key !== "string" || !key) continue;
      if (value === null || typeof value === "string") confirmed[key] = value;
    }
    return { version: STATE_VERSION, confirmed };
  } catch {
    return emptyState();
  }
}

async function saveProjectRepoState(filePath, state) {
  const payload = {
    version: STATE_VERSION,
    confirmed: Object.fromEntries(
      Object.entries(state.confirmed).sort(([a], [b]) => a.localeCompare(b)),
    ),
  };
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(payload, null, 2) + "\n", { mode: 0o600 });
  await fsp.rename(tmp, filePath);
  await fsp.chmod(filePath, 0o600).catch(() => {});
}

/**
 * Entries this device should (re)report: new detections, moved repositories,
 * and clears (a project whose remote disappeared or moved off GitHub/Gitee).
 * Projects that were never confirmed and still have no repository are skipped —
 * sending `null` for every local-only project would only burn requests.
 */
function collectProjectRepoChanges({ projects, confirmed = {} }) {
  const entries = [];
  for (const [key, meta] of Object.entries(
    projects && typeof projects === "object" ? projects : {},
  )) {
    if (typeof key !== "string" || !key || !meta || typeof meta !== "object") continue;
    const hasConfirmed = Object.prototype.hasOwnProperty.call(confirmed, key);
    const previous = hasConfirmed ? confirmed[key] : undefined;
    const status = typeof meta.status === "string" ? meta.status : null;
    const detected = status === "public_verified" || status == null
      ? normalizeRepoUrl(meta.project_ref)
      : null;

    if (detected) {
      if (detected !== previous) entries.push({ project_key: key, repo_url: detected });
      continue;
    }
    if (hasConfirmed && previous !== null) {
      entries.push({ project_key: key, repo_url: null });
    }
  }
  return entries;
}

/** New confirmed map after the server acknowledged these entries. */
function applyProjectRepoConfirmation(confirmed, sent) {
  const next = { ...confirmed };
  for (const entry of sent) next[entry.project_key] = entry.repo_url;
  return next;
}

async function postProjects({
  baseUrl,
  anonKey,
  deviceToken,
  entries,
  fetchImpl,
  signal,
}) {
  const headers = {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${deviceToken}`,
  };
  if (anonKey) headers.apikey = anonKey;

  return fetchFunctionResponse(
    functionUrlFor(baseUrl, INGEST_SLUG),
    {
      method: "POST",
      headers,
      ...(signal ? { signal } : {}),
      body: JSON.stringify({ projects: entries }),
    },
    fetchImpl,
  );
}

/**
 * Upload pending repository changes in batches of <=200. Returns
 * `unsupported: true` (and leaves the state untouched) when the backend
 * predates contract v3 — an old server answers a projects-only request with
 * `400 No usage buckets provided`, and a retired route with 404/405. Both are
 * "retry later after upgrading the backend", never a sync failure.
 */
async function uploadProjectRepos({
  baseUrl,
  anonKey,
  deviceToken,
  projects,
  statePath,
  canUpload = () => true,
  batchSize = MAX_PROJECTS_PER_BATCH,
  fetchImpl,
  signal,
}) {
  const state = loadProjectRepoState(statePath);
  const pending = collectProjectRepoChanges({
    projects,
    confirmed: state.confirmed,
  });
  if (pending.length === 0) return { pending: 0, uploaded: 0, skipped: 0, batches: 0 };
  if (!canUpload()) return { pending: pending.length, uploaded: 0, skipped: 0, batches: 0, paused: true };

  const limit = Math.min(Math.max(1, Math.trunc(Number(batchSize) || 1)), MAX_PROJECTS_PER_BATCH);
  let uploaded = 0;
  let skipped = 0;
  let batches = 0;

  for (let index = 0; index < pending.length; index += limit) {
    const batch = pending.slice(index, index + limit);
    if (!canUpload()) break;
    const res = await postProjects({ baseUrl, anonKey, deviceToken, entries: batch, fetchImpl, signal });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (
        res.status === 404 ||
        res.status === 405 ||
        (res.status === 400 && text.includes("No usage buckets provided"))
      ) {
        return { pending: pending.length, uploaded, skipped, batches, unsupported: true };
      }
      const error = new Error(`repo upload failed (HTTP ${res.status}): ${text.slice(0, 300)}`);
      error.status = res.status;
      throw error;
    }

    const data = await res.json().catch(() => null);
    const isCount = (value) =>
      (typeof value === "number" || typeof value === "string") &&
      value !== "" &&
      Number.isFinite(Number(value));
    if (!data || typeof data !== "object" || !isCount(data.projects_upserted)) {
      const error = new Error(
        `repo upload was not confirmed (HTTP ${res.status}): unexpected response body`,
      );
      error.status = res.status;
      throw error;
    }

    state.confirmed = applyProjectRepoConfirmation(state.confirmed, batch);
    await saveProjectRepoState(statePath, state);
    uploaded += batch.length;
    skipped += Number(data.projects_skipped || 0);
    batches += 1;
  }

  return { pending: pending.length, uploaded, skipped, batches };
}

module.exports = {
  MAX_PROJECTS_PER_BATCH,
  applyProjectRepoConfirmation,
  collectProjectRepoChanges,
  loadProjectRepoState,
  normalizeRepoUrl,
  saveProjectRepoState,
  uploadProjectRepos,
};
