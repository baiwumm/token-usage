"use strict";

/**
 * Outbound telemetry opt-out, shared by the optional Sentry error reporting.
 *
 * 0.2.3 removed the upstream anonymous install heartbeat: this backend never
 * implemented `/api/functions/tokenusage-telemetry`, so every sync only earned
 * a 404. Sentry remains strictly opt-in (needs a DSN) and honors the same
 * opt-out switches:
 *   - TOKENUSAGE_NO_TELEMETRY=1
 *   - DO_NOT_TRACK (the standard)
 *   - `"telemetry": false` in config.json
 */

function isTruthyFlag(value) {
  if (typeof value !== "string") return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true";
}

function isTelemetryDisabled({ env = process.env, config = {} } = {}) {
  if (isTruthyFlag(env?.TOKENUSAGE_NO_TELEMETRY)) return true;
  if (isTruthyFlag(env?.DO_NOT_TRACK)) return true;
  if (config && config.telemetry === false) return true;
  return false;
}

module.exports = { isTelemetryDisabled };
