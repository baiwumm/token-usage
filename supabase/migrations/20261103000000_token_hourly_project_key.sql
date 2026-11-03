-- contract v2 (2026-11-03, docs/cli-contract.md §2.4): usage buckets gain an
-- optional project dimension. token_usage_hourly.project_key joins the
-- identity; the unattributed form is the EMPTY STRING because a primary-key
-- column cannot be NULL (token_sessions.project_key keeps NULL — the
-- difference is deliberate). Old rows default to '' = unattributed; no
-- numeric values are recomputed.
--
-- Rollback:
--   alter table public.token_usage_hourly
--     drop constraint token_usage_hourly_pkey;
--   alter table public.token_usage_hourly
--     add primary key (user_id, device_id, hour_start, source, model);
--   alter table public.token_usage_hourly drop column project_key;

alter table public.token_usage_hourly
  add column if not exists project_key text not null default '';

comment on column public.token_usage_hourly.project_key is
  'contract v2 (2026-11-03): project basename the bucket belongs to; '' = unattributed. Part of the last-wins upsert identity.';

alter table public.token_usage_hourly
  drop constraint token_usage_hourly_pkey;

alter table public.token_usage_hourly
  add primary key (user_id, device_id, hour_start, source, model, project_key);

-- Consistency check for the operator to run right after migrating (both sides
-- must print identical totals; project split must not change any aggregate):
--   select sum(total_tokens), count(*) from public.token_usage_hourly;
