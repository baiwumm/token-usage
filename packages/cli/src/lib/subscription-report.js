"use strict";

// Subscription balance snapshots (docs/cli-contract.md §2.13): the device
// reads vendor balances from locally-held sign-in state (lib/usage-limits.js
// for Qoder, the Trae Local State entitlement parser) and reports the LATEST
// snapshot per source. Strictly best-effort — a failure only reaches the
// local log and never affects the ingest that already happened. The server
// keeps one row per (user, source); there is no history and no
// reconciliation: these are balances, not consumption.

const fs = require("node:fs");
const path = require("node:path");

const { fetchQoderCnLimits, fetchQoderLimits } = require("./qoder-limits");
const { functionUrlFor, fetchFunctionResponse } = require("./function-url");

const SUBSCRIPTION_REPORT_SLUG = "token-usage-subscription-report";
// Vendor limit endpoints are rate-sensitive; one attempt per 10 minutes per
// device is well inside every provider's budget (the readers cache on disk
// besides, so a throttled-out sync costs nothing).
const REPORT_MIN_INTERVAL_MS = 10 * 60 * 1000;

const round6 = (value) => Math.round(value * 1e6) / 1e6;

function optionalString(value, max = 100) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed && trimmed.length <= max ? trimmed : null;
}

function optionalNonNegativeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? round6(parsed) : null;
}

function normalizePool(pool) {
  if (!pool || typeof pool !== "object") return null;
  const out = {
    name: optionalString(pool.name),
    unit: optionalString(pool.unit),
    total: optionalNonNegativeNumber(pool.total),
    used: optionalNonNegativeNumber(pool.used),
    remaining: optionalNonNegativeNumber(pool.remaining),
  };

  return out.total == null && out.used == null && out.remaining == null
    ? null
    : out;
}

function normalizeWindow(window) {
  if (!window || typeof window !== "object") return null;
  const percent = Number(window.percent);
  const label = optionalString(window.label, 40);

  return {
    label,
    percent:
      Number.isFinite(percent) && percent >= 0 && percent <= 100
        ? round6(percent)
        : null,
    resets_at:
      typeof window.resets_at === "string" &&
      Number.isFinite(Date.parse(window.resets_at))
        ? new Date(Date.parse(window.resets_at)).toISOString()
        : null,
  };
}

function normalizeSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== "object") return null;
  const pools = Array.isArray(snapshot.pools)
    ? snapshot.pools.slice(0, 8).map(normalizePool).filter(Boolean)
    : [];
  const windows = Array.isArray(snapshot.windows)
    ? snapshot.windows.slice(0, 8).map(normalizeWindow).filter(Boolean)
    : [];

  if (!pools.length && !windows.length) return null;

  return {
    source: optionalString(snapshot.source) ?? "",
    plan: optionalString(snapshot.plan),
    pools,
    windows,
  };
}

function snapshotFromQoderLimits(source, limits) {
  if (!limits?.configured || limits.error) return null;
  const primary = limits.primary_window;

  if (!primary) return null;
  const windows = [
    normalizeWindow({
      label: "credits",
      percent: primary.used_percent,
      resets_at: primary.reset_at,
    }),
    limits.secondary_window &&
    Number.isFinite(Number(limits.secondary_window?.used_percent))
      ? normalizeWindow({
          label: "activity",
          percent: limits.secondary_window.used_percent,
          resets_at: limits.secondary_window.reset_at,
        })
      : null,
  ].filter(Boolean);
  const pools = [
    normalizePool({
      name: limits.plan_label || null,
      unit: primary.unit || "Credits",
      total: primary.limit_credits,
      used: primary.used_credits,
      remaining: primary.remaining_credits,
    }),
  ].filter(Boolean);

  if (!pools.length && !windows.length) return null;

  return { source, plan: optionalString(limits.plan_label), pools, windows };
}

