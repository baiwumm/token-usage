// Branding guard (AGENTS.md 硬性约束 9): the product is "Token Usage"; the
// tokentracker name may only survive as a legacy path alias. The vendored
// upstream banner still spelled TOKEN TRACKER until 0.2.3.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

function readSource(...segments) {
  return fs.readFileSync(path.join(__dirname, "..", "src", ...segments), "utf8");
}

test("init's welcome banner uses the Token Usage name", () => {
  const initSource = readSource("commands", "init.js");
  assert.match(initSource, /Token Usage/);
  assert.ok(!initSource.includes("Token Tracker"), "fork branding must not reappear in init");
  assert.ok(!initSource.includes("TRACKER"), "the ASCII logo must spell TOKEN USAGE");
});

test("no hint or comment tells users to run the upstream `tracker` binary", () => {
  // The bin is `tokenusage`; `tracker <command>` is the fork's binary name.
  // The device-login expiry error told users to re-run `tracker device-login`
  // until 2026-11-09 — a command that does not exist here. (`tracker dir`
  // stays legitimate: it names the ~/.tokenusage/tracker data directory.)
  const upstreamCommand =
    /\btracker (device-login|sync|status|init|doctor|reconcile|pause|resume|upload|uninstall|sessions)\b/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".js") || entry.name.endsWith(".cjs")) {
        fs.readFileSync(full, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (upstreamCommand.test(line)) {
              offenders.push(`${path.relative(path.join(__dirname, ".."), full)}:${index + 1}`);
            }
          });
      }
    }
  };
  walk(path.join(__dirname, "..", "src"));
  assert.deepEqual(offenders, []);
});
