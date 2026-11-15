// `--source` and the auto-sync registry must accept every id sync can actually
// scan. Prime Agent had a parser but no entry in AUTO_SYNC_SOURCES, so
// normalizeSyncSource() rejected `--source prime-agent` and auto/background
// runs skipped it silently; AStudio is the CLI-facing name for the `acode`
// collector id, so both spellings have to resolve.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { formatSyncSourceList, normalizeSyncSource, parseSyncSourceArg } = require("../src/commands/sync");

test("prime-agent is a selectable source, not just a parser", () => {
  assert.equal(normalizeSyncSource("prime-agent"), "prime-agent");
  assert.equal(parseSyncSourceArg("prime-agent"), "prime-agent");
  assert.match(formatSyncSourceList(), /\bprime-agent\b/);
});

test("the AStudio label and the acode collector id resolve to one source", () => {
  assert.equal(normalizeSyncSource("astudio"), "acode");
  assert.equal(normalizeSyncSource("acode"), "acode");
});

test("unknown ids still fail loudly instead of degrading to a full scan", () => {
  assert.equal(normalizeSyncSource("totally-unknown-cli"), null);
  assert.throws(() => parseSyncSourceArg("totally-unknown-cli"), /Unknown --source value/);
});
