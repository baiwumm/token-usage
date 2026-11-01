-- Token Usage public badge config (docs/badge.md §3).
--
-- One row per user: the SHA-256 hash of the public badge token, the enable
-- flag, a display-name snapshot, the owner's IANA timezone (active-day
-- bucketing, docs/badge.md §4.3) and the project_key allowlist for repo
-- badges. The raw token is never stored — generation returns it once and only
-- the hash lands here, so a database leak cannot mint working badges.
-- allowed_projects element validation (normalizeProjectKey, length ≤120,
-- ≤32 items) lives in the /api/app/badge route: PostgreSQL CHECK constraints
-- cannot contain subqueries.
--
-- RLS posture matches the other token_* tables: enabled with ZERO policies,
-- service_role only. Idempotent so the file can be replayed.

create table if not exists public.token_public_badges (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text unique
    check (token_hash is null or char_length(token_hash) = 64),
  enabled boolean not null default false,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  allowed_projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(allowed_projects) = 'array'
         and jsonb_array_length(allowed_projects) <= 32)
);

-- ---------------------------------------------------------------------------
-- Lockdown.
-- ---------------------------------------------------------------------------

alter table public.token_public_badges enable row level security;

revoke all on public.token_public_badges from public, anon, authenticated;
grant all on public.token_public_badges to service_role;

comment on table public.token_public_badges is
  'Public badge config per user (docs/badge.md §3): token hash only (raw token never stored), enable flag, display-name snapshot, owner timezone and the project_key allowlist for repo badges.';
