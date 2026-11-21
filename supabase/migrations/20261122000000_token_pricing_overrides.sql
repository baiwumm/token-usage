-- Curated pricing overlay (contract §2.16, 2026-11-22;
-- docs/cli-contract.md §2.16 / §3 item 17, docs/deploy-guide.md pricing section).
--
-- One row per curated pricing entry, edited directly by the instance owner
-- (no management API — the write face is plain SQL on this table). The route
-- GET /api/functions/token-usage-pricing reads the table via service_role and
-- serves the assembled document in the same shape as the CLI's bundled
-- curated-overrides.json, so collection machines pick up price corrections on
-- their next sync instead of waiting for a CLI release. An empty table means
-- "no overlay": the endpoint answers overlay:null and clients behave exactly
-- as they did before this table existed.
--
-- Section semantics mirror the bundled curated document:
--   exact        — model_key → rates object (input/output required, USD per
--                  million tokens; cache_read/cache_write/note optional)
--   alias        — model_key → canonical exact key (value: JSON string)
--   fuzzy        — model_key = the match substring, value = {"ref": exact key}
--   source_exact — source (non-empty) + model_key → rates object
--
-- The CHECK constraints are backstops, deliberately no stricter than the
-- route validation: a malformed row must never break the endpoint, it is
-- dropped at read time instead. RLS posture matches the other token_* tables:
-- enabled with ZERO policies, service_role only. Idempotent so the file can
-- be replayed.
--
-- Rollback: drop table if exists public.token_pricing_overrides;

create table if not exists public.token_pricing_overrides (
  section text not null check (section in ('exact', 'alias', 'fuzzy', 'source_exact')),
  model_key text not null check (char_length(model_key) between 1 and 200),
  source text not null default '' check (char_length(source) <= 64),
  value jsonb not null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  primary key (section, model_key, source)
);

alter table public.token_pricing_overrides enable row level security;
