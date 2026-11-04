-- Read-time pricing semantics (2026-11-04, docs/projects-page-plan.md §5):
-- CLI-written buckets store total_cost_usd = 0 as a sentinel; the real amount is
-- derived at read time by computeRowCost() (curated overrides + LiteLLM snapshot).
-- Only sources with an authoritative vendor-reported cost (grok / cline) may
-- carry a positive stored value, and that value wins at read time too.
--
-- Consequence for operators: reconciliation scripts must NOT sum this column —
-- a stored-only sum reads as 0 (or as a partial vendor-only figure). Use
-- total_tokens / billable_total_tokens for reconciliation, or compute cost
-- through the same read-time pricing path as the dashboard.
--
-- Rollback: comment on column public.token_usage_hourly.total_cost_usd is null;

comment on column public.token_usage_hourly.total_cost_usd is
  'Sentinel: CLI-written buckets store 0; real cost is derived at read time (computeRowCost: curated + LiteLLM pricing). Only authoritative vendor-reported costs (grok/cline) may be positive. Do not sum this column for reconciliation.';
