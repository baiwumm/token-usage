// Shared fixtures + helpers for the contract golden tests. All credentials,
// tokens and ids here are fabricated test values — never real secrets.

import { FakeSupabase, type Row } from "../helpers/fake-supabase";
import { sha256Hex } from "@/lib/device-codes";

export const USER_ID = "11111111-1111-4111-8111-111111111111";
export const USER_EMAIL = "owner@example.test";
export const DEVICE_A = "22222222-2222-4222-8222-222222222222";
export const DEVICE_B = "33333333-3333-4333-8333-333333333333";
export const DEVICE_REVOKED = "44444444-4444-4444-8444-444444444444";

export const TOKEN_A = "aaaaaaaa-fake-device-token-for-pc-a";
export const TOKEN_B = "bbbbbbbb-fake-device-token-for-pc-b";
export const TOKEN_REVOKED = "cccccccc-fake-device-token-revoked";
// Active token whose DEVICE is revoked — exercises the 403 "Device is revoked"
// branch (a revoked TOKEN 401s before the device is even consulted).
export const TOKEN_ON_REVOKED_DEVICE = "dddddddd-fake-active-token-on-revoked-device";
export const JWT = "eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxMTExMTExMS0xMTExLTQxMTEtODExMS0xMTExMTExMTExMTEifQ.fakesig";

// Unpriced model keeps aggregation math cost-free unless a test says otherwise.
export const RAW_MODEL = "test-unpriced-model";

