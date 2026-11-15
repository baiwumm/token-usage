-- Account snapshot incremental watermarks (2026-11-15): loadAccountUsage
-- polls token_usage_hourly / token_account_session_states for rows whose
-- updated_at moved past the in-process watermark (docs/desktop-plan mirror:
-- the read face polls every TTL window). The per-user updated_at index keeps
-- each incremental probe an index scan instead of a user-scoped heap pass;
-- rows are never deleted (append-only last-wins), so the watermark can only
-- move forward.

create index if not exists token_usage_hourly_user_updated_idx
  on public.token_usage_hourly(user_id, updated_at);

create index if not exists token_account_session_states_user_updated_idx
  on public.token_account_session_states(user_id, updated_at);
