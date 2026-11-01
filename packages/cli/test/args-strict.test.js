"use strict";

// Strict argument parsing. Every command used to accept typos silently:
// `sync --source bogus` scanned all 46 providers instead of the requested one,
// `sessions --format yaml` exported JSON anyway, and init's browser-sign-in
// flags (`--email`, `--password`, …) parsed into fields nothing read. A
// user-facing CLI must fail loudly with a hint instead.

const assert = require("node:assert/strict");
const { test } = require("node:test");

const { isUsageError } = require("../src/lib/cli-errors");
const { parseArgs: parseUpload } = require("../src/commands/upload");
const { parseArgs: parseSessions } = require("../src/commands/sessions");
const { parseArgs: parseInit, parseIntegrationsFlag, SELECTABLE_INTEGRATIONS } = require("../src/commands/init");
const { parseSyncSourceArg, formatSyncSourceList } = require("../src/commands/sync");

test("upload accepts --drain/--force/--json and rejects anything else", () => {
  assert.deepEqual(parseUpload([]), { drain: false, json: false });
  assert.deepEqual(parseUpload(["--drain", "--json"]), { drain: true, json: true });
  assert.deepEqual(parseUpload(["--force"]), { drain: true, json: false });
  assert.throws(() => parseUpload(["--bogus"]), (error) => {
    assert.ok(isUsageError(error));
    assert.equal(error.code, "UNKNOWN_OPTION");
    assert.match(error.hint, /upload --help/);
    return true;
  });
});

test("sessions defaults to json and parses value flags", () => {
  assert.deepEqual(parseSessions([]), { format: "json", out: null, from: null, to: null, refresh: false, git: true });
  assert.deepEqual(parseSessions(["--format", "CSV", "--from", "2026-01-01", "--to", "2026-01-31", "--no-git"]), {
    format: "csv",
    out: null,
    from: "2026-01-01",
    to: "2026-01-31",
    refresh: false,
    git: false,
  });
  assert.deepEqual(parseSessions(["--csv", "--refresh", "--out", "report.csv"]), {
    format: "csv",
    out: "report.csv",
    from: null,
    to: null,
    refresh: true,
    git: true,
  });
});

test("sessions fails loudly on a missing value, a bad format, or an unknown flag", () => {
  for (const args of [["--format"], ["--out"], ["--from", "--csv"]]) {
    assert.throws(() => parseSessions(args), (error) => {
      assert.ok(isUsageError(error));
      assert.equal(error.code, "MISSING_VALUE");
      return true;
    }, `missing value for ${JSON.stringify(args)}`);
  }
  assert.throws(() => parseSessions(["--format", "yaml"]), (error) => {
    assert.equal(error.code, "FORMAT_UNKNOWN");
    assert.match(error.hint, /json/);
    return true;
  });
  assert.throws(() => parseSessions(["--bogus"]), (error) => error.code === "UNKNOWN_OPTION");
});

test("sync --source validates against the known provider ids", () => {
  assert.equal(parseSyncSourceArg("claude"), "claude");
  assert.ok(formatSyncSourceList().includes("claude"));
  assert.throws(() => parseSyncSourceArg(""), (error) => {
    assert.equal(error.code, "SOURCE_MISSING");
    assert.match(error.hint, /Available ids/);
    return true;
  });
  assert.throws(() => parseSyncSourceArg("bogus"), (error) => {
    assert.equal(error.code, "SOURCE_UNKNOWN");
    assert.match(error.message, /bogus/);
    assert.match(error.hint, /Available ids/);
    return true;
  });
});

test("init --integrations selects a subset, all, or none", () => {
  assert.equal(parseIntegrationsFlag("all"), null, "`all` means configure everything detected");
  assert.deepEqual([...parseIntegrationsFlag("none")], []);
  assert.deepEqual([...parseIntegrationsFlag("claude,codex")].sort(), ["claude", "codex"]);
  // Case and stray spaces are forgiven; unknown ids are not.
  assert.deepEqual([...parseIntegrationsFlag("Claude , Codex ")].sort(), ["claude", "codex"]);
  assert.throws(() => parseIntegrationsFlag("claude,bogus"), (error) => {
    assert.equal(error.code, "INTEGRATIONS_UNKNOWN");
    assert.match(error.hint, /Available ids/);
    return true;
  });
  assert.throws(() => parseIntegrationsFlag(""), (error) => error.code === "INTEGRATIONS_MISSING");
});

test("init parseArgs wires --integrations into the selection", () => {
  const defaults = parseInit([]);
  assert.equal(defaults.integrationSelection, null);
  assert.equal(defaults.noIntegrations, false);

  const selected = parseInit(["--integrations=claude,gemini", "--yes"]);
  assert.deepEqual([...selected.integrationSelection].sort(), ["claude", "gemini"]);
  assert.equal(selected.yes, true);

  const spaced = parseInit(["--integrations", "codex"]);
  assert.deepEqual([...spaced.integrationSelection], ["codex"]);

  // --no-integrations keeps its "touch nothing" semantics.
  const none = parseInit(["--no-integrations"]);
  assert.equal(none.noIntegrations, true);
  assert.deepEqual([...none.integrationSelection], []);
});

test("init rejects the retired browser sign-in flags with a pointer to device-login", () => {
  for (const flag of ["--email", "--password", "--device-name", "--link-code", "--no-auth"]) {
    assert.throws(() => parseInit([flag, "value"]), (error) => {
      assert.ok(isUsageError(error));
      assert.equal(error.code, "FLAG_REMOVED");
      assert.match(error.message, /removed/);
      assert.match(error.hint, /device-login/);
      return true;
    }, `${flag} must not be silently ignored`);
  }
});

test("init rejects unknown options and invalid --run-report values", () => {
  assert.throws(() => parseInit(["--bogus"]), (error) => error.code === "UNKNOWN_OPTION");
  assert.throws(() => parseInit(["--run-report=maybe"]), (error) => error.code === "RUN_REPORT_INVALID");
  assert.equal(parseInit(["--run-report=off"]).runReport, false);
  assert.equal(parseInit(["--run-report=on"]).runReport, true);
});

test("the selectable integration list is the hook-writing subset", () => {
  const ids = SELECTABLE_INTEGRATIONS.map((entry) => entry.id);
  assert.ok(ids.includes("codex"));
  assert.ok(ids.includes("opencode"));
  assert.ok(!ids.includes("cursor"), "passive readers are never gated");
  assert.equal(new Set(ids).size, ids.length, "ids must be unique");
});
