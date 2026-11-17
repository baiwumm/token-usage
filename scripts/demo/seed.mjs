#!/usr/bin/env node
'use strict';

/**
 * Demo instance seed (docs/demo-instance-plan.md §4).
 *
 * Ensures the demo auth user exists, wipes ONLY that user's rows, then writes
 * a deterministic 120-day dataset (scripts/demo/generate.mjs). Safe to rerun:
 * the nightly workflow calls it to keep the window fresh and to keep the free
 * Supabase project from going idle.
 *
 *   node scripts/demo/seed.mjs --dry-run
 *   node scripts/demo/seed.mjs
 *   node scripts/demo/seed.mjs --days 90 --seed 42
 *
 * Environment (new Supabase key system, legacy names accepted):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *   TOKEN_USAGE_DEMO_EMAIL      demo account address (required)
 *   TOKEN_USAGE_DEMO_PASSWORD   password to set when creating/updating it
 *   TOKEN_USAGE_DASHBOARD_URL   printed link prefix (optional)
 *
 * Safety rails (the script must never reach a production database):
 *   - refuses unless TOKEN_USAGE_DEMO=on (demo deployments set it) or --force
 *   - refuses when the project holds more than one user (unless --force)
 *   - refuses a dashboard URL or Supabase host that is not the demo instance
 *     when TOKEN_USAGE_DEMO=on
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateDemoData } from './generate.mjs';

const DIRNAME = path.dirname(fileURLToPath(import.meta.url));

const CHUNK = 500;

/** Placeholder account id for --dry-run (never written anywhere). */
const DRY_RUN_USER_ID = '00000000-0000-4000-8000-000000000000';

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length
    ? process.argv[index + 1]
    : null;
}
const hasFlag = (name) => process.argv.includes(name);

function parseEnvFile(text) {
  const values = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (key) values[key] = value;
  }
  return values;
}

function loadEnv() {
  const repoRoot = path.resolve(DIRNAME, '..', '..');
  // Demo-only files. `apps/web/.env.local` is deliberately NOT a candidate: it
  // holds the operator's production instance values, and a seed run against it
  // would wipe real data.
  const candidates = [
    path.join(repoRoot, 'apps', 'web', '.env.demo.local'),
    path.join(repoRoot, '.env.demo.local'),
  ];
  const explicit = readArg('--env-file');

  if (
    explicit &&
    /(^|[\\/])\.env\.local$/.test(explicit) &&
    !hasFlag('--force')
  ) {
    throw new Error(
      'Refusing to read a generic .env.local (production values). Point --env-file at a demo env file, or pass --force if you really mean it.',
    );
  }

  const envFile =
    explicit || candidates.find((file) => fs.existsSync(file)) || null;

  if (envFile && fs.existsSync(envFile)) {
    for (const [key, value] of Object.entries(
      parseEnvFile(fs.readFileSync(envFile, 'utf8')),
    )) {
      if (!process.env[key]) process.env[key] = value;
    }
  }

  const url = String(
    process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '',
  )
    .trim()
    .replace(/\/$/, '');
  const secret = String(
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  ).trim();

  if (!url || !secret) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (legacy names accepted) via env or --env-file.\n' +
        'Tip: create apps/web/.env.demo.local (gitignored) — see docs/demo-instance.md §4.',
    );
  }

  return { url, secret, envFile };
}

function cliVersion() {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(
        path.resolve(DIRNAME, '..', '..', 'packages', 'cli', 'package.json'),
        'utf8',
      ),
    );
    return String(pkg.version || '0.0.0');
  } catch {
    return '0.0.0';
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return { raw: text.slice(0, 300) };
  }
}

