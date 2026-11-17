"use strict";

// Runtime-copy freshness.
//
// The init-copied runtime (`<trackerDir>/app`) is the launcher of last resort
// behind notify hooks, the auto-retry child and the hidden scheduled task, but
// `init` is the only thing that ever refreshes it. `npm i -g
// tokenusage-cli@latest` therefore leaves a snapshot pinned to the old build —
// its retired dashboard domain, its pre-repair legacy-host table — and nothing
// noticed, because `doctor` was the only version comparison in the repo and it
// was a non-critical warn.
//
// Auto syncs now detect the drift themselves (a stat plus a marker read) and
// re-install the copy. These tests pin both halves: the drift definition and
// the repair.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  compareVersions,
  readRuntimeCopyState,
  runtimeCopyDrift,
  ensureRuntimeCopyFresh,
  formatRuntimeCopyLine,
  formatRuntimeCopyCell,
  REFRESH_LOCK_STALE_MS,
} = require("../src/lib/runtime-refresh");
const { runtimeAppDir, runtimeReadyMarkerPath } = require("../src/lib/runtime-entry");

const CLI_VERSION = require("../package.json").version;

async function withTrackerDir(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tu-runtime-refresh-"));
  const trackerDir = path.join(home, "tracker");
  fs.mkdirSync(trackerDir, { recursive: true });
  try {
    return await fn({ home, trackerDir });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

// A copy that passes the readiness gate every spawn point probes: launcher
// present, marker written.
function seedRuntimeCopy(trackerDir, version, { withLauncher = true } = {}) {
  const appDir = runtimeAppDir(trackerDir);
  fs.mkdirSync(appDir, { recursive: true });
  if (withLauncher) {
    fs.mkdirSync(path.join(appDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "bin", "tracker.js"), "// seeded copy\n");
  }
  const marker = { installedAt: "2026-10-28T00:00:00.000Z" };
  if (version !== null) marker.version = version;
  fs.writeFileSync(runtimeReadyMarkerPath(appDir), JSON.stringify(marker));
  return appDir;
}

function driftOf(trackerDir) {
  return runtimeCopyDrift(readRuntimeCopyState(trackerDir));
}

test("compareVersions: numeric per component, tolerant of junk", () => {
  assert.equal(compareVersions("0.6.0", "0.6.2"), -1);
  assert.equal(compareVersions("0.6.2", "0.6.0"), 1);
  assert.equal(compareVersions("0.6.2", "0.6.2"), 0);
  assert.equal(compareVersions("v1.2.3", "1.2.3"), 0);
  // Lexical compare gets this wrong; "10" is not less than "9".
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("1.0", "1.0.0"), 0);
  // Unparseable versions must never trigger a pointless ~10 MB re-copy.
  assert.equal(compareVersions("not-a-version", "0.6.2"), 0);
  assert.equal(compareVersions(null, "0.6.2"), 0);
});

test("drift: no copy at all is not drift (hooks use the installed CLI)", async () => {
  await withTrackerDir(({ trackerDir }) => {
    const state = readRuntimeCopyState(trackerDir);
    assert.equal(state.exists, false);
    assert.equal(runtimeCopyDrift(state), null);
  });
});

test("drift: a copy missing its launcher is incomplete", async () => {
  await withTrackerDir(({ trackerDir }) => {
    seedRuntimeCopy(trackerDir, CLI_VERSION, { withLauncher: false });
    assert.equal(driftOf(trackerDir), "incomplete");
  });
});

test("drift: an older copy is stale", async () => {
  await withTrackerDir(({ trackerDir }) => {
    seedRuntimeCopy(trackerDir, "0.0.1");
    assert.equal(driftOf(trackerDir), "stale");
  });
});

test("drift: a copy from the same CLI is fine", async () => {
  await withTrackerDir(({ trackerDir }) => {
    seedRuntimeCopy(trackerDir, CLI_VERSION);
    assert.equal(driftOf(trackerDir), null);
  });
});

test("drift: a copy newer than the CLI is left alone", async () => {
  await withTrackerDir(({ trackerDir }) => {
    // Refreshing would downgrade the copy to whatever the older global
    // install happens to be.
    seedRuntimeCopy(trackerDir, "99.0.0");
    assert.equal(driftOf(trackerDir), null);
  });
});

test("drift: a marker with no version is flagged, not ignored", async () => {
  await withTrackerDir(({ trackerDir }) => {
    seedRuntimeCopy(trackerDir, null);
    assert.equal(driftOf(trackerDir), "unknown-version");
  });
});

test("refresh: a stale copy is re-installed from the running CLI", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    seedRuntimeCopy(trackerDir, "0.0.1");
    const logged = [];
    const result = await ensureRuntimeCopyFresh({
      trackerDir,
      log: (message) => logged.push(message),
    });
    assert.equal(result.refreshed, true);
    assert.equal(result.reason, "stale");
    assert.ok(
      logged.some((line) => /runtime copy refreshed: v0\.0\.1/.test(line)),
      `the repair must be logged, got: ${JSON.stringify(logged)}`,
    );

    const appDir = runtimeAppDir(trackerDir);
    const marker = JSON.parse(fs.readFileSync(runtimeReadyMarkerPath(appDir), "utf8"));
    assert.equal(marker.version, CLI_VERSION, "the copy now matches the running CLI");
    assert.equal(driftOf(trackerDir), null, "a second look must find no drift");
  });
});

