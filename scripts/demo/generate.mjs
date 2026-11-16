// Deterministic demo dataset for the public demo instance
// (docs/demo-instance-plan.md §4).
//
// Pure and offline: the only entropy is a seeded PRNG, so the same
// (seed, today) pair always produces byte-identical rows. The nightly reseed
// therefore refreshes the calendar window without making the numbers drift.
//
// Everything here is fiction: project names, repos and device names are made
// up and never derived from a real collector's data.
//
// Row shapes mirror the migrations exactly (supabase/migrations/), including
// the CHECK constraints the tests re-assert: hourly totals are the sum of the
// four token columns and sessions never use the account-level sources.

import { createHash } from "node:crypto";

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

export const DEMO_DAYS = 120;

/** Fictional projects — the `repo_url` host is a placeholder org. */
export const DEMO_PROJECTS = [
  {
    key: "aurora-console",
    displayName: "Aurora Console",
    repoUrl: "https://github.com/token-usage-demo/aurora-console",
  },
  {
    key: "atlas-api",
    displayName: "Atlas API",
    repoUrl: "https://github.com/token-usage-demo/atlas-api",
  },
  {
    key: "lumen-docs",
    displayName: "Lumen Docs",
    repoUrl: "https://github.com/token-usage-demo/lumen-docs",
  },
  {
    key: "orbit-mobile",
    displayName: "Orbit Mobile",
    repoUrl: null,
  },
];

/** Three devices; the third one is revoked so the UI shows that state too. */
export const DEMO_DEVICES = [
  {
    key: "macbook",
    deviceName: "MacBook Pro M4",
    platform: "darwin",
    machineId: "demo-machine-macbook",
    machineClusterId: "demo-cluster-macbook",
  },
  {
    key: "desktop",
    deviceName: "Windows Workstation",
    platform: "win32",
    machineId: "demo-machine-desktop",
    machineClusterId: "demo-cluster-desktop",
  },
  {
    key: "server",
    deviceName: "Linux Build Server",
    platform: "linux",
    machineId: "demo-machine-server",
    machineClusterId: "demo-cluster-server",
    revokedDaysAgo: 21,
  },
];

/**
 * Emitters: one (source, model, device, project) lane each. Models are picked
 * from the curated pricing table so every row renders a real cost — the unit
 * test asserts each of them is priced.
 */
export const SEED_LANES = [
  {
    source: "claude-code",
    model: "claude-sonnet-5.5",
    device: "macbook",
    project: 0,
    weight: 1,
  },
  {
    source: "claude-code",
    model: "claude-opus-5",
    device: "desktop",
    project: 0,
    weight: 0.5,
  },
  {
    source: "codex",
    model: "gpt-5.6-sol",
    device: "desktop",
    project: 1,
    weight: 0.85,
  },
  {
    source: "gemini-cli",
    model: "gemini-4-argon",
    device: "macbook",
    project: 2,
    weight: 0.6,
  },
  {
    source: "deepseek",
    model: "deepseek-v4-flash",
    device: "server",
    project: 3,
    weight: 0.55,
  },
  {
    source: "kimi-code",
    model: "k3-256k",
    device: "macbook",
    project: 1,
    weight: 0.4,
  },
];

export const SEED_SOURCES = [...new Set(SEED_LANES.map((lane) => lane.source))].sort();
export const SEED_MODELS = [...new Set(SEED_LANES.map((lane) => lane.model))].sort();

/* -------------------------------------------------------------------------- */
/* deterministic primitives                                                    */
/* -------------------------------------------------------------------------- */

function sha256(text) {
  return createHash("sha256").update(text).digest();
}

function base64url(text, length) {
  return sha256(text).toString("base64url").slice(0, length);
}

