"use strict";

// Which CLI entry a spawned `sync` runs — one rule, every launcher.
//
// Six places used to hand-roll the same three-way choice: init's first sync,
// the generated notify hook, the OpenClaw hook, the OpenClaw session plugin,
// the auto-retry child, and the hidden scheduled runners. They agreed on
// "runtime copy first, installed package second, npx last" and on probing the
// copy's `.runtime-ready` marker — except the Windows VBS, which had its own
// order (package first) and its own readiness rule (a bare FileExists on the
// launcher, no marker). That is how a half-copied runtime got spawned and died
// with MODULE_NOT_FOUND inside an ignored stdio stream, which looks exactly
// like a successful sync.
//
// The rule now is **whoever is newer wins**. Both candidates declare a version
// — the copy in `.runtime-ready`, the package in its own package.json — and
// the higher one runs. A tie goes to the installed package: npm is what
// upgraded, and `init` copies *from* it. A copy that is not ready, or whose
// marker cannot be read, is not a candidate at all; if the package entry is
// gone too (an nvm switch drops the version-specific global prefix), npx is
// the last resort for in-process spawn points and a loud non-zero exit for the
// scheduled runner.
//
// This module is deliberately dependency-free (node built-ins only) because
// generated scripts inline its source: see `buildLauncherPrelude`.

const fs = require("node:fs");
const path = require("node:path");

const READY_MARKER = ".runtime-ready";
const FALLBACK_PACKAGE = "tokenusage-cli";
const LAUNCHER_LIB_FILE = "runtime-launch.js";

// [major, minor, patch] or null. Deliberately lenient: a marker is JSON we
// wrote ourselves, but a hand-edited one should not wedge the launcher.
function parseVersionKey(value) {
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) return null;
  return [Number(match[1] || 0), Number(match[2] || 0), Number(match[3] || 0)];
}

// Comparable scalar; an unreadable version ranks below every real one, so
// "0.0.0" still beats "cannot tell".
function versionRank(value) {
  const key = parseVersionKey(value);
  if (!key) return -1;
  return key[0] * 1e12 + key[1] * 1e6 + key[2];
}

function runtimeAppDirOf(trackerDir) {
  return path.join(trackerDir, "app");
}

function readPackageEntryVersion(packageEntry) {
  if (!packageEntry) return null;
  try {
    // <pkg>/bin/tokenusage.js → <pkg>/package.json
    const root = path.dirname(path.dirname(path.resolve(packageEntry)));
    const parsed = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
    if (parsed && typeof parsed.version === "string") return parsed.version;
  } catch (_err) {
    /* unreadable package manifest: treat the package as unversioned */
  }
  return null;
}

/**
 * Pick the launcher. `exists` / `readFile` are injectable so tests can resolve
 * against a synthetic pair of installs without touching the real home.
 *
 * @returns {{source: "package"|"runtime-copy"|"npx", script: string|null, version: string|null}}
 */
function resolveLauncher({
  trackerDir,
  packageEntry,
  exists = fs.existsSync,
  readFile = (file) => fs.readFileSync(file, "utf8"),
} = {}) {
  if (!trackerDir) return { source: "npx", script: null, version: null };

  const appDir = runtimeAppDirOf(trackerDir);
  const copyScript = path.join(appDir, "bin", "tracker.js");
  const copyMarker = path.join(appDir, READY_MARKER);
  const copyReady = exists(copyScript) && exists(copyMarker);
  const packageReady = Boolean(packageEntry) && exists(packageEntry);

  const copyVersion = copyReady ? readMarkerVersion(readFile, copyMarker) : null;
  const packageVersion = packageReady ? readPackageEntryVersion(packageEntry) : null;

  // Both usable: the newer one runs, ties to the installed package. Only read
  // the package manifest when the copy has a version to compare against, so
  // the common "no copy at all" path stays a single stat.
  if (copyReady && packageReady && copyVersion) {
    if (!packageVersion || versionRank(packageVersion) < versionRank(copyVersion)) {
      return { source: "runtime-copy", script: copyScript, version: copyVersion };
    }
    return { source: "package", script: packageEntry, version: packageVersion };
  }
  if (packageReady) {
    return { source: "package", script: packageEntry, version: readPackageEntryVersion(packageEntry) };
  }
  if (copyReady) {
    return { source: "runtime-copy", script: copyScript, version: readMarkerVersion(readFile, copyMarker) };
  }
  return { source: "npx", script: null, version: null };
}

function readMarkerVersion(readFile, markerPath) {
  try {
    const parsed = JSON.parse(readFile(markerPath));
    if (parsed && typeof parsed === "object" && typeof parsed.version === "string") {
      return parsed.version;
    }
  } catch (_err) {
    /* unreadable marker */
  }
  return null;
}

/**
 * argv for `child_process.spawn`. `nodeExe` is injected so generated scripts
 * can pass `process.execPath` without this module reaching for globals.
 */
function launcherCommand(launcher, argv, { nodeExe = process.execPath, fallbackPkg = FALLBACK_PACKAGE } = {}) {
  const args = Array.isArray(argv) ? argv : [];
  if (!launcher || launcher.source === "npx" || !launcher.script) {
    return ["npx", "--yes", fallbackPkg, ...args];
  }
  return [nodeExe, launcher.script, ...args];
}

