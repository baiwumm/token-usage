-- Token Usage sync runs (docs/cli-contract.md §2.11 / §2.12, 0.2.0).
--
-- One row per collector sync run — empty runs included: trigger, result,
-- server-derived duration/empty flags and the run's counters. run_id is the
-- client-generated idempotency key: a replay after a lost response upserts on
-- (user_id, device_id, run_id) and must answer duplicate:true instead of
-- producing a second row, so the unique constraint below is part of the
-- contract, not an optimization.
--
-- Privacy whitelist (§2.11): aggregate counters, enums and version strings
-- only — no paths, project names, session ids or error stacks.
--
-- RLS posture matches the other token_* tables: enabled with ZERO policies,
-- service_role only. Idempotent so the file can be replayed.

create table if not exists public.token_sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.token_devices(id) on delete cascade,
  run_id text not null check (char_length(run_id) between 1 and 128),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- Server-derived (§2.11): ended_at - started_at, never client-reported.
  duration_ms bigint not null check (duration_ms >= 0),
  trigger text not null check (trigger in ('scheduled', 'manual', 'watch', 'notify')),
  result text not null check (result in ('ok', 'partial', 'error')),
  error_code text check (error_code is null or char_length(error_code) between 1 and 64),
  -- Server-derived (§2.11): tokens_ingested = 0 and sessions_uploaded = 0.
  empty boolean not null default false,
  parsed_files bigint not null check (parsed_files >= 0),
  buckets_uploaded bigint not null check (buckets_uploaded >= 0),
  tokens_ingested bigint not null check (tokens_ingested >= 0),
  sessions_uploaded bigint not null check (sessions_uploaded >= 0),
  sessions_skipped bigint not null check (sessions_skipped >= 0),
  queue_bytes bigint check (queue_bytes is null or queue_bytes >= 0),
  cli_version text not null check (char_length(cli_version) between 1 and 32),
  os text check (os is null or char_length(os) between 1 and 64),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, device_id, run_id),
  check (ended_at >= started_at)
);

create index if not exists token_sync_runs_user_started_idx
  on public.token_sync_runs(user_id, started_at desc);

alter table public.token_sync_runs enable row level security;

revoke all on public.token_sync_runs from public, anon, authenticated;
grant all on public.token_sync_runs to service_role;

comment on table public.token_sync_runs is
  'One collector sync run per row (empty runs included). run_id is the client idempotency key on (user_id, device_id, run_id); duration_ms and empty are server-derived. Aggregate telemetry only — no paths, project names or session ids.';
