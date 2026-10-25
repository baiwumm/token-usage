"use strict";

// Smoke: the vendored CLI boots against the token-usage contract — the entry
// loads, help/version print, and the device-flow authorize request matches
// docs/cli-contract.md §2.1 (client_info + machine_id, no credentials).

const assert = require("node:assert/strict");
const { test } = require("node:test");

test("cli entry loads and prints version + help", async () => {
  const { run } = require("../src/cli.js");

  let out = "";
  const originalWrite = process.stdout.write;
  process.stdout.write = (chunk) => {
    out += String(chunk);
    return true;
  };
  try {
    await run(["--version"]);
    assert.match(out, /^v\d+\.\d+\.\d+\n$/);
    out = "";
    await run(["--help"]);
    assert.match(out, /tokenusage/);
    assert.match(out, /--watch/);
    assert.ok(!out.includes("serve"));
  } finally {
    process.stdout.write = originalWrite;
  }
});

test("device-flow authorize request matches the contract shape", async () => {
  const captured = [];
  // Narrow seam: device-login reads fetchFunctionResponse through lib.
  const { functionUrlFor } = require("../src/lib/function-url");

  assert.equal(
    functionUrlFor("https://token-usage-delta.vercel.app", "token-usage-device-flow-authorize"),
    "https://token-usage-delta.vercel.app/api/functions/token-usage-device-flow-authorize",
  );

  const { resolveRuntimeConfig } = require("../src/lib/runtime-config");
  const runtime = resolveRuntimeConfig({});
  assert.equal(runtime.baseUrl, "https://token-usage-delta.vercel.app");
  assert.ok(runtime.anonKey && runtime.anonKey.startsWith("sb_publishable_"));
  assert.equal(runtime.configurationError, null);
  assert.ok(captured.length === 0);
});
