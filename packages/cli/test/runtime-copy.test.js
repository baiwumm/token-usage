"use strict";

// The init-copied runtime (`<trackerDir>/app`) is the launcher behind notify
// hooks, the hidden scheduled task and the auto-retry child. 0.2.4 made its
// readiness marker the single gate: a copy that never booted must never be
// spawned (it dies with MODULE_NOT_FOUND inside an ignored stdio stream, which
// is indistinguishable from "collection is running"), and `doctor` must say so.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { buildNotifyHandler } = require("../src/commands/init");
const { buildDoctorReport } = require("../src/lib/doctor");
const { runtimeAppDir, runtimeBinPath, runtimeReadyMarkerPath, RUNTIME_READY_MARKER } = require("../src/lib/runtime-entry");

const CLI_VERSION = require("../package.json").version;

async function withTrackerDir(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tu-runtime-copy-"));
  const trackerDir = path.join(home, "tracker");
  fs.mkdirSync(trackerDir, { recursive: true });
  try {
    return await fn({ home, trackerDir });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

async function runtimeCopyCheck(trackerDir) {
  const report = await buildDoctorReport({
    runtime: { baseUrl: "https://example.test", deviceToken: "present", dashboardUrl: "https://example.test" },
    diagnostics: null,
    fetch: async () => ({ ok: true, status: 200 }),
    paths: { trackerDir, configPath: path.join(trackerDir, "config.json") },
  });
  return report.checks.find((check) => check.id === "runtime.copy");
}

test("runtime-entry: the marker lives next to the copy, not inside bin/", () => {
  const trackerDir = path.join("home", ".tokenusage", "tracker");
  assert.equal(runtimeAppDir(trackerDir), path.join(trackerDir, "app"));
  assert.equal(runtimeBinPath(trackerDir), path.join(trackerDir, "app", "bin", "tracker.js"));
  assert.equal(
    runtimeReadyMarkerPath(runtimeAppDir(trackerDir)),
    path.join(trackerDir, "app", RUNTIME_READY_MARKER),
  );
});

test("doctor: no runtime copy is fine (hooks use the installed CLI)", async () => {
  const check = await withTrackerDir(({ trackerDir }) => runtimeCopyCheck(trackerDir));
  assert.equal(check.status, "ok");
  assert.match(check.detail, /installed CLI/);
});

test("doctor: a copy without its marker is reported as incomplete", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    const appDir = runtimeAppDir(trackerDir);
    fs.mkdirSync(path.join(appDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "bin", "tracker.js"), "// half copy\n");
    const check = await runtimeCopyCheck(trackerDir);
    assert.equal(check.status, "warn");
    assert.match(check.detail, /incomplete/);
  });
});

test("doctor: a ready copy reports its version", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    const appDir = runtimeAppDir(trackerDir);
    fs.mkdirSync(path.join(appDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "bin", "tracker.js"), "// copy\n");
    fs.writeFileSync(
      runtimeReadyMarkerPath(appDir),
      JSON.stringify({ version: CLI_VERSION, installedAt: "2026-10-28T00:00:00.000Z" }),
    );
    const check = await runtimeCopyCheck(trackerDir);
    assert.equal(check.status, "ok");
    assert.match(check.detail, new RegExp(`v${CLI_VERSION.replace(/\./g, "\\.")}`));
    assert.equal(check.meta.version, CLI_VERSION);
  });
});

test("doctor: a copy from an older CLI is flagged for a re-run", async () => {
  await withTrackerDir(async ({ trackerDir }) => {
    const appDir = runtimeAppDir(trackerDir);
    fs.mkdirSync(path.join(appDir, "bin"), { recursive: true });
    fs.writeFileSync(path.join(appDir, "bin", "tracker.js"), "// copy\n");
    fs.writeFileSync(runtimeReadyMarkerPath(appDir), JSON.stringify({ version: "0.0.1" }));
    const check = await runtimeCopyCheck(trackerDir);
    assert.equal(check.status, "warn");
    assert.match(check.detail, /older than the CLI/);
  });
});

test("notify handler: marker + installed-package fallback baked into the template", () => {
  const source = buildNotifyHandler({ trackerDir: path.join("C:", "home", ".tokenusage", "tracker") });
  assert.ok(source.includes("runtimeReadyPath"), "the template must probe the readiness marker");
  assert.ok(source.includes("packageEntryPath"), "the template must carry the installed CLI entry");
  assert.ok(
    source.includes("const hasLocalRuntime = fs.existsSync(runtimeReadyPath) && fs.existsSync(trackerBinPath);"),
    "both the launcher and the marker are required",
  );
  assert.ok(
    source.includes(": hasPackageEntry\n        ? [process.execPath, packageEntryPath, ...syncArgs]"),
    "the middle tier runs the installed package without npx",
  );
  // The generated file must stay dependency-free: only node built-ins.
  assert.ok(!/require\(['"](?!node:)/.test(source), "notify.cjs must only require node: built-ins");
});
