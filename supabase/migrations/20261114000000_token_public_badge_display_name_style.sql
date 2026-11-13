-- Badge display tweaks (operator feedback, 2026-11-14): the public name
-- shrinks to 30 characters and new badges default to the sparkline style.
--
-- 20261113000001_token_public_badge_rows.sql shipped ≤80 / default 'panel';
-- both values only ever served this model, so tightening them in place is a
-- no-data-loss change (the model went live the day before and holds no
-- oversized rows). Replay-safe: the constraint is dropped before re-adding,
-- and ALTER COLUMN ... SET DEFAULT is naturally idempotent.

alter table public.token_public_badge_settings
  drop constraint if exists token_public_badge_settings_display_name_check;

alter table public.token_public_badge_settings
  add constraint token_public_badge_settings_display_name_check
  check (char_length(display_name) <= 30);

alter table public.token_public_badges
  alter column style set default 'sparkline';
