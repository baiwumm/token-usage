#!/usr/bin/env node
"use strict";

/**
 * Two-device acceptance check for a Token Usage deployment.
 *
 * Run this on any enrolled PC (its device token authorizes account reads):
 *
 *   node scripts/selfhost/verify-two-device.cjs
 *   node scripts/selfhost/verify-two-device.cjs --expect-total 13161295868
 *   node scripts/selfhost/verify-two-device.cjs --expect-device pc-one=8500000000
 *
 * It prints the combined total, per-device totals and the account-level
 * source split, then enforces the cutover acceptance rules:
 *   1. both endpoints answer 200 for the device token (auth + deployment);
 *   2. at least two active devices have usage;
 *   3. the combined total equals the sum of the per-device totals;
 *   4. (with --expect-total) the combined total matches the queue's
 *      last-wins baseline captured before the second collector joined;
 *   5. (with --expect-device name=total) a specific device matches its
 *      recorded baseline. Re-run after a manual `sync --drain` on each PC —
 *      the total must not move (ingest is an upsert).
 */

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function readJsonArgList(name) {
  const values = [];
  const argv = process.argv;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === name && argv[i + 1]) values.push(String(argv[i + 1]));
  }
  return values;
}

function loadToken(configPath) {
  const raw = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const token = raw.deviceToken || raw.device_token;
  const baseUrl = raw.deviceTokenBaseUrl || raw.baseUrl || "";
  if (!token) throw new Error(`no deviceToken in ${configPath} — run \`tracker device-login\` first`);
  if (!baseUrl) throw new Error(`no baseUrl in ${configPath}`);
  return { token, baseUrl: String(baseUrl).trim().replace(/\/$/, "") };
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 300) };
  }
  return { status: response.status, body };
}

function dayOffsetFromToday(days) {
  const date = new Date(Date.now() + days * 86400000);
  return date.toISOString().slice(0, 10);
}

function parseExpectations(entries) {
  const expected = new Map();
  for (const entry of entries) {
    const eq = String(entry).lastIndexOf("=");
    if (eq <= 0) throw new Error(`--expect-device expects name=total, got: ${entry}`);
    const name = String(entry).slice(0, eq).trim();
    const total = Number(String(entry).slice(eq + 1).trim());
    if (!name || !Number.isFinite(total) || total < 0) {
      throw new Error(`--expect-device expects name=total, got: ${entry}`);
    }
    expected.set(name, total);
  }
  return expected;
}

function buildReport(summary, deviceView) {
  // Per-device list: the summary's own device array when the deployment
  // exposes one, else the account-devices view. The view lists machine rows
  // only (account-level sources come separately), so a view-derived
  // device_sum reconciles through machine_plus_account_sum — the flat
  // combined == Σ devices check applies only to a summary-carried list.
  const summaryDevices = Array.isArray(summary.devices) ? summary.devices : null;
  const devices = summaryDevices
    || (deviceView?.devices || []).map((device) => ({
      device_name: device.device_name,
      device_id: device.id,
      total_tokens: Number(device.total_tokens) || 0,
      last_hour: device.last_hour || null,
    }));
  const active = devices.filter((device) => device.active ?? (Number(device.total_tokens) || 0) > 0);
  const deviceSum = devices.reduce((sum, device) => sum + (Number(device.total_tokens) || 0), 0);
  const combined = Number(summary.totals?.total_tokens ?? summary.total_tokens) || 0;
  const report = {
    combined_total: combined,
    device_sum_source: summaryDevices ? "summary" : "device_view",
    active_devices: active.map((device) => ({
      device_name: device.device_name,
      device_id: device.device_id,
      total_tokens: Number(device.total_tokens) || 0,
      last_hour: device.last_hour || null,
    })),
    device_sum: deviceSum,
    account_sources: deviceView
      ? deviceView.account_sources
      : null,
  };
  if (deviceView) {
    const splitSum =
      deviceView.devices.reduce((sum, device) => sum + (Number(device.total_tokens) || 0), 0) +
      (deviceView.account_sources || []).reduce((sum, source) => sum + (Number(source.total_tokens) || 0), 0);
    report.machine_plus_account_sum = splitSum;
  }
  return report;
}

