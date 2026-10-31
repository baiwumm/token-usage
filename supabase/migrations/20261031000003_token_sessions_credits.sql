-- Token Usage session-level credits (docs/cli-contract.md §2.4, 2026-10-31).
--
-- Credit-based providers (Qoder) report per-session credit sums alongside the
-- token columns. credits is a display-only dimension: it never feeds the
-- total_tokens identity, the models sum check or cost. Old CLIs omit the
-- field — the column defaults to 0.
--
-- token_upsert_sessions is replaced to carry the new field through the atomic
-- conditional upsert. The strict ended_at last-wins rule is untouched: old
-- snapshots never rewrite, so historical sessions keep 0.
--
-- RLS posture matches the other token_* tables (zero policies, service_role
-- only). Idempotent so the file can be replayed.

alter table public.token_sessions
  add column if not exists credits numeric not null default 0
    check (credits >= 0);

comment on column public.token_sessions.credits is
  'Vendor credit/point consumption reported for this session (display-only dimension, e.g. Qoder Credits). Never merged into token columns or cost; defaults to 0 for old clients.';

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
      coalesce((entry->'credits')::numeric, 0) as credits,
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
      credits,
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
      credits,
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
      credits = excluded.credits,
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

revoke all on function public.token_upsert_sessions(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.token_upsert_sessions(uuid, uuid, jsonb)
  to service_role;
