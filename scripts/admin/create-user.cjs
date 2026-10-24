#!/usr/bin/env node
"use strict";

/**
 * Admin user provisioning for a Token Usage deployment (M2).
 *
 * Two modes:
 *   --password  create the account directly with a temporary password
 *               (email_confirm=true — works without reachable mail)
 *   --invite    (default) send a Supabase invite email; the user completes
 *               signup through the link
 *
 *   node scripts/admin/create-user.cjs --email user@example.com
 *   node scripts/admin/create-user.cjs --email user@example.com --password
 *   node scripts/admin/create-user.cjs --email user@example.com --password \
 *     --password-value 'temp-pass-123'
 *
 * Environment (new Supabase key system, legacy names accepted):
 *   NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL)
 *   SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 * via env or --env-file (defaults to apps/web/.env.local, then repo root).
 */

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

function readArg(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 && index + 1 < process.argv.length ? process.argv[index + 1] : null;
}
const hasFlag = (name) => process.argv.includes(name);

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
  const webEnv = path.join(path.resolve(__dirname, "..", "..", "apps", "web"), ".env.local");
  const rootEnv = path.join(path.resolve(__dirname, "..", ".."), ".env.local");
  const envFile = readArg("--env-file") || (fs.existsSync(webEnv) ? webEnv : rootEnv);
  if (fs.existsSync(envFile)) {
    for (const [key, value] of Object.entries(parseEnvFile(fs.readFileSync(envFile, "utf8")))) {
      if (!process.env[key]) process.env[key] = value;
    }
  }
  const url = String(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "").trim().replace(/\/$/, "");
  const secret = String(process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!url || !secret) {
    throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY (legacy names accepted) via env or --env-file");
  }
  return { url, secret };
}

function generateTempPassword() {
  // 20 chars from an unambiguous alphabet, prefixed so password policy
  // minimums (length / class mix) never reject it.
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(20);
  let suffix = "";
  for (const byte of bytes) suffix += alphabet[byte % alphabet.length];
  return `tu-${suffix}`;
}

async function supabaseAuth(url, secret, method, endpoint, body) {
  const response = await fetch(`${url}/auth/v1/${endpoint}`, {
    method,
    headers: {
      apikey: secret,
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text.slice(0, 300) };
  }
  return { status: response.status, data };
}

async function main() {
  const { url, secret } = loadEnv();
  const email = readArg("--email");
  const usePassword = hasFlag("--password");
  const useInvite = hasFlag("--invite");

  if (!email) {
    console.error("Usage: node scripts/admin/create-user.cjs --email <address> [--password [--password-value <pw>]]");
    process.exitCode = 1;
    return;
  }

  if (usePassword && useInvite) {
    console.error("Pick one mode: --password OR --invite (default).");
    process.exitCode = 1;
    return;
  }

  console.log(`Project: ${url}`);

  if (usePassword) {
    const password = readArg("--password-value") || generateTempPassword();
    const created = await supabaseAuth(url, secret, "POST", "admin/users", {
      email,
      password,
      email_confirm: true,
    });
    if (created.status === 200 && created.data?.id) {
      console.log(`Created user ${email} (id ${created.data.id})`);
      console.log(`Temporary password: ${password}`);
      console.log("The user can sign in with email+password and should change it later.");
    } else {
      console.error(`Failed to create user: HTTP ${created.status} ${JSON.stringify(created.data)}`);
      process.exitCode = 1;
    }
    return;
  }

  const redirectTo = readArg("--redirect-to");
  const invited = await supabaseAuth(url, secret, "POST", "invite", {
    email,
    ...(redirectTo ? { redirect_to: redirectTo } : {}),
  });
  if (invited.status === 200) {
    console.log(`Invite email sent to ${email}.`);
    console.log("The recipient finishes signup through the link in the email.");
  } else {
    console.error(`Failed to send invite: HTTP ${invited.status} ${JSON.stringify(invited.data)}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
