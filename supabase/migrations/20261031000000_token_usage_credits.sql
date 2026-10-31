-- Token Usage credits column (docs/cli-contract.md §2.4, 2026-10-31 P1;
-- docs/sources-capture-audit.md §2).
--
-- Vendor credits (e.g. Qoder Credits) are a display-only dimension carried by
-- credit-based providers whose local logs no longer expose token counts. They
-- are NEVER merged into any token column, billable totals or cost: the
-- two-plane rule keeps tokens and credits separate. The bucket upsert is
-- full-row last-wins, so a replay from a client that omits credits resets the
-- column to 0 — that semantics is part of the contract.
--
-- Floats (e.g. 0.642 per request) round to 6 decimals at ingest; the row cap
-- (1,000,000) lives in the ingest validator, not in the schema.
--
-- RLS posture matches the other token_* tables (zero policies, service_role
-- only); the column inherits the table's posture, so no grant changes here.

alter table public.token_usage_hourly
  add column if not exists credits numeric not null default 0 check (credits >= 0);

comment on column public.token_usage_hourly.credits is
  'Vendor credit/point consumption (display-only dimension, e.g. Qoder Credits). Never merged into token columns or cost; reset to 0 by last-wins replays that omit it.';
