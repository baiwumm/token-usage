"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Hostname fallback — the contract (§2.2) uses this when client_info carries
// no hostname, so the cloud device name stays `<host> #<machine_id[:8]>`.
const FALLBACK_DEVICE_NAME = "Token Usage CLI";

function trimmedString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function readSeedMachineId(seedPath) {
  try {
    return trimmedString(fs.readFileSync(seedPath, "utf8"));
  } catch {
    return "";
  }
}

function defaultSeedPath(home = os.homedir()) {
  return path.join(home, ".config", "tokenusage", "machine-id");
}

/**
 * This machine's cloud device identity.
 *
 * The device name is defined by docs/cli-contract.md §2.2:
 *   `<client_info hostname> #<machine_id first 8 chars>`
 * — client_info without a hostname falls back to "Token Usage CLI", a missing
 * machine_id drops the suffix. The cloud derives it the same way from the
 * `client_info` / `machine_id` the CLI sends at device-flow time, so the name
 * computed here matches the dashboard's device card byte for byte.
 *
 * Why the CLI bothers to print it: two collector machines report into one
 * account, and `status` output is what gets pasted into issue trackers and
 * release checklists. Without the identity in the output, a reader cannot tell
 * which machine produced a number — that is how "this machine" and "the other
 * machine" got mixed up in the docs.
 *
 * Read-only on purpose: unlike getOrCreateMachineId() this never mints or
 * persists an id, so `status` stays a safe command to run anywhere.
 */
function buildDeviceIdentity({
  config = {},
  hostname = os.hostname(),
  seedPath = null,
  home = os.homedir(),
} = {}) {
  const machineId =
    trimmedString(config.machineId) || (seedPath ? readSeedMachineId(seedPath) : "");
  const deviceId = trimmedString(config.deviceId);
  const host = trimmedString(hostname) || FALLBACK_DEVICE_NAME;
  const suffix = machineId ? machineId.slice(0, 8) : "";

  return {
    name: suffix ? `${host} #${suffix}` : host,
    hostname: host,
    machine_id: machineId || null,
    device_id: deviceId || null,
  };
}

/**
 * Identity of the machine this CLI runs on, reading the tracker config plus
 * the purge-surviving identity seed (so `status` still names the device after
 * a `uninstall --purge` wiped ~/.tokenusage).
 */
function resolveLocalDeviceIdentity({ config = {}, home = os.homedir() } = {}) {
  return buildDeviceIdentity({
    config,
    hostname: os.hostname(),
    seedPath: defaultSeedPath(home),
    home,
  });
}

module.exports = {
  FALLBACK_DEVICE_NAME,
  buildDeviceIdentity,
  resolveLocalDeviceIdentity,
};
