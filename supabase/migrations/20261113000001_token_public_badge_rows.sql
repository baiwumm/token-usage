-- Public badge model v2 (docs/badge.md §3, operator call 2026-11-13).
--
-- Two tables, both service-role only with zero RLS policies (same posture as
-- every other token_* table — the browser never talks to Postgres):
--
--   token_public_badge_settings  one row per user: master switch, public name
--                                snapshot, owner timezone (active-day
--                                bucketing) and the project allowlist.
--   token_public_badges          one row per badge: the token itself, its
--                                display defaults (style/theme/range/project)
--                                and the revocation timestamp.
--
-- The token is stored in plaintext on purpose (2026-11-13 decision): it is a
-- public identifier printed in READMEs, and hashing it only bought the
-- operator "I can never see my own link again". The database already holds
-- every aggregate the badge renders, so a leaked dump gains nothing from it.
-- Entropy is unchanged: tu_badge_ + 32 base64url chars from 24 CSPRNG bytes.
--
-- Supersedes 20261101000000_token_public_badges.sql (dropped by the previous
-- file) and folds in the retired show_heatmap / show_achievements columns,
-- which no longer exist anywhere.

create table if not exists public.token_public_badge_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false,
  display_name text not null default '' check (char_length(display_name) <= 80),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  allowed_projects jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  check (jsonb_typeof(allowed_projects) = 'array'
         and jsonb_array_length(allowed_projects) <= 32)
);

create table if not exists public.token_public_badges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique
    check (token ~ '^tu_badge_[A-Za-z0-9_-]{32}$'),
  label text not null default '' check (char_length(label) <= 40),
  style text not null default 'panel'
    check (style in ('panel', 'compact', 'sparkline')),
  theme text not null default 'auto'
    check (theme in ('dark', 'light', 'auto')),
  range text not null default 'all'
    check (range in ('all', '30d')),
  project text check (project is null or char_length(project) between 1 and 120),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  revoked_at timestamptz
);

create index if not exists token_public_badges_user_idx
  on public.token_public_badges (user_id, created_at);

-- Element-level validation of allowed_projects (normalizeProjectKey, ≤120
-- chars, ≤32 items) stays in the /api/app/badge route: PostgreSQL CHECK
-- constraints cannot contain subqueries.
alter table public.token_public_badge_settings enable row level security;
alter table public.token_public_badges enable row level security;
