"use strict";

// TRAE CN account-level usage is opt-in, and both CN client directories share
// the same storage schema. Discovery prefers an installed directory, falls back
// to the primary one for diagnostics, and still honors the explicit home
// override.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  resolveTraeCnStoragePath,
  TRAE_CN_APP_DIRS,
} = require("../src/lib/trae-cn-config");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-trae-cn-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function storagePath(parent, appDir) {
  return path.join(parent, appDir, "User", "globalStorage", "storage.json");
}

test("Trae CN discovers both app dirs", () => {
  assert.deepEqual(TRAE_CN_APP_DIRS, ["TRAE SOLO CN", "Trae CN"]);

  const env = { APPDATA: tmpDir };
  // Neither installed: the primary dir is still reported for diagnostics.
  assert.equal(
    resolveTraeCnStoragePath({ env, home: tmpDir, platform: "win32" }),
    storagePath(tmpDir, "TRAE SOLO CN"),
  );

  // Only the IDE build is installed.
  fs.mkdirSync(path.join(tmpDir, "Trae CN", "User", "globalStorage"), { recursive: true });
  assert.equal(
    resolveTraeCnStoragePath({ env, home: tmpDir, platform: "win32" }),
    storagePath(tmpDir, "Trae CN"),
  );

  // The Work build keeps priority when both exist.
  fs.mkdirSync(path.join(tmpDir, "TRAE SOLO CN", "User", "globalStorage"), { recursive: true });
  assert.equal(
    resolveTraeCnStoragePath({ env, home: tmpDir, platform: "win32" }),
    storagePath(tmpDir, "TRAE SOLO CN"),
  );
});

test("Trae CN keeps the explicit home override and macOS layout", () => {
  const custom = path.join(tmpDir, "custom");
  assert.equal(
    resolveTraeCnStoragePath({
      env: { APPDATA: tmpDir, TOKENUSAGE_TRAE_CN_HOME: custom },
      home: tmpDir,
      platform: "win32",
    }),
    path.join(custom, "User", "globalStorage", "storage.json"),
  );

  assert.equal(
    resolveTraeCnStoragePath({ env: {}, home: tmpDir, platform: "darwin" }),
    path.join(
      tmpDir,
      "Library",
      "Application Support",
      "TRAE SOLO CN",
      "User",
      "globalStorage",
      "storage.json",
    ),
  );

  // No verified CN app-data layout elsewhere.
  assert.equal(
    resolveTraeCnStoragePath({ env: {}, home: tmpDir, platform: "linux" }),
    null,
  );
});
