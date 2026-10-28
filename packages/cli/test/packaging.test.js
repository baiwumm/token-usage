// Packaging guards: what `npm pack` ships must actually boot. 0.1.x shipped
// without bin/tracker.js (installer still pointed at the pre-fork name) and
// local-api's dormant local server still resolved that missing path. The
// upstream install-count heartbeat was also never ported to this backend.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const PACKAGE_ROOT = path.join(__dirname, "..");
const SRC = path.join(PACKAGE_ROOT, "src");

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

test("local-api spawns the package bin entry, not the missing bin/tracker.js", () => {
  const source = readSource("src", "lib", "local-api.js");
  assert.ok(!source.includes('"../../bin/tracker.js"'), "bin/tracker.js never existed after the fork");
  const match = source.match(/TRACKER_BIN = path\.resolve\(__dirname, "([^"]+)"\)/);
  assert.ok(match, "TRACKER_BIN must stay a single resolved path");
  assert.ok(
    fs.existsSync(path.resolve(path.join(SRC, "lib"), match[1])),
    `local-api spawn target does not resolve: ${match[1]}`,
  );
});

test("telemetry opt-out flags still gate the optional Sentry reporting", () => {
  const { isTelemetryDisabled } = require("../src/lib/telemetry-pref");
  assert.equal(isTelemetryDisabled({ env: {}, config: {} }), false);
  assert.equal(isTelemetryDisabled({ env: { TOKENUSAGE_NO_TELEMETRY: "1" }, config: {} }), true);
  assert.equal(isTelemetryDisabled({ env: { DO_NOT_TRACK: "true" }, config: {} }), true);
  assert.equal(isTelemetryDisabled({ env: {}, config: { telemetry: false } }), true);
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
