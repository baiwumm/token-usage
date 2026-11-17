"use strict";

// Runtime-copy freshness.
//
// `tokenusage init` snapshots the CLI into `<trackerDir>/app` so notify hooks,
// the auto-retry child and the hidden scheduled task can run `sync` without
// npx and without npm's global prefix (which nvm-windows makes
// version-specific). The snapshot is the launcher of last resort.
//
// The snapshot is refreshed by exactly one thing: `init`
// (installLocalTrackerApp has a single call site). So
// `npm i -g tokenusage-cli@latest` — the only upgrade path there is — leaves
// the snapshot at the old version forever. That matters because a stale
// snapshot pins whatever the old CLI baked in: the retired dashboard domain,
// the pre-repair legacy-host table, older collector logic. It stays harmless
// while the global install is present, then stops being harmless the moment
// nvm switches versions — the snapshot becomes the thing that runs, and the
// next upload 404s against a host that no longer exists. Nothing surfaced it:
// `doctor` was the only version comparison in the repo, and it is a manual,
// non-critical warn.
//
// Auto syncs are the one place that still touches the snapshot before an
// upload, so they now detect the drift themselves and repair it. The check is
// a stat plus a marker read; the repair only runs when the versions differ.

const fs = require("node:fs");

const { runtimeAppDir, runtimeBinPath, runtimeReadyMarkerPath } = require("./runtime-entry");

// A crashed refresh must not wedge every hourly run behind a lock nobody will
// ever clear.
const REFRESH_LOCK_STALE_MS = 5 * 60_000;

function cliVersion() {
  try {
    return require("../../package.json").version || null;
  } catch (_err) {
    return null;
  }
}

function parseVersion(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
}

// -1 / 0 / 1. Unparseable versions compare equal so a weird marker never
// triggers a pointless ~10 MB re-copy.
function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  if (!left || !right) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

// Sync and allocation-cheap: this runs on every auto sync.
function readRuntimeCopyState(trackerDir) {
  const appDir = runtimeAppDir(trackerDir);
  const state = {
    path: appDir,
    exists: false,
    ready: false,
    version: null,
    installed_at: null,
    cli_version: cliVersion(),
  };

  let stat;
  try {
    stat = fs.statSync(appDir);
  } catch (_err) {
    return state; // no copy: hooks and the task fall back to the installed CLI
  }
  if (!stat.isDirectory()) return state;
  state.exists = true;

  // Same readiness contract the spawn points use: the marker alone is not
  // enough, the launcher has to be there too.
  let marker = null;
  try {
    const parsed = JSON.parse(fs.readFileSync(runtimeReadyMarkerPath(appDir), "utf8"));
    if (parsed && typeof parsed === "object") marker = parsed;
  } catch (_err) {
    marker = null;
  }
  state.ready = Boolean(marker) && fs.existsSync(runtimeBinPath(trackerDir));
  if (marker) {
    state.version = typeof marker.version === "string" ? marker.version : null;
    state.installed_at = typeof marker.installedAt === "string" ? marker.installedAt : null;
  }
  return state;
}

// null = nothing to do. Otherwise the reason the copy needs a re-install.
// A copy *newer* than the running CLI is left alone — refreshing would
// downgrade it to whatever the older global install happens to be.
function runtimeCopyDrift(state) {
  if (!state.exists) return null;
  if (!state.ready) return "incomplete";
  if (!state.version) return "unknown-version";
  if (state.cli_version && compareVersions(state.version, state.cli_version) < 0) return "stale";
  return null;
}

function releaseRefreshLock(appDir) {
  try {
    fs.rmSync(`${appDir}.refresh.lock`, { recursive: true, force: true });
  } catch (_err) {
    /* best effort */
  }
}

