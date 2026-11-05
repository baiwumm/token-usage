"use strict";

// Qoder Desktop 0.4.x writes its account usage summary to main.log under the
// bundle-id profile directory (com.qoder[cn].app.stable/logs). The summary is
// the same shape the local IPC `credit/usage` call returns, so it feeds the
// shared normalizer and only acts as a fallback when IPC/CLI/cache/cookie all
// miss. These tests pin the line parser, the two-layout discovery, freshness,
// and the percentage scale.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test, beforeEach, afterEach } = require("node:test");

const {
  normalizeQoderRpcUsage,
  parseQoderAccountUsageLog,
  readQoderLocalQuota,
} = require("../src/lib/qoder-limits");

const OBSERVED_AT = "2026-11-02T01:01:55.790Z";
const NOW_MS = Date.parse("2026-11-02T03:00:00.000Z");

function usageLine({
  timestamp = OBSERVED_AT,
  addOnUsed = 1143,
  addOnTotal = 2400,
  suffix = "",
} = {}) {
  return (
    `[${timestamp}] [INFO] [main] [Auth] [AccountUsage] 用量响应摘要 ` +
    `{"operation":"account.getQuotaUsage","requestId":"rid","method":"GET",` +
    `"path":"/sash/api/v2/me/usage","host":"openapi.qoder.com.cn","status":200,` +
    `"displayMode":"qoder","hasQoderUsage":true,"qoderUsage":{` +
    `"userType":"personal_standard","usageType":"credits",` +
    `"expiresAt":253402214400000,"totalUsagePercentage":${addOnTotal > 0 ? 0.48 : 0},` +
    `"isQuotaExceeded":false,"userQuota":{"total":0,"used":0,"remaining":0,"percentage":0,"unit":"credits"},` +
    `"addOnQuota":{"total":${addOnTotal},"used":${addOnUsed},"remaining":${addOnTotal - addOnUsed},"percentage":0.48,"unit":"credits"}}}` +
    suffix
  );
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tokenusage-qoder-log-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeLog(relativePath, contents, { mtime = new Date(NOW_MS) } = {}) {
  const full = path.join(tmpDir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, contents);
  fs.utimesSync(full, mtime, mtime);
  return full;
}

test("Qoder log: last qoderUsage line wins and keeps its observation time", () => {
  const text = [
    usageLine({ timestamp: "2026-11-02T00:10:00.000Z", addOnUsed: 100, addOnTotal: 1000 }),
    "unrelated line",
    usageLine({ suffix: " done" }),
  ].join("\n");

  const parsed = parseQoderAccountUsageLog(text, { fallbackObservedAtMs: NOW_MS });
  assert.ok(parsed);
  assert.equal(parsed.limits.plan_label, "personal_standard");
  assert.equal(parsed.limits.source, "local-log");
  assert.equal(parsed.limits.primary_window.used_credits, 0);
  assert.equal(parsed.limits.tertiary_window.used_credits, 1143);
  assert.equal(parsed.limits.tertiary_window.limit_credits, 2400);
  assert.equal(parsed.limits.tertiary_window.remaining_credits, 1257);
  assert.equal(parsed.observedAtMs, Date.parse(OBSERVED_AT));
  // 9999-12-31 is Qoder's no-expiry sentinel, not a real reset time.
  assert.equal(parsed.limits.primary_window.reset_at, null);
});

test("Qoder log parser ignores broken or marker-less lines", () => {
  assert.equal(parseQoderAccountUsageLog('no usage here {"qoderUsage":'), null);
  assert.equal(parseQoderAccountUsageLog("plain text"), null);
  assert.equal(parseQoderAccountUsageLog('prefix {"qoderUsage": {broken'), null);
});

test("Qoder log discovery finds the 0.4.x bundle-id profile", () => {
  writeLog(
    path.join("com.qodercn.app.stable", "logs", "session-1", "main.log"),
    usageLine(),
  );

  const limits = readQoderLocalQuota({
    home: tmpDir,
    platform: "win32",
    env: { APPDATA: tmpDir },
    appDir: "QoderCN",
    envPrefix: "QODER_CN",
    nowMs: NOW_MS,
  });

  assert.ok(limits);
  assert.equal(limits.source, "local-log");
  assert.equal(limits.tertiary_window.used_credits, 1143);
  // The snapshot's own timestamp travels with it so provenance ages correctly.
  assert.equal(limits.cached_at, OBSERVED_AT);
});

test("Qoder log discovery keeps the legacy renderer.log fallback", () => {
  writeLog(
    path.join("Qoder", "logs", "session-1", "renderer.log"),
    "userType=personal_standard isQuotaExceeded=false userQuota used=100, total=200, remaining=100, percentage=50, unit=credits",
  );

  const limits = readQoderLocalQuota({
    home: tmpDir,
    platform: "win32",
    env: { APPDATA: tmpDir },
    appDir: "Qoder",
    envPrefix: "QODER",
    nowMs: NOW_MS,
  });

  assert.ok(limits);
  assert.equal(limits.source, "local-log");
  assert.equal(limits.primary_window.used_credits, 100);
  assert.equal(limits.primary_window.used_percent, 50);
});

test("Qoder log snapshots older than the freshness window are ignored", () => {
  const stale = new Date(NOW_MS - 8 * 24 * 60 * 60 * 1000);
  writeLog(
    path.join("com.qodercn.app.stable", "logs", "session-1", "main.log"),
    usageLine({ timestamp: stale.toISOString() }),
    { mtime: stale },
  );

  assert.equal(
    readQoderLocalQuota({
      home: tmpDir,
      platform: "win32",
      env: { APPDATA: tmpDir },
      appDir: "QoderCN",
      envPrefix: "QODER_CN",
      nowMs: NOW_MS,
    }),
    null,
  );
});

test("Qoder percentages derive from quota numbers, not the mixed-scale flag", () => {
  // The OpenAPI reports fractions (0.25 = 25%), the desktop paths report
  // percents; the quota numbers are the only unambiguous source.
  const limits = normalizeQoderRpcUsage({
    userQuota: { used: 1, total: 4, remaining: 3 },
    totalUsagePercentage: 0.25,
  });
  assert.equal(limits.primary_window.used_percent, 25);

  const exceeded = normalizeQoderRpcUsage({
    isQuotaExceeded: true,
    userQuota: { used: 4, total: 4, remaining: 0 },
    totalUsagePercentage: 1,
  });
  assert.equal(exceeded.primary_window.used_percent, 100);
});

test("Qoder treats the log's unresolved plan marker as no plan label", () => {
  const limits = normalizeQoderRpcUsage({
    userType: "invalid",
    userQuota: { used: 0, total: 0, remaining: 0 },
  });
  assert.equal(limits.plan_label, null);
});