async function rest(url, secret, method, pathAndQuery, body, extraHeaders = {}) {
  const response = await fetch(`${url}/rest/v1/${pathAndQuery}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...extraHeaders,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const detail = await readJsonResponse(response);
    throw new Error(
      `PostgREST ${method} ${pathAndQuery} → ${response.status} ${JSON.stringify(detail)}`,
    );
  }

  return response;
}

async function auth(url, secret, method, endpoint, body) {
  const response = await fetch(`${url}/auth/v1/${endpoint}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await readJsonResponse(response);

  return { status: response.status, data };
}

async function listUsers(url, secret) {
  const { status, data } = await auth(
    url,
    secret,
    'GET',
    'admin/users?page=1&per_page=200',
  );

  if (status !== 200) {
    throw new Error(`Auth admin/users → ${status} ${JSON.stringify(data)}`);
  }

  return Array.isArray(data) ? data : data?.users ?? [];
}

async function ensureUser(url, secret, email, password) {
  const users = await listUsers(url, secret);
  const existing = users.find(
    (user) => String(user.email || '').toLowerCase() === email.toLowerCase(),
  );

  if (existing) {
    if (password) {
      const updated = await auth(
        url,
        secret,
        'PUT',
        `admin/users/${existing.id}`,
        { password },
      );
      if (updated.status !== 200) {
        throw new Error(
          `Auth admin/users/${existing.id} → ${updated.status} ${JSON.stringify(updated.data)}`,
        );
      }
    }
    return { id: existing.id, created: false, users };
  }

  if (!password) {
    throw new Error(
      'The demo account does not exist yet; provide TOKEN_USAGE_DEMO_PASSWORD so it can be created',
    );
  }

  const created = await auth(url, secret, 'POST', 'admin/users', {
    email,
    password,
    email_confirm: true,
  });

  if (created.status !== 200 || !created.data?.id) {
    throw new Error(
      `Auth admin/users create → ${created.status} ${JSON.stringify(created.data)}`,
    );
  }

  return { id: created.data.id, created: true, users };
}

// Children first: hourly/sessions/runs/profile rows cascade from devices, but
// deleting them explicitly keeps the intent obvious and the cascade shallow.
const DELETE_ORDER = [
  'token_sessions',
  'token_sync_runs',
  'token_usage_hourly',
  'token_project_repos',
  'token_project_profiles',
  'token_achievement_seen',
  'token_public_badges',
  'token_public_badge_settings',
  'token_devices',
];

const INSERT_ORDER = [
  'token_devices',
  'token_usage_hourly',
  'token_sessions',
  'token_sync_runs',
  'token_project_repos',
  'token_project_profiles',
  'token_public_badge_settings',
  'token_public_badges',
];

function assertDemoTarget() {
  if (process.env.TOKEN_USAGE_DEMO !== 'on' && !hasFlag('--force')) {
    throw new Error(
      'Refusing to seed: set TOKEN_USAGE_DEMO=on (demo instance env) or pass --force',
    );
  }

  const dashboard = String(
    process.env.TOKEN_USAGE_DASHBOARD_URL || '',
  ).trim();

  const productionHosts = ['app.token-usage.cc'];

  if (dashboard && productionHosts.some((host) => dashboard.includes(host))) {
    throw new Error(
      `Refusing to seed: TOKEN_USAGE_DASHBOARD_URL points at the production instance (${dashboard})`,
    );
  }

  return dashboard.replace(/\/$/, '');
}

async function main() {
  const { url, secret, envFile } = loadEnv();
  const dryRun = hasFlag('--dry-run');
  const force = hasFlag('--force');
  const email = String(process.env.TOKEN_USAGE_DEMO_EMAIL || '').trim();
  const password = String(process.env.TOKEN_USAGE_DEMO_PASSWORD || '');
  const days = Number(readArg('--days') || 120);
  const seed = Number(readArg('--seed') || 20261116);

  if (!email) {
    throw new Error('Set TOKEN_USAGE_DEMO_EMAIL (the demo account address)');
  }

  const dashboard = assertDemoTarget();

  console.log(`Project : ${url}`);
  console.log(`Env file: ${envFile || '(process env only)'}`);
  console.log(`Account : ${email}`);
  console.log(`Window  : last ${days} days · seed ${seed}`);
  console.log(`Mode    : ${dryRun ? 'dry run (offline)' : 'write'}`);

  // A dry run must be safe to repeat and must not touch the project: it prints
  // the deterministic dataset with a placeholder account id and makes no
  // network calls at all.
  if (dryRun) {
    const preview = generateDemoData({
      userId: DRY_RUN_USER_ID,
      today: new Date(),
      days,
      seed,
      cliVersion: cliVersion(),
    });

    console.log(
      `Dataset : ${preview.summary.hourlyRows} buckets · ${preview.summary.sessionRows} sessions · ${preview.summary.syncRunRows} runs · ${preview.summary.totalTokens.toLocaleString('en-US')} tokens · ${preview.summary.activeDays}/${days} active days`,
    );
    console.log(`Window  : ${preview.window.start} → ${preview.window.end}`);
    console.log(
      'Dry run complete — nothing was written and no network calls were made.',
    );
    return;
  }

  const { id: userId, created, users } = await ensureUser(
    url,
    secret,
    email,
    password,
  );

  if (!dryRun && users.length > 1 && !force) {
    throw new Error(
      `Refusing to wipe: the project holds ${users.length} users, expected a single demo account. Pass --force to override.`,
    );
  }

  console.log(
    `User    : ${userId}${created ? ' (created)' : ' (existing)'}${
      users.length > 1 ? ` · ${users.length} users total` : ''
    }`,
  );

  const data = generateDemoData({
    userId,
    today: new Date(),
    days,
    seed,
    cliVersion: cliVersion(),
  });

  console.log(
    `Dataset : ${data.summary.hourlyRows} buckets · ${data.summary.sessionRows} sessions · ${data.summary.syncRunRows} runs · ${data.summary.totalTokens.toLocaleString('en-US')} tokens · ${data.summary.activeDays}/${days} active days`,
  );

  for (const table of DELETE_ORDER) {
    await rest(url, secret, 'DELETE', `${table}?user_id=eq.${userId}`, undefined, {
      Prefer: 'return=minimal',
    });
  }
  console.log(`Cleared : ${DELETE_ORDER.length} tables for this account`);

  for (const table of INSERT_ORDER) {
    const rows = data.tables[table] ?? [];
    for (let index = 0; index < rows.length; index += CHUNK) {
      await rest(
        url,
        secret,
        'POST',
        table,
        rows.slice(index, index + CHUNK),
        { Prefer: 'return=minimal' },
      );
    }
    console.log(`Wrote   : ${table} (${rows.length})`);
  }

  console.log('');
  console.log('Seed complete.');
  console.log(`Window  : ${data.window.start} → ${data.window.end}`);
  if (dashboard) {
    console.log(`Public  : ${dashboard}/u/${data.tokens.page}`);
    console.log(`Badge   : ${dashboard}/api/badge?token=${data.tokens.badge}`);
  } else {
    console.log('Public  : set TOKEN_USAGE_DASHBOARD_URL to print the links');
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
