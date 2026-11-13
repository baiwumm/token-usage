-- Badge label tightened to 20 characters (operator call, 2026-11-14).
--
-- The label is the badge's name now: it is set through the shared add/edit
-- dialog and required there, so the 40-character cap from
-- 20261113000001_token_public_badge_rows.sql shrinks to 20. Live rows are all
-- short (the model is a day old), so the tighter CHECK cannot fail.
-- Replay-safe: the constraint is dropped before re-adding.

alter table public.token_public_badges
  drop constraint if exists token_public_badges_label_check;

alter table public.token_public_badges
  add constraint token_public_badges_label_check
  check (char_length(label) <= 20);
