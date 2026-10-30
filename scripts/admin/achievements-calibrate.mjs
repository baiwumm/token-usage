#!/usr/bin/env node
/**
 * Read-only achievement threshold calibration for one account (M7 / P0.5).
 *
 * It loads the full history of one user straight from Supabase with the
 * service-role key and prints, per achievement: the current metric value, which
 * of the five tiers it reaches, the gap to the next tier, plus the distribution
 * facts the tier thresholds are calibrated against (distinct collector
 * sources, reasoning coverage, tier histogram).
 *
 * Read-only by construction: every request is a GET. Nothing is written, no
 * migration is involved, and no secret, project name, project key or device id
 * is printed — only aggregate volumes.
 *
 *   node scripts/admin/achievements-calibrate.mjs --env-file apps/web/.env.local --tz Asia/Shanghai
 *
 * Flags:
 *   --env-file <path>   env file to load (default: apps/web/.env.local)
 *   --user-id <uuid>    account to calibrate (default: ACHIEVEMENTS_USER_ID)
 *   --tz <IANA zone>    local day boundary (default: Asia/Shanghai)
 *
 * Environment: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY,
 * ACHIEVEMENTS_USER_ID (legacy SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY names
 * are accepted for the URL and key, like scripts/admin/create-user.cjs).
 *
 * Thresholds and tier names are imported from the app catalog so this script
 * can never disagree with the shipped tiers. The metric scans below mirror
 * apps/web/src/lib/achievements/compute.ts — the app's source of truth — and
 * must be kept in step with it; they are duplicated only because the app
 * modules import through the "@/…" alias, which plain Node cannot resolve.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ACHIEVEMENTS,
  CACHE_ALCHEMY_MIN_DAY_TOKENS,
  TIERS,
  nextThreshold,
  tierForValue,
} from "../../apps/web/src/lib/achievements/catalog.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const PAGE_SIZE = 1000;
const MAX_PAGES = 1000;
const DAY_MS = 86_400_000;
const NIGHT_HOURS = new Set([0, 1, 2, 3, 4, 5]);
const SYNC_SUCCESS_RESULTS = new Set(["ok", "partial"]);
const TOKEN_KEYS = [
  "input_tokens",
  "cached_input_tokens",
  "cache_creation_input_tokens",
  "output_tokens",
  "reasoning_output_tokens",
  "total_tokens",
];

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of String(text || "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

function loadEnv() {
  const envFile = readArg("--env-file")
    ? path.resolve(readArg("--env-file"))
    : path.join(ROOT, "apps", "web", ".env.local");
  if (fs.existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnvFile(fs.readFileSync(envFile, "utf8")))) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "")
    .trim()
    .replace(/\/$/, "");
  const secret = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  ).trim();
  const userId = String(readArg("--user-id") || process.env.ACHIEVEMENTS_USER_ID || "").trim();
  const timeZone = String(readArg("--tz") || "Asia/Shanghai").trim();
  if (!url || !secret) {
    throw new Error(
      "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (legacy names accepted) via env or --env-file",
    );
  }
  if (!userId) {
    throw new Error("Set ACHIEVEMENTS_USER_ID or pass --user-id <uuid>");
  }
  return { url, secret, userId, timeZone };
}

async function selectAll(url, secret, table, { columns = "*", filters = [], order = null } = {}) {
  const rows = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      select: columns,
      limit: String(PAGE_SIZE),
      offset: String(offset),
    });
    if (order) query.set("order", order);
    for (const [key, operator, value] of filters) query.append(key, `${operator}.${value}`);
    const response = await fetch(`${url}/rest/v1/${table}?${query}`, {
      headers: {
        apikey: secret,
        Authorization: `Bearer ${secret}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`GET ${table} failed: HTTP ${response.status} ${text.slice(0, 200)}`);
    }
    const batch = text ? JSON.parse(text) : [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) break;
    offset += batch.length;
  }
  return rows;
}

// ---- canonicalization (mirrors lib/account/usage.ts, all devices) ----------

function numberOr0(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function text(value) {
  return String(value ?? "");
}

function iso(value) {
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

function pickCanonicalRow(rows) {
  let best = null;
  for (const row of rows) {
    if (!best) {
      best = row;
      continue;
    }
    const rowTotal = numberOr0(row.total_tokens);
    const bestTotal = numberOr0(best.total_tokens);
    if (rowTotal !== bestTotal) {
      if (rowTotal > bestTotal) best = row;
      continue;
    }
    const rowUpdated = Date.parse(String(row.updated_at || "")) || -Infinity;
    const bestUpdated = Date.parse(String(best.updated_at || "")) || -Infinity;
    if (rowUpdated !== bestUpdated) {
      if (rowUpdated > bestUpdated) best = row;
      continue;
    }
    if (text(row.device_id) < text(best.device_id)) best = row;
  }
  return best;
}

function dedupeCursorRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = `${text(row.hour_start)}|${text(row.source)}|${text(row.model)}`;
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  return Array.from(groups.values())
    .map(pickCanonicalRow)
    .filter(Boolean);
}

function aggregateSessionStates(states) {
  const groups = new Map();
  for (const state of states) {
    const bucketStart = iso(state.bucket_start);
    if (!bucketStart) continue;
    const key = `${bucketStart}|${text(state.source)}|${text(state.model)}`;
    const row =
      groups.get(key) ||
      {
        hour_start: bucketStart,
        device_id: null,
        source: text(state.source),
        model: text(state.model),
        input_tokens: 0,
        cached_input_tokens: 0,
        cache_creation_input_tokens: 0,
        output_tokens: 0,
        reasoning_output_tokens: 0,
        total_tokens: 0,
        conversations: 0,
      };
    for (const keyName of TOKEN_KEYS) row[keyName] = numberOr0(row[keyName]) + numberOr0(state[keyName]);
    row.conversations += 1;
    groups.set(key, row);
  }
  return Array.from(groups.values());
}

// Achievements deliberately include revoked devices (tiers only move up), so
// no active-device filter is applied here either.
function canonicalizeUsage(hourly, sessionStates) {
  const localRows = [];
  const cursorRows = [];
  for (const row of hourly) {
    const source = text(row.source).toLowerCase();
    if (source === "cursor") cursorRows.push(row);
    else if (source === "trae-cn") continue;
    else localRows.push(row);
  }
  return [...localRows, ...dedupeCursorRows(cursorRows), ...aggregateSessionStates(sessionStates)];
}

// ---- local time -----------------------------------------------------------

function createZonedResolver(timeZone) {
  let formatter;
  try {
    formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    });
  } catch {
    throw new Error(`Invalid --tz time zone: ${timeZone}`);
  }
  return (value) => {
    const ms = Date.parse(String(value ?? ""));
    if (!Number.isFinite(ms)) return null;
    const values = {};
    for (const part of formatter.formatToParts(new Date(ms))) {
      if (part.type) values[part.type] = part.value;
    }
    const year = Number(values.year);
    const month = Number(values.month);
    const day = Number(values.day);
    const hour = Number(values.hour);
    if (![year, month, day, hour].every(Number.isFinite)) return null;
    return {
      day: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      hour,
    };
  };
}

function dayToMs(day) {
  return Date.parse(`${day}T00:00:00.000Z`);
}

function addDays(day, count) {
  return new Date(dayToMs(day) + count * DAY_MS).toISOString().slice(0, 10);
}

function isWeekend(day) {
  const weekday = new Date(dayToMs(day)).getUTCDay();
  return weekday === 0 || weekday === 6;
}

function longestStreak(activeDays) {
  if (activeDays.size === 0) return 0;
  const sorted = Array.from(activeDays).sort();
  let current = 0;
  let best = 0;
  for (let day = sorted[0]; day <= sorted[sorted.length - 1]; day = addDays(day, 1)) {
    current = activeDays.has(day) ? current + 1 : 0;
    if (current > best) best = current;
  }
  return best;
}

// ---- metric values --------------------------------------------------------

function buildMetrics(dataset, zoned) {
  const canonical = canonicalizeUsage(dataset.hourly, dataset.states);
  const days = new Map();
  const models = new Set();
  const sources = new Set();
  const deviceIds = new Set();
  let reasoningRows = 0;
  let reasoningTotal = 0;

  for (const row of canonical) {
    const reasoning = numberOr0(row.reasoning_output_tokens);
    if (reasoning > 0) reasoningRows += 1;
    reasoningTotal += reasoning;
    if (row.device_id) deviceIds.add(String(row.device_id));
    const parts = zoned(row.hour_start);
    if (!parts) continue;
    const model = text(row.model).trim() || "unknown";
    const source = text(row.source).trim().toLowerCase() || "unknown";
    models.add(model);
    sources.add(source);
    let agg = days.get(parts.day);
    if (!agg) {
      agg = {
        day: parts.day,
        total: 0,
        input: 0,
        cached: 0,
        cacheCreation: 0,
        output: 0,
        models: new Set(),
        night: false,
      };
      days.set(parts.day, agg);
    }
    const total = numberOr0(row.total_tokens);
    agg.total += total;
    agg.input += numberOr0(row.input_tokens);
    agg.cached += numberOr0(row.cached_input_tokens);
    agg.cacheCreation += numberOr0(row.cache_creation_input_tokens);
    agg.output += numberOr0(row.output_tokens);
    agg.models.add(model);
    if (!agg.night && total > 0 && NIGHT_HOURS.has(parts.hour)) agg.night = true;
  }

  const dayList = Array.from(days.values()).sort((a, b) => a.day.localeCompare(b.day));
  let totalTokens = 0;
  let outputTokens = 0;
  let cachedTokens = 0;
  let bestDayTokens = 0;
  let bestCacheRate = 0;
  let bestModelCount = 0;
  let activeDays = 0;
  let weekendDays = 0;
  let nightDays = 0;

  for (const day of dayList) {
    totalTokens += day.total;
    outputTokens += day.output;
    cachedTokens += day.cached;
    bestDayTokens = Math.max(bestDayTokens, day.total);
    bestModelCount = Math.max(bestModelCount, day.models.size);
    if (day.total >= CACHE_ALCHEMY_MIN_DAY_TOKENS) {
      const denominator = day.input + day.cached + day.cacheCreation;
      if (denominator > 0) bestCacheRate = Math.max(bestCacheRate, day.cached / denominator);
    }
    if (day.total > 0) {
      activeDays += 1;
      if (isWeekend(day.day)) weekendDays += 1;
    }
    if (day.night) nightDays += 1;
  }

  const sessions = [];
  for (const row of dataset.sessions) {
    const ended = Date.parse(String(row.ended_at ?? ""));
    const started = Date.parse(String(row.started_at ?? ""));
    const at = Number.isFinite(ended) ? ended : Number.isFinite(started) ? started : NaN;
    if (!Number.isFinite(at)) continue;
    const parts = zoned(new Date(at).toISOString());
    if (!parts) continue;
    sessions.push({
      at,
      day: parts.day,
      durationMs:
        Number.isFinite(ended) && Number.isFinite(started) && ended >= started ? ended - started : 0,
      project: text(row.project_key).trim() || null,
      tokens: numberOr0(row.total_tokens),
    });
  }
  sessions.sort((a, b) => a.at - b.at);

  let longestSessionMs = 0;
  const projects = new Set();
  const projectTokens = new Map();
  for (const fact of sessions) {
    longestSessionMs = Math.max(longestSessionMs, fact.durationMs);
    if (!fact.project) continue;
    projects.add(fact.project);
    projectTokens.set(fact.project, (projectTokens.get(fact.project) || 0) + fact.tokens);
  }
  const topProjectTokens = Math.max(0, ...projectTokens.values());

  for (const device of dataset.devices) if (device.id) deviceIds.add(String(device.id));

  const syncDays = new Set();
  for (const run of dataset.syncRuns) {
    if (!SYNC_SUCCESS_RESULTS.has(text(run.result).trim().toLowerCase())) continue;
    const parts = zoned(run.started_at);
    if (parts) syncDays.add(parts.day);
  }

  const activeDayKeys = new Set(dayList.filter((day) => day.total > 0).map((day) => day.day));
  const firstDay = dayList.length > 0 ? dayList[0].day : null;
  const lastDay = dayList.length > 0 ? dayList[dayList.length - 1].day : null;
  const today = zoned(new Date().toISOString())?.day || lastDay || firstDay;

  return {
    totalTokens,
    outputTokens,
    cachedTokens,
    reasoningTotal,
    reasoningRows,
    canonicalRows: canonical.length,
    rawHourlyRows: dataset.hourly.length,
    stateRows: dataset.states.length,
    sessionRows: dataset.sessions.length,
    syncRunRows: dataset.syncRuns.length,
    firstDay,
    lastDay,
    today,
    activeDays,
    values: {
      total_tokens: totalTokens,
      output_tokens: outputTokens,
      cached_input_tokens: cachedTokens,
      first_day_age_days:
        firstDay && today ? Math.max(0, Math.round((dayToMs(today) - dayToMs(firstDay)) / DAY_MS)) : 0,
      best_day_tokens: bestDayTokens,
      best_day_cache_hit_rate: bestCacheRate,
      longest_session_duration: longestSessionMs,
      best_day_model_count: bestModelCount,
      longest_streak: longestStreak(activeDayKeys),
      active_days: activeDays,
      weekend_days: weekendDays,
      night_owl_days: nightDays,
      distinct_models: models.size,
      distinct_sources: sources.size,
      distinct_projects: projects.size,
      top_project_tokens: topProjectTokens,
      distinct_devices: deviceIds.size,
      sync_streak: longestStreak(syncDays),
    },
  };
}

// ---- reporting ------------------------------------------------------------

function formatValue(unit, value) {
  if (unit === "ratio") return `${(value * 100).toFixed(2)}%`;
  if (unit === "duration_ms") return `${(value / 3_600_000).toFixed(2)}h`;
  return Math.round(value).toLocaleString("en-US");
}

// The CLI's own auto-sync source set is the honest reachable ceiling for the
// `multitool` king tier; it is read from the CLI sources rather than guessed.
function cliSourceCount() {
  try {
    const file = path.join(ROOT, "packages", "cli", "src", "commands", "sync.js");
    const source = fs.readFileSync(file, "utf8");
    const match = source.match(/const AUTO_SYNC_SOURCES = new Set\(\[([\s\S]*?)\]\);/);
    if (!match) return null;
    return Array.from(match[1].matchAll(/"([^"]+)"/g)).length;
  } catch {
    return null;
  }
}

function padEnd(value, width) {
  return String(value).padEnd(width);
}

function padStart(value, width) {
  return String(value).padStart(width);
}

async function main() {
  const { url, secret, userId, timeZone } = loadEnv();
  const zoned = createZonedResolver(timeZone);

  console.log("Token Usage · achievement calibration (read-only)");
  console.log(`account: ${userId.slice(0, 8)}…  timezone: ${timeZone}`);
  console.log("loading full history…");

  const [hourly, states, sessions, syncRuns, devices] = await Promise.all([
    selectAll(url, secret, "token_usage_hourly", {
      columns:
        "device_id,hour_start,source,model,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens,updated_at",
      filters: [["user_id", "eq", userId]],
      order: "hour_start.asc",
    }),
    selectAll(url, secret, "token_account_session_states", {
      columns:
        "source,session_id,model,bucket_start,input_tokens,cached_input_tokens,cache_creation_input_tokens,output_tokens,reasoning_output_tokens,total_tokens",
      filters: [["user_id", "eq", userId]],
      order: "bucket_start.asc",
    }),
    selectAll(url, secret, "token_sessions", {
      columns: "device_id,source,session_id,project_key,started_at,ended_at,total_tokens",
      filters: [["user_id", "eq", userId]],
      order: "ended_at.asc",
    }),
    selectAll(url, secret, "token_sync_runs", {
      columns: "started_at,result",
      filters: [["user_id", "eq", userId]],
      order: "started_at.asc",
    }),
    selectAll(url, secret, "token_devices", {
      columns: "id,created_at,revoked_at",
      filters: [["user_id", "eq", userId]],
      order: "created_at.asc",
    }),
  ]);

  const metrics = buildMetrics({ hourly, states, sessions, syncRuns, devices }, zoned);

  console.log("");
  console.log("— data coverage —");
  console.log(`local days:      ${metrics.firstDay || "—"} → ${metrics.lastDay || "—"} (today ${metrics.today})`);
  console.log(`canonical rows:  ${metrics.canonicalRows.toLocaleString("en-US")} (hourly ${metrics.rawHourlyRows.toLocaleString("en-US")}, session states ${metrics.stateRows.toLocaleString("en-US")})`);
  console.log(`sessions:        ${metrics.sessionRows.toLocaleString("en-US")} rows`);
  console.log(`sync runs:       ${metrics.syncRunRows.toLocaleString("en-US")} rows`);
  console.log(`active days:     ${metrics.activeDays.toLocaleString("en-US")}`);
  console.log(`total tokens:    ${metrics.totalTokens.toLocaleString("en-US")}`);
  console.log(`output tokens:   ${metrics.outputTokens.toLocaleString("en-US")}`);
  console.log(`cached input:    ${metrics.cachedTokens.toLocaleString("en-US")}`);
  console.log(`reasoning:       ${metrics.reasoningTotal.toLocaleString("en-US")} tokens in ${metrics.reasoningRows.toLocaleString("en-US")} rows`);

  console.log("");
  console.log("— achievements (value · reached tier · tier hits · gap to next) —");
  const header = `${padEnd("achievement", 22)}${padStart("value", 18)}  ${padEnd("tier", 9)}${padEnd("hits", 12)}${padStart("next", 18)}${padStart("gap", 18)}`;
  console.log(header);
  const results = ACHIEVEMENTS.map((achievement) => {
    const value = metrics.values[achievement.metric] || 0;
    const tier = tierForValue(achievement.thresholds, value);
    const next = nextThreshold(achievement.thresholds, value);
    const hits = achievement.thresholds
      .map((threshold) => (value >= threshold ? "✓" : "·"))
      .join(" ");
    const tierName = tier === 0 ? "locked" : TIERS[tier - 1].key;
    console.log(
      `${padEnd(achievement.id, 22)}${padStart(formatValue(achievement.unit, value), 18)}  ${padEnd(tierName, 9)}${padEnd(hits, 12)}${padStart(next === null ? "—" : formatValue(achievement.unit, next), 18)}${padStart(next === null ? "—" : formatValue(achievement.unit, next - value), 18)}`,
    );
    return { achievement, value, tier, next };
  });

  const histogram = TIERS.map(
    (tier) => `${tier.key} ${results.filter((entry) => entry.tier === tier.tier).length}`,
  );
  const locked = results.filter((entry) => entry.tier === 0);
  console.log("");
  console.log("— tier distribution —");
  console.log(`locked ${locked.length} · ${histogram.join(" · ")}`);
  console.log(`locked: ${locked.map((entry) => entry.achievement.id).join(", ") || "none"}`);

  const diamondPlus = results.filter((entry) => entry.tier >= 4);
  console.log(
    `diamond+ reached: ${diamondPlus.length ? diamondPlus.map((entry) => `${entry.achievement.id}(${TIERS[entry.tier - 1].key})`).join(", ") : "none"}`,
  );

  const multitool = results.find((entry) => entry.achievement.id === "multitool");
  const cliSources = cliSourceCount();
  console.log("");
  console.log("— calibration notes —");
  console.log(
    `sources: observed ${metrics.values.distinct_sources}, CLI-supported ${cliSources ?? "unknown"}; multitool king threshold ${multitool?.achievement.thresholds[4] ?? "—"}`,
  );
  if (multitool && cliSources !== null && multitool.achievement.thresholds[4] > cliSources) {
    console.log(
      `  → lower the multitool king threshold: ${multitool.achievement.thresholds[4]} exceeds the CLI ceiling (${cliSources})`,
    );
  } else {
    console.log("  → multitool king threshold is reachable within the CLI source ceiling");
  }

  const coverage = metrics.canonicalRows > 0 ? metrics.reasoningRows / metrics.canonicalRows : 0;
  console.log(
    `reasoning coverage: ${(coverage * 100).toFixed(1)}% of rows (${metrics.reasoningTotal.toLocaleString("en-US")} tokens)`,
  );
  console.log(
    coverage >= 0.5
      ? "  → deep_thinker (19th) has enough coverage: ship 1M / 10M / 100M / 1B / 10B"
      : "  → hold deep_thinker (19th): coverage below 50% of rows",
  );
  console.log(
    "  → thresholds stay uncalibrated until the operator backfills catalog.ts + plan §2 from this output",
  );
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