function acquireRefreshLock(appDir) {
  const lockDir = `${appDir}.refresh.lock`;
  try {
    fs.mkdirSync(lockDir);
    return () => releaseRefreshLock(appDir);
  } catch (err) {
    if (err && err.code === "EEXIST") {
      try {
        const stat = fs.statSync(lockDir);
        if (Date.now() - stat.mtimeMs > REFRESH_LOCK_STALE_MS) {
          releaseRefreshLock(appDir);
          fs.mkdirSync(lockDir);
          return () => releaseRefreshLock(appDir);
        }
      } catch (_err) {
        /* stat failed: treat as held */
      }
      return null; // another refresh is in flight
    }
    return null; // EACCES / EROFS / …: skip refreshing rather than fail the run
  }
}

/**
 * Re-install the runtime copy when it has drifted from the running CLI.
 *
 * Best effort by design: every failure mode returns instead of throwing, so a
 * broken refresh can never stop an hourly sync from collecting. The copy is
 * rebuilt from the package that is currently running, so calling this from the
 * snapshot itself is a no-op (installLocalTrackerApp detects that source and
 * destination resolve to the same place and reuses it).
 *
 * @param {{trackerDir: string, log?: (message: string) => void}} options
 * @returns {Promise<{refreshed: boolean, reason: string|null, skipped?: string, error?: string}>}
 */
async function ensureRuntimeCopyFresh({ trackerDir, log = () => {} }) {
  const state = readRuntimeCopyState(trackerDir);
  const drift = runtimeCopyDrift(state);
  if (!drift) return { refreshed: false, reason: null };

  const release = acquireRefreshLock(state.path);
  if (!release) {
    log(`runtime copy ${drift}; a refresh is already running, leaving it to that run`);
    return { refreshed: false, reason: drift, skipped: "locked" };
  }

  try {
    // Required lazily: commands/init pulls in the integration-repair graph,
    // and a load-time require here would make sync.js's import order matter.
    const { installLocalTrackerApp } = require("../commands/init");
    const result = await installLocalTrackerApp({ appDir: state.path });
    if (result && result.ok) {
      if (result.skipped) return { refreshed: false, reason: drift, skipped: "env" };
      log(`runtime copy refreshed: v${state.version || "unknown"} → v${state.cli_version} (${drift})`);
      return { refreshed: true, reason: drift };
    }
    const detail = result && result.reason ? String(result.reason) : "unknown";
    log(`runtime copy refresh failed (${drift}: ${detail}); re-run \`tokenusage init\``);
    return { refreshed: false, reason: drift, error: detail };
  } catch (err) {
    const detail = err && err.message ? String(err.message) : String(err);
    log(`runtime copy refresh threw (${drift}: ${detail}); re-run \`tokenusage init\``);
    return { refreshed: false, reason: drift, error: detail };
  } finally {
    release();
  }
}

/**
 * `status` human line. Names the drift so a stale snapshot is visible without
 * running `doctor`.
 */
function formatRuntimeCopyLine(state, drift, cliVersion) {
  if (!state.exists) return null; // nothing copied: hooks use the installed CLI
  if (drift === "stale") {
    return `- Runtime copy: v${state.version || "unknown"} (STALE — CLI is v${cliVersion}; \`tokenusage init\` refreshes it)`;
  }
  if (drift === "incomplete") {
    return "- Runtime copy: incomplete (hooks use the installed CLI; re-run `tokenusage init`)";
  }
  if (drift === "unknown-version") {
    return "- Runtime copy: unversioned (re-run `tokenusage init`)";
  }
  return `- Runtime copy: v${state.version} (up to date)`;
}

/** `status --light` / `--json` table cell. */
function formatRuntimeCopyCell(summary) {
  if (!summary) return "not installed";
  if (!summary.ready) return `${summary.path} (incomplete)`;
  const label = summary.version || "unversioned";
  if (summary.stale) return `v${label} — stale, CLI is v${summary.cli_version}`;
  return `v${label}`;
}

module.exports = {
  REFRESH_LOCK_STALE_MS,
  compareVersions,
  readRuntimeCopyState,
  runtimeCopyDrift,
  ensureRuntimeCopyFresh,
  formatRuntimeCopyLine,
  formatRuntimeCopyCell,
};
