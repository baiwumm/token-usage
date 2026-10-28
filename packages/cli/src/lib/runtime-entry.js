"use strict";

// Shared layout constants for the init-copied runtime (`<trackerDir>/app`).
//
// init copies the CLI (bin + src + deps) into the data dir so notify hooks and
// the scheduled task can run `sync` without npx and without depending on npm's
// global prefix (nvm-windows makes that prefix version-specific). The copy is
// only usable when `.runtime-ready` exists next to it: every spawn point probes
// both the launcher and the marker, so a half-copied runtime (missing deps)
// degrades to the installed package instead of dying silently in an ignored
// stdio stream — which looks exactly like "collection is running" while
// nothing is collected.

const path = require("node:path");

const RUNTIME_READY_MARKER = ".runtime-ready";

function runtimeAppDir(trackerDir) {
  return path.join(trackerDir, "app");
}

function runtimeBinPath(trackerDir) {
  return path.join(runtimeAppDir(trackerDir), "bin", "tracker.js");
}

function runtimeReadyMarkerPath(appDir) {
  return path.join(appDir, RUNTIME_READY_MARKER);
}

module.exports = {
  RUNTIME_READY_MARKER,
  runtimeAppDir,
  runtimeBinPath,
  runtimeReadyMarkerPath,
};
