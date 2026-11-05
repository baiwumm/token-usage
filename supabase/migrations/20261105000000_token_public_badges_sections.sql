-- Public page enhancement toggles (docs/badge.md §3.5, P9).
--
-- Two opt-in switches for /u/<token>: a full-history daily heatmap and the
-- unlocked-achievement wall. Both default to false so existing installs keep
-- exactly the aggregate-only exposure they had before the 2026-11-05 privacy
-- ruling — the operator has to turn each one on explicitly.
--
-- The table's RLS posture stays untouched: zero policies, service_role only,
-- browser has no direct access. Idempotent so the file can be replayed.

alter table public.token_public_badges
  add column if not exists show_heatmap boolean not null default false,
  add column if not exists show_achievements boolean not null default false;

comment on column public.token_public_badges.show_heatmap is
  'Opt-in: expose full-history daily aggregate token counts on /u/<token> (docs/badge.md §3.5).';
comment on column public.token_public_badges.show_achievements is
  'Opt-in: expose unlocked achievement id/tier/achieved date on /u/<token> (docs/badge.md §3.5).';
