"use strict";

// Regression tests for the 0.2.0 collection controls (docs/cli-contract.md
// §2.11 client semantics): the pause flag + run-report preference in
// ~/.tokenusage, the §2.11 telemetry builder (trigger resolution, idempotency
// run_id shape, best-effort report), and the scheduled-task takeover's pure
// parts (VBS wrapper, task naming).

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  isCollectionPaused,
  isRunReportEnabled,
  setCollectionPaused,
  pauseFilePath,
} = require("../src/lib/collection-pause");
const {
  buildRunId,
  resolveSyncTrigger,
  createSyncRunTelemetry,
} = require("../src/lib/sync-report");
const {
  TASK_NAME,
  cliEntryPath,
  buildHiddenRunnerVbs,
} = require("../src/lib/scheduled-task");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-collection-controls-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("pause flag round-trips and defaults to unpaused on missing/corrupt state", () => {
  assert.equal(isCollectionPaused(tmpDir), false);

  setCollectionPaused(tmpDir, true);
  assert.equal(isCollectionPaused(tmpDir), true);
  const raw = JSON.parse(fs.readFileSync(pauseFilePath(tmpDir), "utf8"));
  assert.equal(raw.paused, true);
  assert.ok(typeof raw.at === "string");

  setCollectionPaused(tmpDir, false);
  assert.equal(isCollectionPaused(tmpDir), false);
  assert.equal(fs.existsSync(pauseFilePath(tmpDir)), false);

  // A corrupt flag must never silently stop collection.
  fs.mkdirSync(tmpDir, { recursive: true });
  fs.writeFileSync(pauseFilePath(tmpDir), "{not json");
  assert.equal(isCollectionPaused(tmpDir), false);
});

test("run-report preference defaults to on and honors runReport:false in config.json", () => {
  assert.equal(isRunReportEnabled(tmpDir), true);

  fs.writeFileSync(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ runReport: false }),
  );
  assert.equal(isRunReportEnabled(tmpDir), false);

  fs.writeFileSync(
    path.join(tmpDir, "config.json"),
    JSON.stringify({ runReport: true }),
  );
  assert.equal(isRunReportEnabled(tmpDir), true);

  // Corrupt config must not disable reporting (default on).
  fs.writeFileSync(path.join(tmpDir, "config.json"), "{broken");
  assert.equal(isRunReportEnabled(tmpDir), true);
});

test("trigger resolution folds the auto-ish flavors into the §2.11 enum", () => {
  assert.equal(resolveSyncTrigger({}), "manual");
  assert.equal(resolveSyncTrigger({ auto: true }), "scheduled");
  assert.equal(resolveSyncTrigger({ auto: true, background: true }), "scheduled");
  assert.equal(resolveSyncTrigger({ auto: true, fromRetry: true }), "scheduled");
  assert.equal(resolveSyncTrigger({ auto: true, fromNotify: true }), "notify");
  assert.equal(resolveSyncTrigger({ auto: true, fromOpenclaw: true }), "notify");
  assert.equal(resolveSyncTrigger({}, { trigger: "watch" }), "watch");
});

test("run_id follows the <started_at epoch ms>-<4hex> idempotency shape", () => {
  const runId = buildRunId(1730000000000);
  assert.match(runId, /^1730000000000-[0-9a-f]{4}$/);
  const other = buildRunId(1730000000000);
  assert.notEqual(runId, other);
});

test("telemetry snapshots carry exactly the §2.11 whitelist shape", () => {
  const telemetry = createSyncRunTelemetry({
    trigger: "scheduled",
    startedAtMs: 1730000000000,
    runId: "1730000000000-ab12",
    cliVersion: "0.2.0",
    osLabel: "win32 10.0.26200",
  });
  telemetry.noteParsedFiles(12);
  telemetry.noteUpload({ inserted: 3, tokens: 4500 });
  telemetry.noteSessions({ upserted: 2, skipped: 1 });
  telemetry.noteQueueBytes(512);

  const snapshot = telemetry.snapshot();
  assert.deepEqual(snapshot, {
    run_id: "1730000000000-ab12",
    started_at: new Date(1730000000000).toISOString(),
    ended_at: snapshot.ended_at,
    trigger: "scheduled",
    result: "ok",
    parsed_files: 12,
    buckets_uploaded: 3,
    tokens_ingested: 4500,
    sessions_uploaded: 2,
    sessions_skipped: 1,
    queue_bytes: 512,
    cli_version: "0.2.0",
    os: "win32 10.0.26200",
  });

  // An empty run derives exactly like the server-side rule expects clients
  // NOT to send: no empty field, derived by the server from zero counters.
  const empty = createSyncRunTelemetry({ trigger: "manual", cliVersion: "0.2.0" });
  empty.noteUpload({ inserted: 0, tokens: 0 });
  empty.noteSessions({ upserted: 0, skipped: 0 });
  assert.equal(empty.snapshot().tokens_ingested, 0);
  assert.equal(empty.snapshot().sessions_uploaded, 0);
});

