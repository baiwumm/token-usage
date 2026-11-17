"use strict";

// One launcher contract for every spawn point. The VBS/sh runners used to pick
// the installed package by a bare FileExists probe while the JS spawn points
// demanded the copy's `.runtime-ready` marker — so a half-copied runtime (or a
// stale one left behind by an nvm prefix switch) got spawned and died inside an
// ignored stdio stream. These tests pin the single rule that replaced them:
// whoever is newer wins, an unready copy is never a candidate, npx is last.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const {
  READY_MARKER,
  parseVersionKey,
  versionRank,
  resolveLauncher,
  launcherCommand,
  describeLauncher,
  buildLauncherPrelude,
  buildLauncherEsmImports,
  launcherModuleSource,
  buildSyncEntryScript,
} = require("../src/lib/runtime-launch");

// A synthetic pair of installs: a runtime copy under <trackerDir>/app and an
// installed package at <pkg>/bin/tokenusage.js (plus its package.json).
function seedInstalls({ copyVersion = null, packageVersion = null, copyScript = true, packageScript = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tu-launch-"));
  const trackerDir = path.join(root, "tracker");
  const appDir = path.join(trackerDir, "app");
  const copyScriptPath = path.join(appDir, "bin", "tracker.js");
  const packageRoot = path.join(root, "node_modules", "tokenusage-cli");
  const packageEntry = path.join(packageRoot, "bin", "tokenusage.js");

  fs.mkdirSync(path.join(appDir, "bin"), { recursive: true });
  fs.mkdirSync(path.join(packageRoot, "bin"), { recursive: true });
  if (copyScript) fs.writeFileSync(copyScriptPath, "// copy\n", "utf8");
  if (packageScript) fs.writeFileSync(packageEntry, "// pkg\n", "utf8");
  if (copyVersion) fs.writeFileSync(path.join(appDir, READY_MARKER), JSON.stringify({ version: copyVersion }), "utf8");
  if (packageVersion) {
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ version: packageVersion }), "utf8");
  }
  return { root, trackerDir, appDir, copyScriptPath, packageEntry, packageRoot };
}

test("versionRank orders real versions and ranks an unreadable one last", () => {
  assert.deepEqual(parseVersionKey("0.6.3"), [0, 6, 3]);
  assert.deepEqual(parseVersionKey("v1.2"), [1, 2, 0]);
  assert.equal(parseVersionKey("not-a-version"), null);
  assert.equal(parseVersionKey(undefined), null);

  assert.ok(versionRank("0.6.4") > versionRank("0.6.3"));
  assert.ok(versionRank("1.0.0") > versionRank("0.99.99"));
  assert.ok(versionRank("0.0.0") > versionRank(null), "\"0.0.0\" still beats \"cannot tell\"");
});

