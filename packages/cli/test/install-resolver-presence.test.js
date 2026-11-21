"use strict";

// The presence gate lives in the install resolver, not in a per-source switch
// table: resolveInstallPaths nulls any candidate root that is missing or does
// not hold its required children, so absent tools cost a couple of existsSync
// probes instead of directory walks, and an empty shell directory can never
// shadow a populated install. These tests pin that contract (an earlier
// regression class: a populated WSL ~/.codex silently evicting the native
// install, and empty shells passing as installs).

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { resolveInstallPaths } = require("../src/lib/install-resolver");

const NATIVE_ONLY = { TOKENUSAGE_WSL_MODE: "native-only" };

test("a missing native root is nulled instead of walked", () => {
  const resolved = resolveInstallPaths(
    { nativeValue: "C:\\tools\\missing", requireAnyChild: ["sessions"] },
    NATIVE_ONLY,
    { platform: "win32", existsSync: () => false },
  );
  assert.equal(resolved.native, null);
  assert.equal(resolved.wsl, null);
});

test("an empty shell directory does not qualify as an install", () => {
  const shellOnly = new Set(["C:\\tools\\codex"]);
  const empty = resolveInstallPaths(
    { nativeValue: "C:\\tools\\codex", requireAnyChild: ["sessions", "archived_sessions"] },
    NATIVE_ONLY,
    { platform: "win32", existsSync: (p) => shellOnly.has(p) },
  );
  assert.equal(empty.native, null, "an install candidate must hold a required child");

  const populated = new Set(["C:\\tools\\codex", "C:\\tools\\codex\\sessions"]);
  const real = resolveInstallPaths(
    { nativeValue: "C:\\tools\\codex", requireAnyChild: ["sessions", "archived_sessions"] },
    NATIVE_ONLY,
    { platform: "win32", existsSync: (p) => populated.has(p) },
  );
  assert.equal(real.native, "C:\\tools\\codex");
});

test("non-win32 keeps the native root as-is and never probes WSL", () => {
  const resolved = resolveInstallPaths(
    { nativeValue: "/home/u/.codex" },
    {},
    { platform: "linux" },
  );
  assert.equal(resolved.native, "/home/u/.codex");
  assert.equal(resolved.wsl, null);
});

test("union keeps both populated roots so cross-root dedup can collapse copies", () => {
  const present = new Set([
    "C:\\tools\\codex",
    "C:\\tools\\codex\\sessions",
    "\\\\wsl$\\Ubuntu\\home\\u\\.codex",
    "\\\\wsl$\\Ubuntu\\home\\u\\.codex\\sessions",
  ]);
  const resolved = resolveInstallPaths(
    {
      nativeValue: "C:\\tools\\codex",
      wslValue: "\\\\wsl$\\Ubuntu\\home\\u\\.codex",
      requireAnyChild: ["sessions"],
      union: true,
    },
    {},
    { platform: "win32", existsSync: (p) => present.has(p) },
  );
  assert.equal(resolved.native, "C:\\tools\\codex");
  assert.equal(resolved.wsl, "\\\\wsl$\\Ubuntu\\home\\u\\.codex");
});

test("union drops an unpopulated root but keeps the populated one", () => {
  const present = new Set([
    "C:\\tools\\codex",
    "\\\\wsl$\\Ubuntu\\home\\u\\.codex",
    "\\\\wsl$\\Ubuntu\\home\\u\\.codex\\sessions",
  ]);
  const resolved = resolveInstallPaths(
    {
      nativeValue: "C:\\tools\\codex",
      wslValue: "\\\\wsl$\\Ubuntu\\home\\u\\.codex",
      requireAnyChild: ["sessions"],
      union: true,
    },
    {},
    { platform: "win32", existsSync: (p) => present.has(p) },
  );
  assert.equal(resolved.native, null, "the empty shell must not shadow or join the populated install");
  assert.equal(resolved.wsl, "\\\\wsl$\\Ubuntu\\home\\u\\.codex");
});
