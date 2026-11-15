"use strict";

// Shared primitives for the per-provider subscription limits readers.
//
// Every provider module grew its own copy of these while their quota payloads
// converged on the same shape (`used_percent` + `reset_at` ISO). The provider
// modules keep their provider-specific math — fraction scaling, resetInSec,
// used/cap pairs, HTML scraping — and share only what is provably identical.

// null for "no value" (missing, unparseable), otherwise 0..100 clamped.
function clampPercent(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  if (n <= 0) return 0;
  if (n >= 100) return 100;
  return n;
}

function toFiniteNumberOrNull(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// Accepts epoch seconds, epoch milliseconds, numeric strings and ISO strings and
// always answers an ISO string (or null). Providers disagree on units, so the
// 10^10 threshold picks ms whenever the value is large enough to be one.
// `rejectNonPositive` is for providers where 0 means "absent" rather than 1970.
function normalizeResetAt(value, { rejectNonPositive = false } = {}) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number" || /^\d+(?:\.\d+)?$/.test(String(value).trim())) {
    const raw = Number(value);
    if (!Number.isFinite(raw)) return null;
    if (rejectNonPositive && raw <= 0) return null;
    const milliseconds = raw > 10_000_000_000 ? raw : raw * 1000;
    const date = new Date(milliseconds);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  const timestamp = Date.parse(String(value));
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

// The window shape the dashboard and macOS app both read. A window without a
// usable percentage is dropped (null) rather than shown as an empty bar.
function buildWindow({ usedPercent, resetAt, windowSeconds = null }) {
  const pct = clampPercent(usedPercent);
  if (pct === null) return null;
  const window = {
    used_percent: pct,
    reset_at: typeof resetAt === "string" && resetAt ? resetAt : null,
  };
  if (Number.isFinite(windowSeconds) && windowSeconds > 0) {
    window.limit_window_seconds = windowSeconds;
  }
  return window;
}

module.exports = {
  clampPercent,
  toFiniteNumberOrNull,
  normalizeResetAt,
  buildWindow,
};
