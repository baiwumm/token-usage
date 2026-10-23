-- Token Usage core tables (docs/rewrite-plan.md §3).
--
-- Mapping from the retired self-host schema: tokentracker_* → token_* one to
-- one, and the 1:1 tokentracker_device_machine table is folded into
-- token_devices.machine_cluster_id. Upsert keys and last-wins semantics are
-- carried over verbatim — they are the reconciliation baseline
-- (docs/cli-contract.md §2.4).
--
-- RLS posture: every table enables row level security with ZERO policies, so
-- anon/authenticated are denied everything; only service_role (route.ts) may
-- read or write. The browser never talks to these tables directly.
--
-- Idempotent: every statement is IF NOT EXISTS / GRANT / REVOKE, so the file
-- can be replayed. Apply with `supabase db push` (or the SQL editor).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- token_devices — one row per enrolled machine, soft-revocable.
-- ---------------------------------------------------------------------------

create table if not exists public.token_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_name text not null,
  platform text,
  machine_id text,
  machine_cluster_id text,
  revoked_at timestamptz,
  name_customized boolean not null default false,
  default_device_name text,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

-- Active devices only: a revoked row must never block re-pairing the same
-- machine or reusing a name (the pair flow relies on these 409s to retry).
create unique index if not exists token_devices_machine_unique
  on public.token_devices(user_id, machine_id)
  where revoked_at is null;

create unique index if not exists token_devices_active_unique
  on public.token_devices(user_id, platform, device_name)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- token_device_tokens — SHA-256 hashes only; plaintext never stored.
-- ---------------------------------------------------------------------------

create table if not exists public.token_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.token_devices(id) on delete cascade,
  token_hash text not null unique,
  revoked_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  last_used_at timestamptz
);

create index if not exists token_device_tokens_device_idx
  on public.token_device_tokens(device_id, revoked_at);

-- ---------------------------------------------------------------------------
-- token_device_codes — short-lived CLI pairing codes (device flow).
-- ---------------------------------------------------------------------------

create table if not exists public.token_device_codes (
  device_code text primary key,
  user_code text not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'used', 'expired')),
  user_id uuid references auth.users(id) on delete cascade,
  expires_at timestamptz not null,
  approved_at timestamptz,
  client_info text,
  machine_id text,
  created_at timestamptz not null default clock_timestamp()
);

create index if not exists token_device_codes_status_idx
  on public.token_device_codes(status, expires_at);

-- ---------------------------------------------------------------------------
-- token_usage_hourly — per-device usage buckets.
--
-- Primary key == ingest upsert key. Bucket-granular last-wins (the latest
-- upload per key replaces the row) is the reconciliation baseline against the
-- collector's local queue.jsonl; never change the key or the semantics.
-- ---------------------------------------------------------------------------

create table if not exists public.token_usage_hourly (
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.token_devices(id) on delete cascade,
  hour_start timestamptz not null,
  source text not null,
  model text not null,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null check (cached_input_tokens >= 0),
  cache_creation_input_tokens bigint not null check (cache_creation_input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  reasoning_output_tokens bigint not null check (reasoning_output_tokens >= 0),
  total_tokens bigint not null check (total_tokens >= 0),
  billable_total_tokens bigint check (billable_total_tokens is null or billable_total_tokens >= 0),
  conversations integer not null default 0 check (conversations >= 0),
  total_cost_usd numeric not null default 0 check (total_cost_usd >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, device_id, hour_start, source, model)
);

create index if not exists token_usage_hourly_user_time_idx
  on public.token_usage_hourly(user_id, hour_start);

create index if not exists token_usage_hourly_device_time_idx
  on public.token_usage_hourly(device_id, hour_start);

-- ---------------------------------------------------------------------------
-- token_account_session_states — canonical account-level session snapshots
-- (trae-cn). total_tokens must equal the sum of its component columns.
-- ---------------------------------------------------------------------------

create table if not exists public.token_account_session_states (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null,
  session_id text not null,
  model text not null,
  bucket_start timestamptz not null,
  snapshot_verified_at timestamptz not null,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null check (cached_input_tokens >= 0),
  cache_creation_input_tokens bigint not null check (cache_creation_input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  reasoning_output_tokens bigint not null check (reasoning_output_tokens >= 0),
  total_tokens bigint not null check (total_tokens >= 0),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, source, session_id),
  check (
    total_tokens
    = input_tokens + cached_input_tokens + cache_creation_input_tokens + output_tokens
  )
);

create index if not exists token_account_session_states_time_idx
  on public.token_account_session_states(user_id, bucket_start);

-- ---------------------------------------------------------------------------
-- Lockdown: RLS on, zero policies (anon/authenticated see nothing), the
-- service role keeps full access for route.ts.
-- ---------------------------------------------------------------------------

alter table public.token_devices enable row level security;
alter table public.token_device_tokens enable row level security;
alter table public.token_device_codes enable row level security;
alter table public.token_usage_hourly enable row level security;
alter table public.token_account_session_states enable row level security;

revoke all on public.token_devices,
  public.token_device_tokens,
  public.token_device_codes,
  public.token_usage_hourly,
  public.token_account_session_states
from public, anon, authenticated;

grant all on public.token_devices,
  public.token_device_tokens,
  public.token_device_codes,
  public.token_usage_hourly,
  public.token_account_session_states
to service_role;

comment on table public.token_usage_hourly is
  'UTC usage buckets uploaded by the collector CLI. Upsert key matches the queue bucket key; last-wins is the reconciliation baseline.';
comment on table public.token_device_codes is
  'Short-lived CLI device-login codes. Only service_role may read or mutate.';
