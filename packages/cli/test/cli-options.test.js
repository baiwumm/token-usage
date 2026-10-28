// `sync --watch --interval <ms>`: README promises values below the 1-minute
// floor fall back to 15 min. The flag used to survive into cmdSync's args when
// the value was rejected, so every pass failed with "Unknown option".

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { resolveWatchInterval } = require("../src/cli");

const FALLBACK_MS = 15 * 60_000;

test("a valid --interval is adopted and removed from the sync args", () => {
  assert.deepEqual(resolveWatchInterval(["--watch", "--interval", "120000"]), {
    args: [],
    intervalMs: 120_000,
  });
});

test("--interval=<ms> works too and never leaks into the sync args", () => {
  assert.deepEqual(resolveWatchInterval(["--watch", "--interval=300000", "--no-sessions"]), {
    args: ["--no-sessions"],
    intervalMs: 300_000,
  });
  assert.deepEqual(resolveWatchInterval(["--interval=1000"]), {
    args: [],
    intervalMs: FALLBACK_MS,
  });
});

test("a sub-floor or missing --interval falls back to 15 min but is still removed", () => {
  for (const rest of [["--watch", "--interval", "1000"], ["--interval", "0"], ["--watch", "--interval"], ["--interval", "abc"]]) {
    const parsed = resolveWatchInterval(rest);
    assert.equal(parsed.intervalMs, FALLBACK_MS, `intervalMs for ${JSON.stringify(rest)}`);
    assert.deepEqual(parsed.args, [], `leftover args for ${JSON.stringify(rest)}`);
  }
});

test("unrelated sync flags survive untouched", () => {
  assert.deepEqual(resolveWatchInterval(["--watch", "--drain", "--no-sessions"]), {
    args: ["--drain", "--no-sessions"],
    intervalMs: FALLBACK_MS,
  });
});
