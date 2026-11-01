"use strict";

// `init --integrations` decides which tool configs may be written. The parser
// is covered by args-strict; this covers the other half — that the selection
// actually gates every hook-writing integration (and leaves passive readers
// alone), and that `tokenusage upload` refuses to run without a device token.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { applyIntegrationSetup, SELECTABLE_INTEGRATIONS } = require("../src/commands/init");
const { cmdUpload } = require("../src/commands/upload");
const { isUsageError } = require("../src/lib/cli-errors");

function makeSandboxHome() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-gate-"));
  return {
    root,
    home: path.join(root, "home"),
    trackerDir: path.join(root, "home", ".tokenusage", "tracker"),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

async function dryRunApply(sandbox, integrationSelection) {
  return applyIntegrationSetup({
    home: sandbox.home,
    trackerDir: sandbox.trackerDir,
    notifyPath: path.join(sandbox.trackerDir, "notify.cjs"),
    notifyOriginalPath: path.join(sandbox.trackerDir, "codex_notify_original.json"),
    dryRun: true,
    integrationSelection,
  });
}

test("an empty selection reports every hook integration as not selected", async () => {
  const sandbox = makeSandboxHome();
  try {
    const summary = await dryRunApply(sandbox, new Set());
    for (const entry of SELECTABLE_INTEGRATIONS) {
      const rows = summary.filter((item) => item.label === entry.label);
      assert.equal(rows.length, 1, `${entry.id} must appear exactly once`);
      assert.equal(rows[0].status, "skipped");
      assert.match(rows[0].detail, /Not selected/);
    }
    // Nothing was written: a gated init must not touch tool configs.
    assert.equal(fs.existsSync(sandbox.home), false, "no tool config directory may be created");
  } finally {
    sandbox.cleanup();
  }
});

test("a partial selection only probes the chosen integrations", async () => {
  const sandbox = makeSandboxHome();
  try {
    const summary = await dryRunApply(sandbox, new Set(["claude"]));
    const claude = summary.find((item) => item.label === "Claude");
    assert.equal(claude.status, "skipped");
    assert.equal(claude.detail, "Config not found", "the selected tool is probed normally");
    for (const entry of SELECTABLE_INTEGRATIONS.filter((item) => item.id !== "claude")) {
      const row = summary.find((item) => item.label === entry.label);
      assert.match(row.detail, /Not selected/, `${entry.id} must stay untouched`);
    }
  } finally {
    sandbox.cleanup();
  }
});

test("no selection preserves the configure-everything behaviour", async () => {
  const sandbox = makeSandboxHome();
  try {
    const summary = await dryRunApply(sandbox, null);
    assert.equal(
      summary.some((item) => /Not selected/.test(item.detail)),
      false,
      "an absent flag must not skip anything",
    );
    const claude = summary.find((item) => item.label === "Claude");
    assert.equal(claude.detail, "Config not found");
  } finally {
    sandbox.cleanup();
  }
});

test("upload refuses to run before the machine is paired", async () => {
  const sandbox = makeSandboxHome();
  const savedToken = process.env.TOKENUSAGE_DEVICE_TOKEN;
  const savedBase = process.env.TOKENUSAGE_BASE_URL;
  const savedLegacyBase = process.env.TOKENUSAGE_INSFORGE_BASE_URL;
  try {
    delete process.env.TOKENUSAGE_DEVICE_TOKEN;
    delete process.env.TOKENUSAGE_BASE_URL;
    delete process.env.TOKENUSAGE_INSFORGE_BASE_URL;
    await assert.rejects(
      cmdUpload([], { home: sandbox.home }),
      (error) => {
        assert.ok(isUsageError(error));
        assert.equal(error.code, "NO_DEVICE_TOKEN");
        assert.equal(error.exitCode, 2);
        assert.match(error.hint, /device-login/);
        return true;
      },
    );
    // Nothing to create: the refusal happens before queue/lock work.
    assert.equal(fs.existsSync(path.join(sandbox.trackerDir, "queue.jsonl")), false);
  } finally {
    if (savedToken === undefined) delete process.env.TOKENUSAGE_DEVICE_TOKEN;
    else process.env.TOKENUSAGE_DEVICE_TOKEN = savedToken;
    if (savedBase === undefined) delete process.env.TOKENUSAGE_BASE_URL;
    else process.env.TOKENUSAGE_BASE_URL = savedBase;
    if (savedLegacyBase === undefined) delete process.env.TOKENUSAGE_INSFORGE_BASE_URL;
    else process.env.TOKENUSAGE_INSFORGE_BASE_URL = savedLegacyBase;
    sandbox.cleanup();
  }
});
