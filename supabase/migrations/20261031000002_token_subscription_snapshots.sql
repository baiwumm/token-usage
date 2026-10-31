-- Token Usage subscription snapshots (docs/cli-contract.md §2.13 / §2.14,
-- 2026-10-31 P2 一期).
--
-- One row per (user, source): the LATEST balance snapshot the device reported
-- for a subscription-based tool (plan label, credit pools, usage windows).
-- There is deliberately NO history — the upsert overwrites, keeping the table
-- tiny and avoiding long-term schema debt against 16 drifting vendor shapes.
-- Balances are display-only: never merged into token columns or cost, never
-- reconciled.
--
-- Privacy whitelist (§2.13): plan label, balance/percent numbers, units and
-- reset times — no message content, paths or credentials (those never leave
-- the device).
--
-- RLS posture matches the other token_* tables: enabled with ZERO policies,
-- service_role only. Idempotent so the file can be replayed.

create table if not exists public.token_subscription_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null check (char_length(source) between 1 and 100),
  plan text check (plan is null or char_length(plan) between 1 and 100),
  pools jsonb not null default '[]'::jsonb check (jsonb_typeof(pools) = 'array'),
  windows jsonb not null default '[]'::jsonb check (jsonb_typeof(windows) = 'array'),
  captured_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (user_id, source)
);

alter table public.token_subscription_snapshots enable row level security;

revoke all on public.token_subscription_snapshots from public, anon, authenticated;
grant all on public.token_subscription_snapshots to service_role;

comment on table public.token_subscription_snapshots is
  'Latest subscription balance snapshot per (user, source): plan label, credit pools, usage windows. Overwritten on every report — no history. Display-only; never merged into token columns or cost.';