test("the newer runtime copy wins over the installed package", () => {
  const { root, trackerDir, copyScriptPath } = seedInstalls({ copyVersion: "0.6.4", packageVersion: "0.6.3" });
  try {
    const picked = resolveLauncher({ trackerDir, packageEntry: path.join(root, "node_modules", "tokenusage-cli", "bin", "tokenusage.js") });
    assert.equal(picked.source, "runtime-copy");
    assert.equal(picked.script, copyScriptPath);
    assert.equal(picked.version, "0.6.4");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the installed package wins when it is newer, and on a tie", () => {
  const { root, trackerDir, packageEntry } = seedInstalls({ copyVersion: "0.6.3", packageVersion: "0.6.4" });
  try {
    const newer = resolveLauncher({ trackerDir, packageEntry });
    assert.equal(newer.source, "package");
    assert.equal(newer.script, packageEntry);
    assert.equal(newer.version, "0.6.4");

    // npm is the upgrade source, so a tie goes to the package — never to a
    // copy that init happened to write a moment earlier.
    const tied = seedInstalls({ copyVersion: "0.6.3", packageVersion: "0.6.3" });
    try {
      const picked = resolveLauncher({ trackerDir: tied.trackerDir, packageEntry: tied.packageEntry });
      assert.equal(picked.source, "package");
    } finally {
      fs.rmSync(tied.root, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a copy without its marker is never a candidate", () => {
  // The 0.2.4 regression: the launcher file exists, the deps never landed.
  const { root, trackerDir, packageEntry } = seedInstalls({ copyVersion: null, packageVersion: "0.6.3" });
  try {
    const picked = resolveLauncher({ trackerDir, packageEntry });
    assert.equal(picked.source, "package");
    assert.equal(picked.version, "0.6.3");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("the installed package alone is used when there is no copy", () => {
  const { root, trackerDir, packageEntry } = seedInstalls({ copyVersion: null, packageVersion: "0.6.3", copyScript: false });
  try {
    const picked = resolveLauncher({ trackerDir, packageEntry });
    assert.equal(picked.source, "package");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an nvm prefix switch leaves only the runtime copy", () => {
  const { root, trackerDir, copyScriptPath } = seedInstalls({ copyVersion: "0.6.3", packageVersion: null, packageScript: false });
  try {
    const picked = resolveLauncher({ trackerDir, packageEntry: path.join(root, "gone", "bin", "tokenusage.js") });
    assert.equal(picked.source, "runtime-copy");
    assert.equal(picked.script, copyScriptPath);
    assert.equal(picked.version, "0.6.3");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("with neither candidate the resolver hands back the npx last resort", () => {
  const { root, trackerDir } = seedInstalls({ copyScript: false, packageScript: false });
  try {
    const picked = resolveLauncher({ trackerDir, packageEntry: path.join(root, "gone", "bin", "tokenusage.js") });
    assert.deepEqual(picked, { source: "npx", script: null, version: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an unreadable copy marker loses to any versioned package but still runs alone", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tu-launch-"));
  try {
    const trackerDir = path.join(root, "tracker");
    const appDir = path.join(trackerDir, "app");
    const copyScriptPath = path.join(appDir, "bin", "tracker.js");
    const packageRoot = path.join(root, "node_modules", "tokenusage-cli");
    const packageEntry = path.join(packageRoot, "bin", "tokenusage.js");
    fs.mkdirSync(path.dirname(copyScriptPath), { recursive: true });
    fs.mkdirSync(path.dirname(packageEntry), { recursive: true });
    fs.writeFileSync(copyScriptPath, "// copy\n", "utf8");
    fs.writeFileSync(packageEntry, "// pkg\n", "utf8");
    // Corrupt marker: present, so the copy is "ready", but carries no version.
    fs.writeFileSync(path.join(appDir, READY_MARKER), "{not json", "utf8");
    fs.writeFileSync(path.join(packageRoot, "package.json"), JSON.stringify({ version: "0.6.3" }), "utf8");

    assert.equal(resolveLauncher({ trackerDir, packageEntry }).source, "package");
    fs.rmSync(packageEntry);
    const alone = resolveLauncher({ trackerDir, packageEntry });
    assert.equal(alone.source, "runtime-copy");
    assert.equal(alone.version, null, "an unreadable version is reported as unknown, not guessed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("launcherCommand builds a node spawn, or an npx fallback", () => {
  const copy = { source: "runtime-copy", script: "/x/app/bin/tracker.js", version: "0.6.4" };
  assert.deepEqual(launcherCommand(copy, ["sync", "--auto"], { nodeExe: "C:\\node.exe" }), [
    "C:\\node.exe",
    "/x/app/bin/tracker.js",
    "sync",
    "--auto",
  ]);
  assert.deepEqual(launcherCommand({ source: "npx", script: null }, ["sync"]), ["npx", "--yes", "tokenusage-cli", "sync"]);
  // A custom fallback package name survives (the fork's published name).
  assert.deepEqual(launcherCommand({ source: "npx" }, ["sync"], { fallbackPkg: "other-cli" }), [
    "npx",
    "--yes",
    "other-cli",
    "sync",
  ]);
  assert.deepEqual(launcherCommand(null, []), ["npx", "--yes", "tokenusage-cli"]);
});

test("describeLauncher names what would run", () => {
  assert.equal(describeLauncher({ source: "npx" }), "npx tokenusage-cli");
  assert.equal(
    describeLauncher({ source: "package", script: "/p/bin/tokenusage.js", version: "0.6.3" }),
    "package v0.6.3 (/p/bin/tokenusage.js)",
  );
  assert.equal(describeLauncher(null), "npx tokenusage-cli");
});

test("the prelude inlines the resolver and stays dependency-free", () => {
  const prelude = buildLauncherPrelude({ trackerDir: "/home/me/.tokenusage/tracker", packageEntry: "/p/bin/tokenusage.js" });
  assert.ok(prelude.includes("LAUNCHER_DATA_DIR"), "the tracker dir is injected for resolveLauncher");
  assert.ok(prelude.includes("LAUNCHER_PACKAGE_ENTRY"));
  assert.ok(prelude.includes("function resolveLauncher("), "the arbitration logic is inlined, not required");
  // Generated scripts run from ~/.tokenusage/bin, away from the package tree.
  assert.ok(!/require\(['"](?!node:)/.test(prelude), "only node: built-ins may be required");
});

test("the ESM session plugin imports the launcher instead of inlining it", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tu-esm-"));
  try {
    const { root, trackerDir, copyScriptPath } = seedInstalls({ copyVersion: "0.6.5", packageVersion: "0.6.3" });
    try {
      const packageRoot = path.join(root, "node_modules", "tokenusage-cli");
      const packageEntry = path.join(packageRoot, "bin", "tokenusage.js");
      const stub = (label) => `console.log('ran:' + '${label}');\n`;
      fs.writeFileSync(copyScriptPath, stub("copy"), "utf8");
      fs.writeFileSync(packageEntry, stub("package"), "utf8");

      fs.writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "p", version: "0.0.0", type: "module" }),
        "utf8",
      );
      fs.writeFileSync(path.join(dir, "launcher.cjs"), launcherModuleSource(), "utf8");
      // ESM cannot `require`, and a second `const fs` would be a redeclare:
      // the generated plugin imports the module rather than inlining it.
      fs.writeFileSync(
        path.join(dir, "index.js"),
        [
          buildLauncherEsmImports({ modulePath: "./launcher.cjs", trackerDir, packageEntry }),
          "const picked = resolveLauncher({ trackerDir: LAUNCHER_DATA_DIR, packageEntry: LAUNCHER_PACKAGE_ENTRY });",
          "console.log(launcherCommand(picked, ['sync'])[1]);",
          "",
        ].join("\n"),
        "utf8",
      );

      const out = require("node:child_process").execFileSync(process.execPath, [path.join(dir, "index.js")], {
        encoding: "utf8",
      });
      assert.equal(out.trim(), copyScriptPath, "the newer copy wins from inside the ESM plugin too");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("the generated sync entry really resolves and runs the newest entry", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tu-entry-"));
  try {
    const { root, trackerDir, copyScriptPath } = seedInstalls({ copyVersion: "9.9.9", packageVersion: "0.6.3" });
    try {
      // Both candidates are stubs that print which one ran.
      const pkgRoot = path.join(root, "node_modules", "tokenusage-cli");
      const packageEntry = path.join(pkgRoot, "bin", "tokenusage.js");
      const stub = (label) => `console.log('ran:' + '${label}');\n`;
      fs.writeFileSync(copyScriptPath, stub("copy"), "utf8");
      fs.writeFileSync(packageEntry, stub("package"), "utf8");

      const file = path.join(dir, "sync-entry.js");
      fs.writeFileSync(file, buildSyncEntryScript({ trackerDir, packageEntry }), "utf8");
      const run = (argv) =>
        require("node:child_process").execFileSync(process.execPath, [file, ...argv], { encoding: "utf8" });

      // The copy is newer, so it wins even though the package exists.
      assert.equal(run(["sync", "--auto"]).trim(), "ran:copy");
      // Drop the marker: the copy stops being a candidate, the package runs.
      fs.rmSync(path.join(trackerDir, "app", READY_MARKER));
      assert.equal(run(["sync"]).trim(), "ran:package");
      // Neither candidate: exit code 3, not a silent success.
      fs.rmSync(packageEntry);
      assert.equal(
        require("node:child_process").spawnSync(process.execPath, [file, "sync"], { encoding: "utf8" }).status,
        3,
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