/** PRNG: same seed → same stream (mulberry32). */
function mulberry32(seed) {
  let state = seed >>> 0;

  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** Stable UUIDv4-shaped id derived from a key — stable across reseeds. */
function uuidFor(key) {
  const chars = sha256(`uuid:${key}`).toString("hex").slice(0, 32).split("");

  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][Number.parseInt(chars[16], 16) % 4];

  const hex = chars.join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function startOfUtcDay(date) {
  const copy = new Date(date);

  copy.setUTCHours(0, 0, 0, 0);

  return copy;
}

/** Deterministic public-page token (`tu_page_` + 32 base64url chars). */
export function demoPageToken(seed = 20261116) {
  return `tu_page_${base64url(`page:${seed}`, 32)}`;
}

/** Deterministic badge token (`tu_badge_` + 32 base64url chars). */
export function demoBadgeToken(seed = 20261116, salt = "account") {
  return `tu_badge_${base64url(`badge:${salt}:${seed}`, 32)}`;
}

/* -------------------------------------------------------------------------- */
/* generator                                                                   */
/* -------------------------------------------------------------------------- */

const WEEKDAY_HOURS = [9, 10, 11, 14, 15, 16, 17, 20, 21, 22];
const WEEKEND_HOURS = [11, 15, 16, 21];

/**
 * Build every demo row for one account.
 *
 * @param {object} options
 * @param {string} options.userId  uuid of the demo account (rows carry it).
 * @param {Date} [options.today]   right edge of the window (defaults to now).
 * @param {number} [options.days]  window length in days.
 * @param {number} [options.seed]  PRNG + token seed.
 * @param {string} [options.cliVersion] collector version stamped on sync runs.
 */
export function generateDemoData(options = {}) {
  const {
    userId,
    today = new Date(),
    days = DEMO_DAYS,
    seed = 20261116,
    cliVersion = "0.4.2",
  } = options;

  if (!userId) throw new Error("generateDemoData: userId is required");
  if (!Number.isInteger(days) || days < 1) {
    throw new Error("generateDemoData: days must be a positive integer");
  }

  const rng = mulberry32(seed);
  const windowEnd = startOfUtcDay(today);
  const windowStart = new Date(windowEnd.getTime() - (days - 1) * DAY_MS);
  const accountCreatedAt = new Date(
    windowStart.getTime() - 45 * DAY_MS,
  ).toISOString();

  const devices = DEMO_DEVICES.map((device) => {
    const createdAt = new Date(
      windowStart.getTime() - (60 - 10 * DEMO_DEVICES.indexOf(device)) * DAY_MS,
    ).toISOString();
    const revokedAt =
      device.revokedDaysAgo === undefined
        ? null
        : new Date(windowEnd.getTime() - device.revokedDaysAgo * DAY_MS).toISOString();

    return {
      id: uuidFor(`device:${device.key}`),
      user_id: userId,
      device_name: device.deviceName,
      platform: device.platform,
      machine_id: device.machineId,
      machine_cluster_id: device.machineClusterId,
      revoked_at: revokedAt,
      name_customized: false,
      default_device_name: device.deviceName,
      created_at: createdAt,
      updated_at: revokedAt ?? createdAt,
    };
  });
  const deviceIdByKey = new Map(
    DEMO_DEVICES.map((device, index) => [device.key, devices[index].id]),
  );

  const hourly = [];
  const sessions = [];
  const syncRuns = [];
  const daySummaries = [];

  for (let dayIndex = 0; dayIndex < days; dayIndex += 1) {
    const dayStart = new Date(windowStart.getTime() + dayIndex * DAY_MS);
    const day = dayStart.toISOString().slice(0, 10);
    const weekday = dayStart.getUTCDay();
    const weekend = weekday === 0 || weekday === 6;
    // Slow upward trend so recent months look busier than the tail.
    const trend = 0.75 + (0.5 * dayIndex) / Math.max(days - 1, 1);
    const dayFactor = (weekend ? 0.5 : 1) * trend;
    const hours = weekend ? WEEKEND_HOURS : WEEKDAY_HOURS;
    let dayTokens = 0;

    SEED_LANES.forEach((lane, laneIndex) => {
      const laneDeviceId = deviceIdByKey.get(lane.device);

      for (const hour of hours) {
        const eveningBoost = hour >= 20 ? 1.15 : 1;

        if (rng() > 0.62 * lane.weight * dayFactor * eveningBoost) continue;

        const input = Math.round((4_000 + rng() * 46_000) * dayFactor);
        const cached = Math.round(input * (0.15 + rng() * 0.45));
        const cacheCreation =
          rng() < 0.3 ? Math.round(input * rng() * 0.15) : 0;
        const output = Math.round((200 + rng() * 5_200) * dayFactor);
        const reasoning = lane.model.includes("deepseek")
          ? Math.round(output * rng() * 0.4)
          : 0;
        const total = input + cached + cacheCreation + output;
        // Rotate the project along the window so the split is not static.
        const project =
          DEMO_PROJECTS[(dayIndex + laneIndex) % DEMO_PROJECTS.length].key;
        const hourStart = new Date(
          dayStart.getTime() + hour * HOUR_MS,
        ).toISOString();

        dayTokens += total;
        hourly.push({
          user_id: userId,
          device_id: laneDeviceId,
          hour_start: hourStart,
          source: lane.source,
          model: lane.model,
          project_key: project,
          input_tokens: input,
          cached_input_tokens: cached,
          cache_creation_input_tokens: cacheCreation,
          output_tokens: output,
          reasoning_output_tokens: reasoning,
          total_tokens: total,
          billable_total_tokens: total,
          conversations: 1 + Math.floor(rng() * 3),
          // Sentinel column: the CLI always writes 0, cost is computed at read
          // time (docs/deploy-guide.md §7 对账口径).
          total_cost_usd: 0,
          credits: 0,
          created_at: hourStart,
          updated_at: hourStart,
        });
      }
    });

    // Sessions: device-level only, claude-code / codex only.
    if (!weekend || rng() < 0.55) {
      const sessionCount = weekend
        ? 1 + Math.floor(rng() * 2)
        : 3 + Math.floor(rng() * 4);

      for (let index = 0; index < sessionCount; index += 1) {
        const source = rng() < 0.65 ? "claude-code" : "codex";
        const pool = SEED_LANES.filter((lane) => lane.source === source);
        const picked =
          pool.length > 1 && rng() < 0.45 ? [pool[0], pool[1]] : [pool[0]];
        const deviceKey = rng() < 0.6 ? "macbook" : "desktop";
        const startHour = hours[Math.floor(rng() * hours.length)];
        const startedAt = new Date(
          dayStart.getTime() +
            startHour * HOUR_MS +
            Math.floor(rng() * 40) * 60_000,
        );
        const endedAt = new Date(
          startedAt.getTime() + (8 + Math.floor(rng() * 100)) * 60_000,
        );
        const parts = picked.map((lane) => {
          const input = Math.round((1_500 + rng() * 12_000) * dayFactor);
          const cached = Math.round(input * (0.2 + rng() * 0.4));
          const cacheCreation =
            rng() < 0.25 ? Math.round(input * rng() * 0.12) : 0;
          const output = Math.round((120 + rng() * 2_400) * dayFactor);

          return {
            model: lane.model,
            input_tokens: input,
            cached_input_tokens: cached,
            cache_creation_input_tokens: cacheCreation,
            output_tokens: output,
            reasoning_output_tokens: 0,
            total_tokens: input + cached + cacheCreation + output,
          };
        });
        const sum = (key) =>
          parts.reduce((total, part) => total + part[key], 0);

        // Device-level only: `source` is claude-code / codex by construction
        // (cursor and trae-cn are account-level and never reach sessions).
        sessions.push({
          user_id: userId,
          device_id: deviceIdByKey.get(deviceKey),
          source,
          session_id: `demo-${day}-${index}`,
          project_key:
            DEMO_PROJECTS[Math.floor(rng() * DEMO_PROJECTS.length)].key,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          input_tokens: sum("input_tokens"),
          cached_input_tokens: sum("cached_input_tokens"),
          cache_creation_input_tokens: sum("cache_creation_input_tokens"),
          output_tokens: sum("output_tokens"),
          reasoning_output_tokens: sum("reasoning_output_tokens"),
          total_tokens: sum("total_tokens"),
          billable_total_tokens: sum("total_tokens"),
          models: parts,
          created_at: endedAt.toISOString(),
          updated_at: endedAt.toISOString(),
        });
      }
    }

    // Sync runs: every active device, 1–3 rounds a day, mostly ok.
    for (const deviceKey of ["macbook", "desktop"]) {
      const runCount = 1 + Math.floor(rng() * 3);

      for (let index = 0; index < runCount; index += 1) {
        const startedAt = new Date(
          dayStart.getTime() +
            [8, 12, 16, 20, 23][(index + Math.floor(rng() * 2)) % 5] * HOUR_MS +
            Math.floor(rng() * 50) * 60_000,
        );
        const endedAt = new Date(
          startedAt.getTime() + 800 + Math.floor(rng() * 3_200),
        );
        const roll = rng();
        const result = roll < 0.9 ? "ok" : roll < 0.97 ? "partial" : "error";
        const tokensIngested =
          result === "error" ? 0 : Math.round(rng() * 220_000);

        syncRuns.push({
          user_id: userId,
          device_id: deviceIdByKey.get(deviceKey),
          run_id: `demo-${day}-${deviceKey}-${index}`,
          started_at: startedAt.toISOString(),
          ended_at: endedAt.toISOString(),
          duration_ms: endedAt.getTime() - startedAt.getTime(),
          trigger: rng() < 0.85 ? "scheduled" : "manual",
          result,
          error_code: result === "error" ? "network" : null,
          empty: result === "ok" && tokensIngested === 0,
          parsed_files: 3 + Math.floor(rng() * 60),
          buckets_uploaded: Math.floor(rng() * 40),
          tokens_ingested: tokensIngested,
          sessions_uploaded: Math.floor(rng() * 6),
          sessions_skipped: 0,
          queue_bytes: Math.floor(rng() * 4_000_000),
          cli_version: cliVersion,
          os:
            deviceKey === "macbook"
              ? "darwin 25.1.0"
              : "win32 10.0.26200",
          created_at: endedAt.toISOString(),
          updated_at: endedAt.toISOString(),
        });
      }
    }

    daySummaries.push({ day, tokens: dayTokens });
  }

  const projectRepos = [];
  for (const device of DEMO_DEVICES) {
    if (device.revokedDaysAgo !== undefined) continue;

    for (const project of DEMO_PROJECTS) {
      if (!project.repoUrl) continue;

      const updatedAt = new Date(windowEnd.getTime() - 2 * DAY_MS).toISOString();

      projectRepos.push({
        user_id: userId,
        device_id: deviceIdByKey.get(device.key),
        project_key: project.key,
        repo_url: project.repoUrl,
        created_at: accountCreatedAt,
        updated_at: updatedAt,
      });
    }
  }

  const projectProfiles = DEMO_PROJECTS.map((project) => ({
    user_id: userId,
    project_key: project.key,
    display_name: project.displayName,
    repo_url: project.repoUrl,
    repo_hidden: false,
    logo_url: null,
    logo_object: null,
    created_at: accountCreatedAt,
    updated_at: accountCreatedAt,
  }));

  const badgeSettings = {
    user_id: userId,
    enabled: true,
    display_name: "Token Usage Demo",
    timezone: "Asia/Shanghai",
    allowed_projects: DEMO_PROJECTS.map((project) => project.key),
    page_token: demoPageToken(seed),
    page_enabled: true,
    created_at: accountCreatedAt,
    updated_at: accountCreatedAt,
  };

  const badges = [
    {
      id: uuidFor("badge:account"),
      user_id: userId,
      token: demoBadgeToken(seed),
      label: "demo",
      style: "sparkline",
      theme: "auto",
      range: "all",
      project: null,
      created_at: accountCreatedAt,
      updated_at: accountCreatedAt,
      revoked_at: null,
    },
    {
      id: uuidFor("badge:aurora"),
      user_id: userId,
      token: demoBadgeToken(seed, "aurora"),
      label: "aurora",
      style: "sparkline",
      theme: "auto",
      range: "all",
      project: "aurora-console",
      created_at: accountCreatedAt,
      updated_at: accountCreatedAt,
      revoked_at: null,
    },
  ];

  const totalTokens = hourly.reduce((total, row) => total + row.total_tokens, 0);
  const activeDays = daySummaries.filter((entry) => entry.tokens > 0).length;

  return {
    window: {
      start: windowStart.toISOString(),
      end: windowEnd.toISOString(),
      days,
    },
    tokens: {
      page: demoPageToken(seed),
      badge: demoBadgeToken(seed),
    },
    tables: {
      token_devices: devices,
      token_usage_hourly: hourly,
      token_sessions: sessions,
      token_sync_runs: syncRuns,
      token_project_repos: projectRepos,
      token_project_profiles: projectProfiles,
      token_public_badge_settings: [badgeSettings],
      token_public_badges: badges,
    },
    summary: {
      totalTokens,
      activeDays,
      sourceCount: SEED_SOURCES.length,
      modelCount: SEED_MODELS.length,
      hourlyRows: hourly.length,
      sessionRows: sessions.length,
      syncRunRows: syncRuns.length,
      peakDayTokens: daySummaries.reduce(
        (peak, entry) => Math.max(peak, entry.tokens),
        0,
      ),
    },
  };
}
