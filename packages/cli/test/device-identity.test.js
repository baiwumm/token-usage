"use strict";

// Which collector machine am I looking at?
//
// One account has two collector machines (a home box and an office box), and
// `status` / `doctor` output is what gets pasted into release checklists. These
// tests pin the identity the CLI prints:
//
//   device name = `<hostname> #<machine_id first 8>`   (docs/cli-contract.md §2.2)
//   status --json gains a `device` block
//   doctor gains the `runtime.device_identity` check
//
// Without it, "this machine" and "the other machine" are indistinguishable in
// the docs — which is exactly how the CLI-upgrade records got mixed up.

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const { buildDeviceIdentity, resolveLocalDeviceIdentity } = require("../src/lib/device-identity");
const { buildDeviceIdentityChecks } = require("../src/lib/doctor");
const { renderLightTable } = require("../src/commands/status");

const MACHINE_ID = "48ea790e41eab4eccc604bc027f9968cb2d2c00c07186dc144a11e387a591798";
const DEVICE_ID = "6a074a51-693b-48e3-9f65-0728f9f2ee5c";

test("the device name is hostname + machine_id prefix, matching the cloud row", () => {
  const identity = buildDeviceIdentity({
    config: { machineId: MACHINE_ID, deviceId: DEVICE_ID },
    hostname: "DESKTOP-MHFON1J",
  });

  assert.equal(identity.name, "DESKTOP-MHFON1J #48ea790e");
  assert.equal(identity.hostname, "DESKTOP-MHFON1J");
  assert.equal(identity.machine_id, MACHINE_ID);
  assert.equal(identity.device_id, DEVICE_ID);
});

test("a missing machine_id drops the suffix instead of printing a bare hash", () => {
  const identity = buildDeviceIdentity({ config: {}, hostname: "DESKTOP-MHFON1J" });

  assert.equal(identity.name, "DESKTOP-MHFON1J");
  assert.equal(identity.machine_id, null);
  assert.equal(identity.device_id, null);
});

test("an unusable hostname falls back to the contract's literal", () => {
  const identity = buildDeviceIdentity({ config: {}, hostname: "  " });

  assert.equal(identity.name, "Token Usage CLI");
});

test("the purge-surviving seed file restores the identity after config loss", (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-device-identity-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const seedPath = path.join(home, ".config", "tokenusage", "machine-id");
  fs.mkdirSync(path.dirname(seedPath), { recursive: true });
  fs.writeFileSync(seedPath, `${MACHINE_ID}\n`, "utf8");

  const identity = resolveLocalDeviceIdentity({ config: {}, home });
  assert.equal(identity.machine_id, MACHINE_ID);
  assert.equal(identity.name, `${os.hostname()} #48ea790e`);
});

test("doctor reports the device identity as its own check", () => {
  const [ok] = buildDeviceIdentityChecks({
    name: "DESKTOP-MHFON1J #48ea790e",
    hostname: "DESKTOP-MHFON1J",
    machine_id: MACHINE_ID,
    device_id: DEVICE_ID,
  });

  assert.equal(ok.id, "runtime.device_identity");
  assert.equal(ok.status, "ok");
  assert.match(ok.detail, /DESKTOP-MHFON1J #48ea790e/);
  assert.equal(ok.meta.device_id, DEVICE_ID);

  const [warn] = buildDeviceIdentityChecks({
    name: "DESKTOP-MHFON1J",
    hostname: "DESKTOP-MHFON1J",
    machine_id: null,
    device_id: null,
  });
  assert.equal(warn.status, "warn");
  assert.match(warn.detail, /machine_id missing/);
});

test("the light table names the device and its id", () => {
  const table = renderLightTable({
    version: "0.4.6",
    base_url: "https://token-usage.baiwumm.com",
    device_token_set: true,
    device: {
      name: "DESKTOP-MHFON1J #48ea790e",
      hostname: "DESKTOP-MHFON1J",
      machine_id: MACHINE_ID,
      device_id: DEVICE_ID,
    },
    queue: { pending_bytes: 0, size_bytes: 0 },
    hooks: {},
    extra_scan_roots: [],
    providers: {},
  });

  assert.match(table, /DESKTOP-MHFON1J #48ea790e/);
  assert.match(table, /6a074a51-693b-48e3-9f65-0728f9f2ee5c/);
});

test("status --json carries the device block end to end", async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-status-identity-"));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));

  const trackerDir = path.join(home, ".tokenusage", "tracker");
  fs.mkdirSync(trackerDir, { recursive: true });
  fs.writeFileSync(
    path.join(trackerDir, "config.json"),
    JSON.stringify({ machineId: MACHINE_ID, deviceId: DEVICE_ID }),
    "utf8",
  );

  // Spawn the real CLI instead of capturing process.stdout: monkeypatching it
  // would also swallow the test runner's own reporter output.
  const cliPath = path.join(__dirname, "..", "bin", "tokenusage.js");
  const out = execFileSync(process.execPath, [cliPath, "status", "--json"], {
    env: { ...process.env, HOME: home, USERPROFILE: home },
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });

  const summary = JSON.parse(out);
  assert.equal(summary.device.name, `${os.hostname()} #48ea790e`);
  assert.equal(summary.device.machine_id, MACHINE_ID);
  assert.equal(summary.device.device_id, DEVICE_ID);
});
