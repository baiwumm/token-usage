-- Token Usage achievements seen watermark (docs/achievements-plan.md P3).
--
-- One row per user: the latest local day whose unlocks the user has already
-- seen. Achievements themselves stay read-time computed — nothing about the
-- achievement catalog, tiers or dates is stored here. The row only lets the
-- "new" badge and the unlock toast follow the account across devices instead
-- of a per-browser localStorage marker.
--
-- RLS posture matches the other token_* tables: enabled with ZERO policies,
-- service_role only. Idempotent so the file can be replayed.

create table if not exists public.token_achievement_seen (
  user_id uuid primary key references auth.users(id) on delete cascade,
  seen_through date not null check (seen_through >= date '2000-01-01'),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp()
);

alter table public.token_achievement_seen enable row level security;

revoke all on public.token_achievement_seen from public, anon, authenticated;
grant all on public.token_achievement_seen to service_role;

comment on table public.token_achievement_seen is
  'Per-user achievements seen watermark (local day, monotonic max). Read state only — achievements remain read-time computed. Service-role only, zero policies.';