async function main() {
  const jsonOut = process.argv.includes("--json");
  const configPath = path.resolve(readArg("--config") || path.join(os.homedir(), ".tokentracker", "tracker", "config.json"));
  const { token, baseUrl } = (() => {
    const tokenArg = readArg("--token");
    const baseArg = readArg("--base-url");
    if (tokenArg && baseArg) return { token: tokenArg, baseUrl: baseArg.replace(/\/$/, "") };
    return loadToken(configPath);
  })();

  const failures = [];
  const check = (ok, message) => {
    if (!ok) failures.push(message);
    return ok;
  };

  const summaryResp = await fetchJson(`${baseUrl}/functions/token-usage-account-summary`, token);
  check(summaryResp.status === 200, `account-summary returned HTTP ${summaryResp.status}`);

  const from = readArg("--from") || dayOffsetFromToday(-1095);
  const to = readArg("--to") || dayOffsetFromToday(0);
  const devicesResp = await fetchJson(`${baseUrl}/functions/token-usage-account-devices?from=${from}&to=${to}`, token);
  check(devicesResp.status === 200, `account-devices returned HTTP ${devicesResp.status}`);

  const report = summaryResp.status === 200
    ? buildReport(summaryResp.body, devicesResp.status === 200 ? devicesResp.body : null)
    : { combined_total: null, active_devices: [], device_sum: 0 };

  check(report.active_devices.length >= 2, `expected at least 2 active devices, saw ${report.active_devices.length}`);
  for (const device of report.active_devices) {
    check(device.total_tokens > 0, `device ${device.device_name} has zero usage`);
  }
  if (Number.isFinite(report.combined_total) && report.device_sum_source === "summary") {
    check(
      report.combined_total === report.device_sum,
      `combined total ${report.combined_total} != sum of device totals ${report.device_sum}`,
    );
  }
  if (report.machine_plus_account_sum != null && Number.isFinite(report.combined_total)) {
    check(
      report.combined_total === report.machine_plus_account_sum,
      `combined total ${report.combined_total} != machine + account sum ${report.machine_plus_account_sum}`,
    );
  }

  const expectTotal = Number(readArg("--expect-total"));
  if (Number.isFinite(expectTotal) && process.argv.includes("--expect-total")) {
    check(
      report.combined_total === expectTotal,
      `combined total ${report.combined_total} != expected ${expectTotal}`,
    );
  }
  const expectedDevices = parseExpectations(readJsonArgList("--expect-device"));
  for (const [name, expected] of expectedDevices) {
    const device = report.active_devices.find((entry) => entry.device_name === name);
    check(
      device && device.total_tokens === expected,
      device
        ? `device ${name} total ${device.total_tokens} != expected ${expected}`
        : `device ${name} not found among active devices`,
    );
  }

  report.checks_failed = failures;
  if (jsonOut) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Backend: ${baseUrl}`);
    console.log(`Combined total: ${report.combined_total?.toLocaleString("en-US")}`);
    for (const device of report.active_devices) {
      console.log(`  ${device.device_name}: ${device.total_tokens.toLocaleString("en-US")} (last hour ${device.last_hour || "—"})`);
    }
    if (report.account_sources?.length) {
      for (const source of report.account_sources) {
        console.log(`  account-level ${source.source}: ${Number(source.total_tokens).toLocaleString("en-US")}`);
      }
    }
    const allOk = failures.length === 0;
    console.log(allOk
      ? "All two-device checks passed. Re-run `sync --drain` on each PC and confirm the combined total does not move."
      : `FAILED:\n  - ${failures.join("\n  - ")}`);
  }
  process.exitCode = failures.length === 0 ? 0 : 1;
}

module.exports = { buildReport, loadToken, parseExpectations, dayOffsetFromToday, fetchJson };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