export function jsonRequest(
  url: string,
  options: { method?: string; body?: unknown; token?: string | null } = {},
): Request {
  const { method = "POST", body, token } = options;
  return new Request(url, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

export function rawRequest(url: string, options: { method?: string; body?: string; token?: string | null } = {}): Request {
  const { method = "POST", body, token } = options;
  return new Request(url, {
    method,
    headers: {
      ...(body != null ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body != null ? { body } : {}),
  });
}

export function base(slug: string): string {
  return `http://localhost/api/functions/token-usage-${slug}`;
}

/** Populate the fake database with a deterministic cross-device scenario. */
export function seedScenario(fake: FakeSupabase): void {
  fake.authUsers.clear();
  fake.authUsers.set(JWT, { id: USER_ID, email: USER_EMAIL });

  fake.table("token_devices").push(
    {
      id: DEVICE_A,
      user_id: USER_ID,
      device_name: "PC One #aaaa1111",
      platform: "cli-device-flow",
      machine_id: "machine-aaaa-1111",
      machine_cluster_id: "machine-aaaa-1111",
      revoked_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-01T00:00:00.000Z",
    },
    {
      id: DEVICE_B,
      user_id: USER_ID,
      device_name: "PC Two #bbbb2222",
      platform: "cli-device-flow",
      machine_id: "machine-bbbb-2222",
      machine_cluster_id: "machine-bbbb-2222",
      revoked_at: null,
      created_at: "2026-02-01T00:00:00.000Z",
      updated_at: "2026-02-01T00:00:00.000Z",
    },
    {
      id: DEVICE_REVOKED,
      user_id: USER_ID,
      device_name: "Old Laptop #cccc3333",
      platform: "cli-device-flow",
      machine_id: "machine-cccc-3333",
      machine_cluster_id: "machine-cccc-3333",
      revoked_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-01-15T00:00:00.000Z",
      updated_at: "2026-03-01T00:00:00.000Z",
    },
  );

  fake.table("token_device_tokens").push(
    {
      id: "55555555-5555-4555-8555-555555555555",
      user_id: USER_ID,
      device_id: DEVICE_A,
      token_hash: sha256Hex(TOKEN_A),
      revoked_at: null,
      created_at: "2026-01-01T00:00:00.000Z",
      last_used_at: "2026-10-01T00:00:00.000Z",
    },
    {
      id: "66666666-6666-4666-8666-666666666666",
      user_id: USER_ID,
      device_id: DEVICE_B,
      token_hash: sha256Hex(TOKEN_B),
      revoked_at: null,
      created_at: "2026-02-01T00:00:00.000Z",
      last_used_at: null,
    },
    {
      id: "77777777-7777-4777-8777-777777777777",
      user_id: USER_ID,
      device_id: DEVICE_REVOKED,
      token_hash: sha256Hex(TOKEN_REVOKED),
      revoked_at: "2026-03-01T00:00:00.000Z",
      created_at: "2026-01-15T00:00:00.000Z",
      last_used_at: "2026-02-28T00:00:00.000Z",
    },
    {
      id: "88888888-8888-4888-8888-888888888888",
      user_id: USER_ID,
      device_id: DEVICE_REVOKED,
      token_hash: sha256Hex(TOKEN_ON_REVOKED_DEVICE),
      revoked_at: null,
      created_at: "2026-01-16T00:00:00.000Z",
      last_used_at: null,
    },
  );

  const hourly = fake.table("token_usage_hourly");
  const row = (over: Row): Row => ({
    user_id: USER_ID,
    device_id: DEVICE_A,
    hour_start: "2026-10-21T00:00:00.000Z",
    source: "codex",
    model: RAW_MODEL,
    input_tokens: 1000,
    cached_input_tokens: 0,
    cache_creation_input_tokens: 0,
    output_tokens: 500,
    reasoning_output_tokens: 0,
    total_tokens: 1500,
    billable_total_tokens: null,
    conversations: 1,
    total_cost_usd: 0,
    updated_at: "2026-10-21T01:00:00.000Z",
    ...over,
  });

  // Machine-level rows on device A.
  hourly.push(
    row({ hour_start: "2026-10-21T00:00:00.000Z", source: "codex", model: RAW_MODEL, total_tokens: 1500, input_tokens: 1000, output_tokens: 500 }),
    row({ hour_start: "2026-10-21T02:00:00.000Z", source: "claude-code", model: RAW_MODEL, total_tokens: 700, input_tokens: 400, output_tokens: 300, conversations: 2 }),
    // A grok row with an authoritative provider-reported cost.
    row({ hour_start: "2026-10-21T03:00:00.000Z", source: "grok", model: "grok-code-fast-1", total_tokens: 2000, input_tokens: 2000, output_tokens: 0, total_cost_usd: 0.5 }),
  );

  // Identical cursor rows on BOTH devices — account-level, must dedupe to one.
  hourly.push(
    row({ device_id: DEVICE_A, hour_start: "2026-10-21T05:00:00.000Z", source: "cursor", model: "composer-1", total_tokens: 900, input_tokens: 900, output_tokens: 0, updated_at: "2026-10-21T06:00:00.000Z" }),
    row({ device_id: DEVICE_B, hour_start: "2026-10-21T05:00:00.000Z", source: "cursor", model: "composer-1", total_tokens: 900, input_tokens: 900, output_tokens: 0, updated_at: "2026-10-21T06:30:00.000Z" }),
  );

  // trae-cn hourly rows are ignored in canonical aggregation (session states
  // replace them), on a revoked device as well.
  hourly.push(
    row({ device_id: DEVICE_B, hour_start: "2026-10-21T07:00:00.000Z", source: "trae-cn", model: RAW_MODEL, total_tokens: 424242 }),
    row({ device_id: DEVICE_REVOKED, hour_start: "2026-10-21T08:00:00.000Z", source: "machine-src", model: RAW_MODEL, total_tokens: 11111 }),
  );

  fake.table("token_account_session_states").push({
    user_id: USER_ID,
    source: "trae-cn",
    session_id: "session-cn-1",
    model: RAW_MODEL,
    bucket_start: "2026-10-21T07:00:00.000Z",
    snapshot_verified_at: "2026-10-21T08:00:00.000Z",
    input_tokens: 300,
    cached_input_tokens: 100,
    cache_creation_input_tokens: 50,
    output_tokens: 150,
    reasoning_output_tokens: 10,
    total_tokens: 600,
  });

  const codes = fake.table("token_device_codes");
  codes.push(
    {
      device_code: "a".repeat(64),
      user_code: "AAAA-BBBB",
      status: "pending",
      user_id: null,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      approved_at: null,
      client_info: "tokentracker 1.4.0 PC One",
      machine_id: "machine-new-9999",
      created_at: "2026-10-24T00:00:00.000Z",
    },
    {
      device_code: "b".repeat(64),
      user_code: "CCCC-DDDD",
      status: "approved",
      user_id: USER_ID,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      approved_at: "2026-10-24T00:01:00.000Z",
      client_info: "tokentracker 1.4.0 PC Two",
      machine_id: "machine-dddd-4444",
      created_at: "2026-10-24T00:00:00.000Z",
    },
    {
      device_code: "c".repeat(64),
      user_code: "EEEE-FFFF",
      status: "pending",
      user_id: null,
      expires_at: "2026-01-01T00:00:00.000Z",
      approved_at: null,
      client_info: null,
      machine_id: null,
      created_at: "2026-01-01T00:00:00.000Z",
    },
  );
}

/** Standard env setup for handler-level contract tests. */
export function initContractEnv(fakeUrl: string): void {
  // Current Supabase key system; legacy names are scrubbed so the new-name
  // precedence is what every contract test actually exercises.
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_ANON_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = fakeUrl;
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "fake-publishable-key";
  process.env.SUPABASE_SECRET_KEY = "fake-secret-key";
  process.env.TOKEN_USAGE_DASHBOARD_URL = "http://dashboard.test";
  // Tests reseed the fake backend between cases; the read-face snapshot cache
  // must not outlive a reseed.
  process.env.TOKEN_USAGE_USAGE_CACHE = "off";
  process.env.TOKEN_USAGE_SESSION_CACHE = "off";
}