// One-line "what would run" for logs and summaries.
function describeLauncher(launcher) {
  if (!launcher || launcher.source === "npx") return `npx ${FALLBACK_PACKAGE}`;
  const version = launcher.version ? ` v${launcher.version}` : "";
  return `${launcher.source}${version} (${launcher.script})`;
}

/**
 * This module's own source, stripped of its pragma and export block, ready to
 * be concatenated into a generated script. Reading the file (instead of
 * re-implementing the rules in a template string) is what keeps the generated
 * launchers from drifting away from the in-process ones.
 */
function launcherLibSource() {
  const file = path.resolve(__dirname, LAUNCHER_LIB_FILE);
  const raw = fs.readFileSync(file, "utf8");
  return raw
    .replace(/^["']use strict["'];?\s*\n/, "")
    .replace(/\nmodule\.exports = \{[\s\S]*?\};\s*$/, "\n");
}

function launcherModuleSource() {
  return fs.readFileSync(path.resolve(__dirname, LAUNCHER_LIB_FILE), "utf8");
}

/**
 * The resolution preamble shared by every generated launcher (notify hook,
 * OpenClaw hook + plugin, auto-retry child, scheduled-runner entry).
 *
 * Generated CommonJS scripts can inline the module source directly. ESM
 * consumers (the OpenClaw session plugin) cannot — `require` and a second
 * `const fs` would both be syntax/runtime errors there — so they import a
 * written-out `launcher.cjs` sibling instead: see
 * `buildLauncherEsmImports` + `launcherModuleSource()`.
 */
function buildLauncherPrelude({ trackerDir, packageEntry }) {
  return [
    "// --- tokenusage launcher resolution (generated by `tokenusage init`) ---",
    "// Whoever is newer wins: the init-copied runtime declares its version in",
    "// .runtime-ready, the installed package in its own package.json. A copy",
    "// without its marker is half copied and is never a candidate.",
    `const LAUNCHER_DATA_DIR = ${JSON.stringify(trackerDir)};`,
    `const LAUNCHER_PACKAGE_ENTRY = ${JSON.stringify(packageEntry || null)};`,
    "",
    launcherLibSource().trimEnd(),
    "",
  ].join("\n");
}

/**
 * `sync-entry.js` — what the scheduled runners actually execute. Resolving at
 * run time (rather than baking one winner at init time) is the whole point:
 * the global prefix is version-specific under nvm and the copy is refreshed by
 * every auto sync, so both candidates can change after the file is written.
 */
function buildSyncEntryScript({ trackerDir, packageEntry }) {
  return [
    "// Generated by `tokenusage init` — do not edit by hand.",
    "// Resolves the newest usable CLI entry and re-execs `sync` with it, so the",
    "// scheduled run never dies on a half-copied runtime or a stale snapshot.",
    "// Exit code 3 means neither candidate is usable: re-run `tokenusage init`.",
    "'use strict';",
    "// node:fs and node:path come from the inlined launcher lib below.",
    "const cp = require('node:child_process');",
    "",
    buildLauncherPrelude({ trackerDir, packageEntry }).trimEnd(),
    "",
    "const argv = process.argv.slice(2);",
    "const picked = resolveLauncher({",
    "  trackerDir: LAUNCHER_DATA_DIR,",
    "  packageEntry: LAUNCHER_PACKAGE_ENTRY,",
    "});",
    "if (!picked.script) {",
    "  process.stderr.write(",
    "    'tokenusage: no usable CLI entry — neither the installed package nor a ready runtime copy.\\n' +",
    "    'Re-run `tokenusage init` to restore collection.\\n'",
    "  );",
    "  process.exit(3);",
    "}",
    "const child = cp.spawn(process.execPath, [picked.script, ...argv], {",
    "  stdio: 'inherit',",
    "  windowsHide: true,",
    "});",
    "child.on('error', (err) => {",
    "  process.stderr.write(String((err && err.message) || err) + '\\n');",
    "  process.exit(1);",
    "});",
    "child.on('exit', (code, signal) => process.exit(signal ? 1 : code || 0));",
    "",
  ].join("\n");
}

/**
 * For ESM generated scripts: import the launcher lib from a sibling `.cjs`
 * file (CommonJS is importable from ESM) and expose the same constants the
 * inlined preamble would have declared.
 */
function buildLauncherEsmImports({ modulePath, trackerDir, packageEntry }) {
  return [
    `import launcher from ${JSON.stringify(modulePath)};`,
    "const { resolveLauncher, launcherCommand } = launcher;",
    "",
    `const LAUNCHER_DATA_DIR = ${JSON.stringify(trackerDir)};`,
    `const LAUNCHER_PACKAGE_ENTRY = ${JSON.stringify(packageEntry || null)};`,
    "",
  ].join("\n");
}

module.exports = {
  READY_MARKER,
  FALLBACK_PACKAGE,
  parseVersionKey,
  versionRank,
  runtimeAppDirOf,
  readMarkerVersion,
  readPackageEntryVersion,
  resolveLauncher,
  launcherCommand,
  describeLauncher,
  launcherLibSource,
  launcherModuleSource,
  buildLauncherPrelude,
  buildLauncherEsmImports,
  buildSyncEntryScript,
};
