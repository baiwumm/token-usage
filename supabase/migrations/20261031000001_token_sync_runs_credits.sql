-- Token Usage sync-run credits telemetry (docs/cli-contract.md §2.11 / §2.12,
-- 2026-10-31). credits_ingested mirrors tokens_ingested's client-reported
-- semantics: the sum of the credits the run's ingest buckets carried. It is
-- advisory telemetry — a larger replay may last-wins-override those buckets,
-- so the figure never participates in reconciliation. Old CLIs omit the
-- field; the column defaults to 0.
--
-- RLS posture matches the other token_* tables (zero policies, service_role
-- only). Idempotent so the file can be replayed.

alter table public.token_sync_runs
  add column if not exists credits_ingested numeric not null default 0
    check (credits_ingested >= 0);

comment on column public.token_sync_runs.credits_ingested is
  'Client-reported sum of the credits this run''s ingest buckets carried (advisory telemetry, display-only dimension; never reconciled).';
