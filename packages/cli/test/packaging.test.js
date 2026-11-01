// Packaging guards: what `npm pack` ships must actually boot. 0.1.x shipped
// without bin/tracker.js (installer still pointed at the pre-fork name) and
// the fork's retired local dashboard server still resolved that missing path.
// The upstream install-count heartbeat was also never ported to this backend.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const PACKAGE_ROOT = path.join(__dirname, "..");
const SRC = path.join(PACKAGE_ROOT, "src");
const BIN = path.join(PACKAGE_ROOT, "bin");

function readSource(...segments) {
  return fs.readFileSync(path.join(PACKAGE_ROOT, ...segments), "utf8");
}

test("package bin points at the CLI entry that actually ships", () => {
  const pkg = JSON.parse(readSource("package.json"));
  assert.equal(pkg.bin.tokenusage, "bin/tokenusage.js");
  assert.ok(
    fs.existsSync(path.join(PACKAGE_ROOT, pkg.bin.tokenusage)),
    "the declared bin file must exist in the tarball",
  );
});

// The fork dropped the local dashboard server (the hosted site is the only
// dashboard) but kept its module graph shipping: ~260 KB of HTTP routes and
// local badge/achievement aggregation that nothing on the CLI path could
// reach. The queue-row correction the upload path still needs now lives in
// lib/queue-row-normalize.js. The pricing engine stays: session analytics use
// it to price per-model cost.
test("the retired local API stays deleted", () => {
  const retired = [
    "local-api.js",
    "cloud-account.js",
    "wrapped-aggregator.js",
    "outcomes-engine.js",
    "context-health.js",
    "skills-manager.js",
    "skill-usage.js",
    "pet-packages.js",
    "subscription-manager.js",
    "source-metadata.js",
    "async-queue-reader.js",
    "codex-context-breakdown.js",
    "grok-context-breakdown.js",
    "heatmap-compact.js",
  ];
  for (const name of retired) {
    assert.ok(!fs.existsSync(path.join(SRC, "lib", name)), `src/lib/${name} must stay deleted`);
  }
  const sync = readSource("src", "commands", "sync.js");
  assert.ok(
    sync.includes('require("../lib/queue-row-normalize")'),
    "the upload path normalizes legacy queue rows through the shared module",
  );
  assert.ok(!sync.includes("local-api"), "sync.js must not reintroduce the local API require");
});

// Node resolves `require("./pricing")` to pricing/index.js; a naive
// `${target}.js` join would silently skip every directory module and miss
// exactly the dead-weight this test is looking for.
function resolveRequire(fromFile, target) {
  const base = path.resolve(path.dirname(fromFile), target);
  for (const candidate of [base, `${base}.js`, path.join(base, "index.js")]) {
    // A directory candidate is not a module: fall through to <dir>/index.js.
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return `${base}.js`;
}

test("no dead module ships: every src file is reachable from the CLI entry", () => {
  const entryPoints = [
    path.resolve(BIN, "tokenusage.js"),
    path.resolve(SRC, "cli.js"),
  ];
  const reachable = new Set();
  const queue = [...entryPoints];
  while (queue.length > 0) {
    const file = queue.shift();
    if (reachable.has(file)) continue;
    reachable.add(file);
    let source;
    try {
      source = fs.readFileSync(file, "utf8");
    } catch {
      continue; // a require of a non-JS asset (json, snapshot) is not a module
    }
    for (const match of source.matchAll(/require\((['"])([^'"]+)(['"])\)/g)) {
      const target = match[2];
      if (target.startsWith(".")) queue.push(resolveRequire(file, target));
    }
  }
  const unreachable = fs
    .readdirSync(SRC, { recursive: true })
    .map((rel) => path.resolve(SRC, String(rel)))
    .filter((file) => file.endsWith(".js") && !reachable.has(file))
    .map((file) => path.relative(PACKAGE_ROOT, file));
  assert.deepEqual(unreachable, [], "unreachable modules are dead weight in the tarball");
});

test("the unused Sentry error-reporting SDK stays out of the package", () => {
  // 0.2.6 removed @sentry/node: it was only initialized (captureException had no
  // call sites) and shipped 44 MB into the runtime copy plus a build-time
  // bundler-plugin chain into every npm install. Keep it out unless the
  // reporting path is actually wired and budgeted again.
  const pkg = JSON.parse(readSource("package.json"));
  const declared = { ...(pkg.dependencies || {}), ...(pkg.optionalDependencies || {}) };
  assert.ok(
    !Object.keys(declared).some((name) => name === "@sentry/node" || name.startsWith("@sentry/")),
    "@sentry/* must not be a declared dependency",
  );
  assert.ok(
    !fs.existsSync(path.join(SRC, "lib", "sentry.js")),
    "the inert sentry bootstrap must stay deleted",
  );
  assert.ok(
    !fs.existsSync(path.join(SRC, "lib", "telemetry-pref.js")),
    "the opt-out helper only existed to gate Sentry",
  );
  const roots = [SRC, BIN];
  for (const root of roots) {
    const sourceFiles = fs
      .readdirSync(root, { recursive: true })
      .filter((rel) => String(rel).endsWith(".js"));
    for (const rel of sourceFiles) {
      const source = fs.readFileSync(path.join(root, String(rel)), "utf8");
      assert.ok(!source.includes("@sentry/"), `${rel} must not require the removed SDK`);
    }
  }
});

test("the unported install heartbeat stays removed", () => {
  assert.ok(
    !fs.existsSync(path.join(SRC, "lib", "telemetry.js")),
    "the backend has no /api/functions/tokenusage-telemetry route, so nothing may post to it",
  );
  const sync = readSource("src", "commands", "sync.js");
  assert.ok(!sync.includes("maybeSendHeartbeat"));
  assert.ok(!sync.includes('require("../lib/telemetry")'));
});

test("every auto-sync spawn point gates on the runtime-copy readiness marker", () => {
  // 0.2.4: a runtime copy without its marker is a half copy (missing deps) and
  // dies with MODULE_NOT_FOUND inside an ignored stdio stream — collection
  // looks alive while nothing is collected. Each generated/hidden launcher must
  // check the marker before choosing it.
  const init = readSource("src", "commands", "init.js");
  assert.ok(init.includes("runtimeReadyMarkerPath"), "init.js must write and probe the marker");

  const notify = readSource("src", "commands", "init.js");
  assert.ok(
    notify.includes("const hasLocalRuntime = fs.existsSync(runtimeReadyPath) && fs.existsSync(trackerBinPath);"),
    "the notify handler must require both the launcher and the marker",
  );

  for (const file of [["src", "lib", "openclaw-hook.js"], ["src", "lib", "openclaw-session-plugin.js"]]) {
    const source = readSource(...file);
    assert.ok(
      source.includes("runtimeReadyPath") && source.includes("packageEntryPath"),
      `${file.join("/")} must bake the marker + installed-package fallback`,
    );
  }

  const sync = readSource("src", "commands", "sync.js");
  assert.ok(
    sync.includes("runtimeReadyPath") && sync.includes("packageEntryPath"),
    "the auto-retry script must use the same launcher selection",
  );
});
