"use strict";

// Command dispatch + help: unknown commands are user input, not crashes
// (`tokenusage bogus` used to dump a stack), every command answers `--help`
// without throwing, and the watch interval backs off instead of hammering.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { run, printCommandHelp, COMMANDS, resolveWatchDelay } = require("../src/cli");
const { UsageError, isUsageError, unknownOptionError } = require("../src/lib/cli-errors");

async function captureStdout(fn) {
  const chunks = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => {
    chunks.push(String(chunk));
    return true;
  };
  try {
    await fn();
  } finally {
    process.stdout.write = original;
  }
  return chunks.join("");
}

test("UsageError is flagged and carries a hint + exit code 2", () => {
  const error = new UsageError("bad input", { hint: "run --help", code: "TEST" });
  assert.ok(isUsageError(error));
  assert.equal(error.exitCode, 2);
  assert.equal(error.code, "TEST");
  assert.equal(error.hint, "run --help");
  assert.ok(!isUsageError(new Error("internal failure")));
  assert.ok(!isUsageError(null));

  const unknown = unknownOptionError("--bogus", "sync");
  assert.ok(isUsageError(unknown));
  assert.equal(unknown.code, "UNKNOWN_OPTION");
  assert.match(unknown.hint, /tokenusage sync --help/);
});

test("an unknown command throws a UsageError instead of dumping a stack", async () => {
  await assert.rejects(
    () => run(["bogus"]),
    (error) => {
      assert.ok(isUsageError(error), "must be a UsageError so bin/ can skip the stack");
      assert.equal(error.code, "UNKNOWN_COMMAND");
      assert.equal(error.exitCode, 2);
      assert.match(error.hint, /tokenusage --help/);
      return true;
    },
  );
  // `tokenusage help <unknown>` takes the same path.
  await assert.rejects(() => run(["help", "bogus"]), (error) => isUsageError(error));
});

test("every command answers --help and help <command> without throwing", async () => {
  for (const spec of COMMANDS) {
    const out = await captureStdout(() => run([spec.name, "--help"]));
    assert.ok(out.includes(`tokenusage ${spec.name}`), `${spec.name} must print its usage line`);
    assert.match(out, /tokenusage --help/, `${spec.name} must point back at the command list`);
    const viaHelpVerb = await captureStdout(() => run(["help", spec.name]));
    assert.equal(viaHelpVerb, out, `${spec.name}: help verb and --help must render the same block`);
  }
});

test("the command table lists every user-facing command", () => {
  const names = COMMANDS.map((spec) => spec.name);
  for (const expected of [
    "init",
    "sync",
    "upload",
    "pause",
    "resume",
    "status",
    "diagnostics",
    "doctor",
    "uninstall",
    "device-login",
    "sessions",
  ]) {
    assert.ok(names.includes(expected), `${expected} must be reachable from the CLI`);
  }
});

test("sync help lists the selectable --source ids", async () => {
  const out = await captureStdout(() => printCommandHelp("sync"));
  assert.match(out, /Available --source ids:/);
  assert.ok(out.includes("claude"), "provider ids must be discoverable from --help");
});

test("watch backoff steps 1x → 2x → 5x and stays at 5x", () => {
  const base = 15 * 60_000;
  assert.equal(resolveWatchDelay({ intervalMs: base }), base);
  assert.equal(resolveWatchDelay({ intervalMs: base, failureCount: 1 }), base * 2);
  assert.equal(resolveWatchDelay({ intervalMs: base, failureCount: 2 }), base * 5);
  assert.equal(resolveWatchDelay({ intervalMs: base, failureCount: 9 }), base * 5);
  // Junk input must not produce NaN delays.
  assert.equal(resolveWatchDelay({ intervalMs: base, failureCount: -1 }), base);
  assert.equal(resolveWatchDelay({ intervalMs: base, failureCount: "abc" }), base);
});