function snapshotFromTraeEntitlement(ent) {
  if (!ent?.identity) return null;
  // The Local State entitlement carries plan metadata only — no usage
  // percentages (those live behind Trae's cloud entitlements endpoint, which
  // the trae-cn opt-in gates). Report what we have; the card renders a
  // metadata-only row.
  return {
    source: "trae",
    plan: optionalString(ent.identity),
    pools: [],
    windows: [],
  };
}

/**
 * Reads the locally-configured subscription sources and returns the
 * normalized §2.13 snapshots. Unconfigured / not-signed-in / errored sources
 * are skipped silently — absence of a snapshot is the "nothing to show"
 * signal for the dashboard card.
 */
async function collectSubscriptionSnapshots({
  home = require("node:os").homedir(),
  env = process.env,
} = {}) {
  const snapshots = [];

  for (const [source, fetcher] of [
    ["qoder", fetchQoderLimits],
    ["qoder-cn", fetchQoderCnLimits],
  ]) {
    try {
      const snapshot = snapshotFromQoderLimits(
        source,
        await fetcher({ home, env }),
      );

      if (snapshot) snapshots.push(snapshot);
    } catch { /* not signed in / app closed — skip the source */ }
  }

  try {
    const { readTraeEntitlementFromStorage, resolveTraeStoragePath } = require("./rollout");
    const storagePath = resolveTraeStoragePath(env);
    const entitlement = storagePath
      ? readTraeEntitlementFromStorage(storagePath)
      : null;
    const snapshot = snapshotFromTraeEntitlement(entitlement);

    if (snapshot) snapshots.push(snapshot);
  } catch { /* no Trae install — skip */ }

  return snapshots;
}

function readThrottleState(statePath) {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const at = Number(parsed?.last_report_at);

    return Number.isFinite(at) ? at : 0;
  } catch {
    return 0;
  }
}

function writeThrottleState(statePath, nowMs) {
  try {
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      `${JSON.stringify({ last_report_at: nowMs })}\n`,
      "utf8",
    );
  } catch { /* throttle state is disposable */ }
}

/**
 * Collect + POST the snapshots, throttled to one attempt per 10 minutes.
 * Resolves { reported, count } and never throws: every failure path logs and
 * returns false so the sync flow is untouched.
 */
async function reportSubscriptionSnapshots({
  trackerDir,
  baseUrl,
  anonKey,
  deviceToken,
  home,
  env = process.env,
  nowMs = Date.now(),
  log = () => {},
} = {}) {
  if (!baseUrl || !deviceToken) return { reported: false, count: 0 };
  const statePath = path.join(trackerDir, "subscription-report.state.json");

  if (nowMs - readThrottleState(statePath) < REPORT_MIN_INTERVAL_MS) {
    return { reported: false, count: 0, throttled: true };
  }
  writeThrottleState(statePath, nowMs);

  let snapshots;

  try {
    snapshots = await collectSubscriptionSnapshots({ home, env });
  } catch (error) {
    log(`Subscription report skipped (collect failed): ${error?.message || error}`);
    return { reported: false, count: 0 };
  }

  if (snapshots.length === 0) return { reported: false, count: 0 };

  try {
    const res = await fetchFunctionResponse(
      functionUrlFor(baseUrl, SUBSCRIPTION_REPORT_SLUG),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          Authorization: `Bearer ${deviceToken}`,
          ...(anonKey ? { apikey: anonKey } : {}),
        },
        body: JSON.stringify({ subscriptions: snapshots }),
      },
    );

    if (!res.ok) {
      log(`Subscription report skipped (HTTP ${res.status})`);
      return { reported: false, count: 0 };
    }

    return { reported: true, count: snapshots.length };
  } catch (error) {
    log(`Subscription report failed (kept locally): ${error?.message || error}`);
    return { reported: false, count: 0 };
  }
}

module.exports = {
  SUBSCRIPTION_REPORT_SLUG,
  REPORT_MIN_INTERVAL_MS,
  collectSubscriptionSnapshots,
  normalizeSnapshot,
  snapshotFromQoderLimits,
  snapshotFromTraeEntitlement,
  reportSubscriptionSnapshots,
};
