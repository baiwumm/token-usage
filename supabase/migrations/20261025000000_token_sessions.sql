-- Token Usage sessions (docs/rewrite-plan.md §3 / §3.1, M5.6).
--
-- Device-level session metadata only: source, opaque session id, timestamps,
-- basename project key, token splits and a per-model token breakdown. No
-- prompts, message bodies, titles, absolute paths or resume commands are ever
-- stored (docs/cli-contract.md §2.4 / §2.7).
--
-- Last-wins is strict on ended_at: a replay whose ended_at is not greater than
-- the stored value must not overwrite a newer snapshot. The atomic RPC
-- token_upsert_sessions below is the only writer used by the ingest route.
--
-- RLS posture matches the other token_* tables: enabled with ZERO policies,
-- service_role only. Idempotent so the file can be replayed.

-- ---------------------------------------------------------------------------
-- token_sessions — one row per (device, source, session_id).
-- ---------------------------------------------------------------------------

create table if not exists public.token_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null references public.token_devices(id) on delete cascade,
  source text not null check (char_length(source) between 1 and 100),
  session_id text not null check (char_length(session_id) between 1 and 256),
  project_key text check (project_key is null or char_length(project_key) <= 120),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  input_tokens bigint not null check (input_tokens >= 0),
  cached_input_tokens bigint not null check (cached_input_tokens >= 0),
  cache_creation_input_tokens bigint not null check (cache_creation_input_tokens >= 0),
  output_tokens bigint not null check (output_tokens >= 0),
  reasoning_output_tokens bigint not null check (reasoning_output_tokens >= 0),
  total_tokens bigint not null check (total_tokens >= 0),
  billable_total_tokens bigint check (billable_total_tokens is null or billable_total_tokens >= 0),
  models jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (user_id, device_id, source, session_id),
  check (ended_at >= started_at),
  check (
    total_tokens
    = input_tokens + cached_input_tokens + cache_creation_input_tokens + output_tokens
  ),
  check (jsonb_typeof(models) = 'array' and jsonb_array_length(models) <= 32),
  -- cursor / trae-cn are account-level sources; Sessions is device-level only.
  check (lower(source) not in ('cursor', 'trae-cn'))
);

create index if not exists token_sessions_user_ended_idx
  on public.token_sessions(user_id, ended_at desc);

create index if not exists token_sessions_user_device_ended_idx
  on public.token_sessions(user_id, device_id, ended_at desc);

create index if not exists token_sessions_user_source_ended_idx
  on public.token_sessions(user_id, source, ended_at desc);

create index if not exists token_sessions_user_project_idx
  on public.token_sessions(user_id, project_key);

-- ---------------------------------------------------------------------------
-- token_upsert_sessions — atomic conditional upsert (strict last-wins).
--
-- p_sessions is the normalized JSON array from the ingest route; every entry
-- has already passed docs/cli-contract.md §2.4 validation. Returns
-- {upserted, skipped} where skipped counts rows that lost the ended_at
-- comparison (old snapshots and equal-time replays).
-- ---------------------------------------------------------------------------

create or replace function public.token_upsert_sessions(
  p_user_id uuid,
  p_device_id uuid,
  p_sessions jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_upserted integer;
begin
  if p_sessions is null or jsonb_typeof(p_sessions) <> 'array' then
    return jsonb_build_object('upserted', 0, 'skipped', 0);
  end if;

  v_total := jsonb_array_length(p_sessions);

  with incoming as (
    select
      p_user_id as user_id,
      p_device_id as device_id,
      entry->>'source' as source,
      entry->>'session_id' as session_id,
      nullif(entry->>'project_key', '') as project_key,
      (entry->>'started_at')::timestamptz as started_at,
      (entry->>'ended_at')::timestamptz as ended_at,
      (entry->>'input_tokens')::bigint as input_tokens,
      (entry->>'cached_input_tokens')::bigint as cached_input_tokens,
      (entry->>'cache_creation_input_tokens')::bigint as cache_creation_input_tokens,
      (entry->>'output_tokens')::bigint as output_tokens,
      (entry->>'reasoning_output_tokens')::bigint as reasoning_output_tokens,
      (entry->>'total_tokens')::bigint as total_tokens,
      nullif(entry->>'billable_total_tokens', '')::bigint as billable_total_tokens,
      coalesce(entry->'models', '[]'::jsonb) as models
    from jsonb_array_elements(p_sessions) as entry
  ),
  upserted as (
    insert into public.token_sessions (
      user_id,
      device_id,
      source,
      session_id,
      project_key,
      started_at,
      ended_at,
      input_tokens,
      cached_input_tokens,
      cache_creation_input_tokens,
      output_tokens,
      reasoning_output_tokens,
      total_tokens,
      billable_total_tokens,
      models
    )
    select
      user_id,
      device_id,
      source,
      session_id,
      project_key,
      started_at,
      ended_at,
      input_tokens,
      cached_input_tokens,
      cache_creation_input_tokens,
      output_tokens,
      reasoning_output_tokens,
      total_tokens,
      billable_total_tokens,
      models
    from incoming
    on conflict (user_id, device_id, source, session_id)
    do update set
      project_key = excluded.project_key,
      started_at = excluded.started_at,
      ended_at = excluded.ended_at,
      input_tokens = excluded.input_tokens,
      cached_input_tokens = excluded.cached_input_tokens,
      cache_creation_input_tokens = excluded.cache_creation_input_tokens,
      output_tokens = excluded.output_tokens,
      reasoning_output_tokens = excluded.reasoning_output_tokens,
      total_tokens = excluded.total_tokens,
      billable_total_tokens = excluded.billable_total_tokens,
      models = excluded.models,
      updated_at = clock_timestamp()
    where excluded.ended_at > public.token_sessions.ended_at
    returning 1
  )
  select count(*) into v_upserted from upserted;

  return jsonb_build_object(
    'upserted', v_upserted,
    'skipped', v_total - v_upserted
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Lockdown.
-- ---------------------------------------------------------------------------

alter table public.token_sessions enable row level security;

revoke all on public.token_sessions from public, anon, authenticated;
grant all on public.token_sessions to service_role;

revoke all on function public.token_upsert_sessions(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.token_upsert_sessions(uuid, uuid, jsonb)
  to service_role;

comment on table public.token_sessions is
  'Device-level session metadata uploaded by the collector CLI. Strict ended_at last-wins; no prompts, bodies, titles or paths.';