test("report() is strictly best-effort: never throws, skips unpaired runs, logs failures", async () => {
  const logs = [];
  const telemetry = createSyncRunTelemetry({
    trigger: "manual",
    cliVersion: "0.2.0",
    log: (line) => logs.push(line),
  });

  // Unpaired: no token/baseUrl — silent skip, no log noise.
  assert.equal(await telemetry.report({}), false);
  assert.equal(logs.length, 0);

  // Paired but unreachable: logs locally, resolves false, never throws.
  const failing = createSyncRunTelemetry({
    trigger: "manual",
    cliVersion: "0.2.0",
    log: (line) => logs.push(line),
  });
  assert.equal(
    await failing.report({ baseUrl: "http://127.0.0.1:9", deviceToken: "fake-token" }),
    false,
  );
  assert.equal(logs.length, 1);
  assert.match(logs[0], /Run report failed/);

  // Only the first report() of a telemetry object ever attempts the network;
  // later calls are silent no-ops (a run reports at most once).
  assert.equal(
    await failing.report({ baseUrl: "http://127.0.0.1:9", deviceToken: "fake-token" }),
    false,
  );
  assert.equal(logs.length, 1);
});

test("hidden-runner VBS quotes paths individually and propagates the exit code", () => {
  const vbs = buildHiddenRunnerVbs({
    nodeExe: "C:\\Program Files\\nodejs\\node.exe",
    cliJs: "C:\\Users\\me\\AppData\\tokenusage-cli\\bin\\tokenusage.js",
  });
  // Chr(34) builds the quotes: no VBS quote-escaping, no cmd /c layer, and
  // paths with spaces stay intact.
  assert.match(vbs, /q = Chr\(34\)/);
  assert.ok(vbs.includes('nodeExe = "C:\\Program Files\\nodejs\\node.exe"'));
  assert.ok(vbs.includes('cliJs = "C:\\Users\\me\\AppData\\tokenusage-cli\\bin\\tokenusage.js"'));
  assert.ok(vbs.includes('cmd = q & nodeExe & q & " " & q & cliJs & q & " sync --from-scheduled"'));
  // Hidden window (0) + wait for completion (True).
  assert.match(vbs, /WScript\.Quit shell\.Run\(cmd, 0, True\)/);
  // The task name stays stable — pause/resume and uninstall toggle by name.
  assert.equal(TASK_NAME, "TokenUsageSync");
});

// nvm-windows installs npm globals into a version-specific prefix, so the
// recorded package path vanishes after `nvm use` and the hourly run failed
// every time with "file not found". The VBS now falls back to the
// init-copied runtime, which lives under the data dir.
test("hidden-runner VBS falls back to the init runtime when the package path disappears", () => {
  const fallback = "C:\\Users\\me\\.tokenusage\\tracker\\app\\bin\\tracker.js";
  const vbs = buildHiddenRunnerVbs({
    nodeExe: "C:\\Program Files\\nodejs\\node.exe",
    cliJs: "C:\\Users\\me\\AppData\\Roaming\\npm\\node_modules\\tokenusage-cli\\bin\\tokenusage.js",
    fallbackCliJs: fallback,
  });
  assert.ok(
    vbs.includes(`If Not fso.FileExists(cliJs) Then cliJs = "${fallback}"`),
    "the runtime copy must be the fallback target",
  );
  // Non-nvm layouts have nothing to fall back to; the line stays out.
  const plain = buildHiddenRunnerVbs({ nodeExe: "node.exe", cliJs: "C:\\a\\b.js" });
  assert.ok(!plain.includes("FileExists"), "no fallback probe without a fallback path");
});

// 0.2.2 regression: init registered src/cli.js instead of the bin entry. That
// file only exports run(), so the hidden task exited 0 within ~0.1 s without
// collecting or logging anything — a silent, permanently "successful" task.
test("scheduled task launches the CLI entry, never the inert src/cli.js", () => {
  const entry = cliEntryPath().replace(/\\/g, "/");
  assert.match(entry, /\/bin\/tokenusage\.js$/);
  assert.ok(fs.existsSync(cliEntryPath()), "the registered entry must exist in the package");

  const vbs = buildHiddenRunnerVbs({ nodeExe: "node.exe", cliJs: cliEntryPath() });
  assert.doesNotMatch(vbs, /src[\\/]cli\.js/);
});

test("--from-scheduled reports as scheduled, unlike a plain manual run", () => {
  assert.equal(resolveSyncTrigger({ fromScheduled: true }), "scheduled");
  // The scheduled task must upload on default installs, so --from-scheduled
  // deliberately does NOT map onto the cloud-sync-gated auto/background flags.
  assert.equal(resolveSyncTrigger({ auto: true }), "scheduled");
  assert.equal(resolveSyncTrigger({}), "manual");
});

// Runtime-require depth guard: a `require("../package.json")` inside src/commands
// or src/lib resolves to a nonexistent src/package.json and only explodes when
// the lazy call site runs (0.2.0 shipped exactly this in sync.js's report tail —
// the smoke tests never execute it). Only src/cli.js sits at the depth where the
// one-level form is valid; everything nested deeper must use ../../.
test("no nested module resolves package.json at the wrong depth", () => {
  const srcDir = path.join(__dirname, "..", "src");
  const offenders = [];

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".js")) {
        const source = fs.readFileSync(full, "utf8");
        if (source.includes('require("../package.json")')) {
          const relative = path.relative(srcDir, full).split(path.sep).join("/");

          if (relative !== "cli.js") offenders.push(relative);
        }
      }
    }
  };

  walk(srcDir);
  assert.deepEqual(offenders, []);
});