test("refresh: nothing to do costs nothing and copies nothing", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    seedRuntimeCopy(trackerDir, CLI_VERSION);
    const result = await ensureRuntimeCopyFresh({ trackerDir, log: () => {} });
    assert.equal(result.refreshed, false);
    assert.equal(result.reason, null);
    // The seeded launcher survived untouched: no staging, no swap.
    assert.equal(
      fs.readFileSync(path.join(runtimeAppDir(trackerDir), "bin", "tracker.js"), "utf8"),
      "// seeded copy\n",
    );
  });
});

test("refresh: TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY defers to init", async () => {
  const previous = process.env.TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY;
  process.env.TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY = "1";
  try {
    await withTrackerDir(async ({ trackerDir }) => {
      seedRuntimeCopy(trackerDir, "0.0.1");
      const result = await ensureRuntimeCopyFresh({ trackerDir, log: () => {} });
      assert.equal(result.refreshed, false);
      assert.equal(result.skipped, "env");
    });
  } finally {
    if (previous === undefined) delete process.env.TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY;
    else process.env.TOKENUSAGE_SKIP_LOCAL_RUNTIME_COPY = previous;
  }
});

test("refresh: a held lock defers to the run that holds it", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    const appDir = seedRuntimeCopy(trackerDir, "0.0.1");
    fs.mkdirSync(`${appDir}.refresh.lock`);
    const result = await ensureRuntimeCopyFresh({ trackerDir, log: () => {} });
    assert.equal(result.refreshed, false);
    assert.equal(result.skipped, "locked");
    assert.equal(driftOf(trackerDir), "stale", "the copy must be left untouched");
  });
});

test("refresh: a lock left behind by a crashed run is reclaimed", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    const appDir = seedRuntimeCopy(trackerDir, "0.0.1");
    const lockDir = `${appDir}.refresh.lock`;
    fs.mkdirSync(lockDir);
    const stale = new Date(Date.now() - REFRESH_LOCK_STALE_MS - 60_000);
    fs.utimesSync(lockDir, stale, stale);
    const result = await ensureRuntimeCopyFresh({ trackerDir, log: () => {} });
    assert.equal(result.refreshed, true);
  });
});

test("sync: auto runs repair the copy before collecting", () => {
  // The scheduled task and every hook spawn the snapshot, so an auto run is
  // the last point that touches it before an upload — that is where the
  // repair belongs. A manual sync stays fast.
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "commands", "sync.js"), "utf8");
  assert.ok(source.includes('require("../lib/runtime-refresh")'), "sync must import the helper");
  assert.ok(
    /if \(autoishSync\) \{\s*\n\s*await ensureRuntimeCopyFresh\(\{ trackerDir, log: autoLog \}\);/.test(source),
    "the refresh must be gated on the auto flavor",
  );
});

test("status formatters name the drift", async () => {
  await withTrackerDir(({ trackerDir }) => {
    const stale = readRuntimeCopyState(trackerDir);
    assert.equal(formatRuntimeCopyLine(stale, null, CLI_VERSION), null, "no copy prints no line");

    const seeded = seedRuntimeCopy(trackerDir, "0.0.1");
    const state = readRuntimeCopyState(trackerDir);
    assert.equal(runtimeCopyDrift(state), "stale");
    assert.match(formatRuntimeCopyLine(state, "stale", CLI_VERSION), /STALE/);
    assert.match(formatRuntimeCopyLine(state, "stale", CLI_VERSION), /v0\.0\.1/);
    assert.match(formatRuntimeCopyLine(state, null, CLI_VERSION), /up to date/);

    const cell = formatRuntimeCopyCell({
      path: seeded,
      version: "0.0.1",
      cli_version: CLI_VERSION,
      ready: true,
      stale: true,
    });
    assert.match(cell, /stale/);
    assert.equal(formatRuntimeCopyCell(null), "not installed");
  });
});
