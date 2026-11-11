"use strict";

// `tokenusage project-profiles` — read-only mirror of the web-edited project
// profiles (docs/cli-contract.md §2.13), for the desktop companion: the
// desktop never reads the device token file (desktop-plan §3 boundary 1), so
// the CLI — which already holds the pairing credential — fetches the account
// payload and prints it as a single JSON line on stdout. Diagnostics travel
// through UsageError (stderr + exit 2) so stdout stays parseable.

const os = require("node:os");
const path = require("node:path");

const { readJson } = require("../lib/fs");
const { resolveTrackerPaths } = require("../lib/tracker-paths");
const { normalizeInstanceBaseUrl, resolveRuntimeConfig } = require("../lib/runtime-config");
const { readCloudDeviceTokenEntry } = require("../lib/cloud-device-token");
const { functionUrlFor, fetchFunctionResponse } = require("../lib/function-url");
const { UsageError, unknownOptionError } = require("../lib/cli-errors");

// Contract §2.13: the desktop parses this exact payload shape.
const SLUG = "token-usage-account-project-profiles";

function parseArgs(args = []) {
  for (const a of args) throw unknownOptionError(a, "project-profiles");
  return {};
}

/**
 * Same resolution order as `resolveDeviceTokenPresence`: runtime config
 * (env / config.json) first, then the cloud-device-token file — but this
 * returns the VALUE, which the desktop's `run_cli` capture turns into data.
 * The cloud file is only trusted when its recorded instance matches the
 * configured one (same guard as the presence check).
 */
async function resolveCredentials({ home }) {
  const { trackerDir } = await resolveTrackerPaths({ home });
  const config = (await readJson(path.join(trackerDir, "config.json"))) || {};
  const runtime = resolveRuntimeConfig({ config, env: process.env });
  const baseUrl =
    typeof runtime.baseUrl === "string" ? runtime.baseUrl.trim() : "";
  let deviceToken =
    typeof runtime.deviceToken === "string" ? runtime.deviceToken.trim() : "";

  if (!deviceToken) {
    const entry = readCloudDeviceTokenEntry(
      path.join(trackerDir, "cloud-device-token.json"),
    );
    // The cache entry stores the credential as `token` (bound to userId /
    // baseUrl / machineId), unlike config.json's `deviceToken`.
    const entryToken =
      entry && typeof entry.token === "string" ? entry.token.trim() : "";
    const entryBase = normalizeInstanceBaseUrl(
      (entry && entry.baseUrl) || "",
    );
    const configuredBase = normalizeInstanceBaseUrl(baseUrl);

    if (entryToken && (!configuredBase || entryBase === configuredBase)) {
      deviceToken = entryToken;
    }
  }

  return { baseUrl, deviceToken };
}

async function cmdProjectProfiles(argv = [], context = {}) {
  parseArgs(argv);
  const home = context.home || os.homedir();
  const { baseUrl, deviceToken } = await resolveCredentials({ home });

  if (!baseUrl || !deviceToken) {
    throw new UsageError("This machine is not paired yet.", {
      code: "NOT_PAIRED",
      hint: "Run `tokenusage device-login` first, then try again.",
    });
  }

  const res = await fetchFunctionResponse(functionUrlFor(baseUrl, SLUG), {
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${deviceToken}`,
    },
  });
  if (!res.ok) {
    const body = (await res.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
    throw new UsageError(`Request failed with HTTP ${res.status}.`, {
      code: "HTTP_ERROR",
      hint: body || "Check your instance URL and try again.",
    });
  }
  const payload = await res.json();
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

module.exports = { cmdProjectProfiles };
