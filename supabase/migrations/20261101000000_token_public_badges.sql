-- Token Usage public badge config (docs/badge.md §3).
--
-- One row per user: the SHA-256 hash of the public badge token, the enable
-- flag, a display-name snapshot, the owner's IANA timezone (active-day
-- bucketing, docs/badge.md §4.3) and the project_key allowlist for repo
-- badges. The raw token is never stored — generation returns it once and only
-- the hash lands here, so a database leak cannot mint working badges.
-- token_last4 keeps the plaintext's final four characters for the settings
-- page (GET tokenLast4, docs/badge.md §7.1): sha256 is not reversible, so the
-- suffix must be persisted at generation time (P2 revision 2026-11-02, pinned
-- by tests/contract/badge.test.ts).
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
  token_last4 text
    check (token_last4 is null or char_length(token_last4) = 4),
  enabled boolean not null default false,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  allowed_projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(allowed_projects) = 'array'
         and jsonb_array_length(allowed_projects) <= 32)
);

-- Upgrade path for installs that created the table before token_last4 existed
-- (P2 revision 2026-11-02): create-if-not-exists alone would skip the column
-- on replay.
alter table public.token_public_badges add column if not exists token_last4 text;

alter table public.token_public_badges
  drop constraint if exists token_public_badges_token_last4_check;
alter table public.token_public_badges add constraint token_public_badges_token_last4_check
  check (token_last4 is null or char_length(token_last4) = 4);

-- ---------------------------------------------------------------------------
-- Lockdown.
-- ---------------------------------------------------------------------------

alter table public.token_public_badges enable row level security;

revoke all on public.token_public_badges from public, anon, authenticated;
grant all on public.token_public_badges to service_role;

comment on table public.token_public_badges is
  'Public badge config per user (docs/badge.md §3): token hash plus its last four characters only (raw token never stored), enable flag, display-name snapshot, owner timezone and the project_key allowlist for repo badges.';
